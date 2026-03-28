require('dotenv').config({ path: process.env.DOTENV_PATH || undefined });
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const { sanitize, cleanMentions } = require('./sanitizer');
const { sendMessage, bufferMessage, isChannelActive, isActive, getBufferSize, seedBuffer, setContextProviders } = require('./session-manager');
const {
  parseReactions,
  parseBookmarks,
  parseSendTarget,
  parseFocus,
  isFocusDone,
  parseBacklog,
  parseBacklogDone,
  parseTimerTags,
  parseCancel,
  parseDaily,
  parseDailyDone,
  parseEventProposal,
  parseAttachments,
  parseSpriteTags,
  parseEmbeds,
  parseReplyTo,
  parseAskTag,
  parsePlanTag,
  parseProjectComplete,
  parseProjectFail,
  parseProjectInsight,
  isNoResponse,
  stripTags,
  splitMessage,
  startTyping,
  parseReviewCommand,
} = require('./discord-util');
const projectBoard = require('./project-board');
const { runExecutionTask } = require('./execution-agent');
const { renderToFile } = require('./pixel-art-tool');
const { Scheduler, parseDuration } = require('./scheduler');
const fs = require('fs');
const path = require('path');
const homedir = require('./home');
const { appendToDigest, pruneOldDigests, backfillDigests, buildDigestContent } = require('./channel-digest');
const { loadPersonality } = require('./system-prompt');
const healthReporter = require('./health-reporter');
const https = require('https');
const http = require('http');

// Load agent name at startup for name detection regex
const AGENT_NAME = loadPersonality()?.name || process.env.AGENT_NAME || 'Rhizo';
const PERSONALITY_ID = (process.env.PERSONALITY_ID || 'rhizo').toLowerCase();

// --- Sibling Agent Detection ---
// Allow messages from other Magi agents (by bot user ID) with loop protection
const SIBLING_BOT_IDS = process.env.SIBLING_BOT_IDS
  ? process.env.SIBLING_BOT_IDS.split(',').map(s => s.trim())
  : [];
const MAGI_IDS = ['rhizo', 'mico', 'ecto'];
const AGENT_CHAIN_MAX_MAGI = 1;     // Magi: strict, prevents hallucination spirals
const AGENT_CHAIN_MAX_COWORKER = 3; // Coworkers: allows natural back-and-forth
const agentChainCounters = new Map(); // channelId -> count of consecutive agent messages
const _lastSpokeInChannel = new Map(); // `${personalityId}:${channelId}` -> timestamp
const _lastBotInChannel = new Map(); // channelId -> timestamp (ANY bot, including siblings)
const _lastHumanInChannel = new Map(); // channelId -> timestamp

function isSiblingAgent(authorId) {
  return SIBLING_BOT_IDS.includes(authorId);
}

function checkAgentChain(channelId, isAgent) {
  if (!isAgent) {
    // Human message resets the chain
    agentChainCounters.set(channelId, 0);
    return true;
  }
  const count = (agentChainCounters.get(channelId) || 0) + 1;
  agentChainCounters.set(channelId, count);
  const chainMax = MAGI_IDS.includes(PERSONALITY_ID) ? AGENT_CHAIN_MAX_MAGI : AGENT_CHAIN_MAX_COWORKER;
  if (count > chainMax) {
    console.log(`[gummi] Agent chain limit (${chainMax}) reached in channel ${channelId} — not responding`);
    return false;
  }
  return true;
}

// --- Channel Routing ---
// Default channels per agent. Loaded from env or hardcoded for ByDesign server.
const CHANNEL_CONFIG = {
  defaultChannel: process.env.DEFAULT_CHANNEL || `fungi-${PERSONALITY_ID}`,
  groupChannel: process.env.GROUP_CHANNEL || 'fungi-core',
  voiceChannel: process.env.VOICE_CHANNEL || 'fungi-yodeling-practice',
  visualChannel: process.env.VISUAL_CHANNEL || 'fungi-drawing-class',
};
let _defaultChannelObj = null; // resolved on first use

/**
 * Get the default Discord channel for this agent (resolved lazily).
 * Returns null if the channel can't be found — caller should handle the error.
 */
async function getDefaultChannel() {
  if (_defaultChannelObj) return _defaultChannelObj;
  _defaultChannelObj = await resolveChannel(CHANNEL_CONFIG.defaultChannel);
  if (!_defaultChannelObj) {
    console.error(`[gummi] DEFAULT CHANNEL "${CHANNEL_CONFIG.defaultChannel}" not found — scheduled messages will be dropped. Ask Jordan to check permissions.`);
  }
  return _defaultChannelObj;
}

// --- Image Attachments ---
const WORKSPACE_PATH = process.env.MAGI_WORKSPACE || process.env.RHIZO_WORKSPACE || path.join(homedir(), 'Desktop', 'Magi');
const ATTACHMENTS_DIR = path.join(WORKSPACE_PATH, '_attachments');

// Ensure attachments directory exists
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

// Prune old attachments (older than 24h) on startup
try {
  const now = Date.now();
  for (const file of fs.readdirSync(ATTACHMENTS_DIR)) {
    const filePath = path.join(ATTACHMENTS_DIR, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
      fs.unlinkSync(filePath);
    }
  }
} catch (err) {
  console.error('[gummi] Failed to prune attachments:', err.message);
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const FORGE_PATH = process.env.FORGE_PATH || null;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB Discord limit

/**
 * Check if a file path is within allowed directories (workspace or forge).
 * Prevents agents from attaching arbitrary system files.
 */
function isAllowedAttachmentPath(filePath) {
  try {
    const resolved = path.resolve(filePath);
    const inWorkspace = resolved.startsWith(path.resolve(WORKSPACE_PATH));
    const inForge = FORGE_PATH && resolved.startsWith(path.resolve(FORGE_PATH));
    return inWorkspace || inForge;
  } catch {
    return false;
  }
}

/**
 * Validate and resolve [attach:] paths from agent response.
 * Returns array of valid, readable file paths within allowed directories.
 */
async function resolveAttachments(rawPaths) {
  const valid = [];
  for (const rawPath of rawPaths) {
    // Normalize — agents may use forward slashes
    const normalized = rawPath.replace(/\//g, path.sep);
    // Try relative to workspace first, then absolute/CWD
    let resolved = path.resolve(WORKSPACE_PATH, normalized);
    if (!fs.existsSync(resolved)) {
      resolved = path.resolve(normalized);
    }

    if (!isAllowedAttachmentPath(resolved)) {
      console.warn(`[gummi] Attachment blocked (outside allowed paths): ${rawPath}`);
      continue;
    }

    try {
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        console.warn(`[gummi] Attachment is not a file: ${rawPath}`);
        continue;
      }
      if (stat.size > MAX_ATTACHMENT_BYTES) {
        console.warn(`[gummi] Attachment too large (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${rawPath}`);
        continue;
      }
      valid.push(resolved);
      console.log(`[gummi] Attachment validated: ${path.basename(resolved)} (${(stat.size / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.warn(`[gummi] Attachment not readable: ${rawPath} — ${err.message}`);
    }
  }
  return valid;
}

/**
 * Download image attachments from a Discord message to the workspace.
 * Returns an array of { filename, localPath, description } for each image.
 */
async function downloadAttachments(message) {
  const images = [];
  for (const attachment of message.attachments.values()) {
    const ext = path.extname(attachment.name || '').toLowerCase();
    const isImage = IMAGE_EXTENSIONS.includes(ext) ||
      (attachment.contentType && attachment.contentType.startsWith('image/'));
    if (!isImage) continue;

    const filename = `${Date.now()}_${attachment.name || 'image.png'}`;
    const localPath = path.join(ATTACHMENTS_DIR, filename);

    try {
      await new Promise((resolve, reject) => {
        const proto = attachment.url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(localPath);
        proto.get(attachment.url, (res) => {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { fs.unlinkSync(localPath); reject(err); });
      });

      images.push({
        filename,
        localPath: localPath.replace(/\\/g, '/'),
        description: attachment.description || null,
      });
      console.log(`[gummi] Downloaded attachment: ${filename}`);
    } catch (err) {
      console.error(`[gummi] Failed to download attachment ${attachment.name}:`, err.message);
    }
  }
  return images;
}

// --- Reaction Monitoring ---
const reactionBuffer = new Map(); // channelId -> [{ emoji, userName, messageSnippet, messageId, channelId, timestamp }]
const MAX_REACTIONS_PER_CHANNEL = 20;
const REACTION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function addReaction(channelId, emoji, userName, messageSnippet, messageId) {
  if (!reactionBuffer.has(channelId)) reactionBuffer.set(channelId, []);
  const buf = reactionBuffer.get(channelId);
  buf.push({ emoji, userName, messageSnippet, messageId, channelId, timestamp: Date.now() });
  // Prune old and excess
  const now = Date.now();
  const pruned = buf.filter(r => now - r.timestamp < REACTION_TTL_MS).slice(-MAX_REACTIONS_PER_CHANNEL);
  reactionBuffer.set(channelId, pruned);
}

/** Collect all recent reactions across channels, formatted as context for the agent. */
function getReactionContext() {
  const now = Date.now();
  const lines = [];
  for (const [channelId, reactions] of reactionBuffer) {
    const recent = reactions.filter(r => now - r.timestamp < REACTION_TTL_MS);
    reactionBuffer.set(channelId, recent);
    for (const r of recent) {
      const ago = formatTimeAgo(now - r.timestamp);
      lines.push(`- ${r.emoji} from ${r.userName} on "${r.messageSnippet}" (msg:${r.messageId}) — ${ago}`);
    }
  }
  if (lines.length === 0) return '';
  return `[Recent reactions to your messages:]\n${lines.join('\n')}\n\n`;
}

function formatTimeAgo(ms) {
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

// --- Sprite Rendering ---

const SPRITE_OUTPUT_DIR = path.join(WORKSPACE_PATH, 'Art', '_rendered');

/**
 * Resolve [sprite:path] tags: render each JSON to PNG and return file paths.
 * Paths are relative to workspace. Falls back to absolute if already valid.
 */
async function resolveSprites(rawPaths) {
  const rendered = [];
  for (const rawPath of rawPaths) {
    const normalized = rawPath.replace(/\//g, path.sep);
    // Try relative to workspace first, then absolute
    let jsonPath = path.resolve(WORKSPACE_PATH, normalized);
    if (!fs.existsSync(jsonPath)) {
      jsonPath = path.resolve(normalized);
    }

    // Security: must be within workspace
    if (!isAllowedAttachmentPath(jsonPath)) {
      console.warn(`[gummi] Sprite blocked (outside workspace): ${rawPath}`);
      continue;
    }

    if (!fs.existsSync(jsonPath)) {
      console.warn(`[gummi] Sprite JSON not found: ${rawPath}`);
      continue;
    }

    try {
      const { outputPath, warnings } = renderToFile(jsonPath, SPRITE_OUTPUT_DIR);
      if (outputPath) {
        rendered.push(outputPath);
        console.log(`[gummi] Rendered sprite: ${path.basename(outputPath)}`);
        if (warnings.length > 0) {
          console.warn(`[gummi] Sprite warnings for ${rawPath}:`, warnings.join('; '));
        }
      } else {
        console.error(`[gummi] Sprite render failed for ${rawPath}:`, warnings.join('; '));
      }
    } catch (err) {
      console.error(`[gummi] Sprite render error for ${rawPath}:`, err.message);
    }
  }
  return rendered;
}

// --- Embed Builder ---

function buildEmbed(data) {
  try {
    const embed = new EmbedBuilder();
    if (data.title) embed.setTitle(data.title.substring(0, 256));
    if (data.description) embed.setDescription(data.description.substring(0, 4096));
    if (data.color) {
      const color = typeof data.color === 'string'
        ? parseInt(data.color.replace('#', ''), 16)
        : data.color;
      if (!isNaN(color)) embed.setColor(color);
    }
    if (data.fields && Array.isArray(data.fields)) {
      for (const field of data.fields.slice(0, 25)) {
        if (field.name && field.value) {
          embed.addFields({
            name: String(field.name).substring(0, 256),
            value: String(field.value).substring(0, 1024),
            inline: !!field.inline,
          });
        }
      }
    }
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.image) embed.setImage(data.image);
    if (data.footer) {
      const footerText = typeof data.footer === 'string' ? data.footer : data.footer.text;
      if (footerText) embed.setFooter({ text: footerText.substring(0, 2048) });
    }
    if (data.url) embed.setURL(data.url);
    return embed;
  } catch (err) {
    console.warn('[gummi] Failed to build embed:', err.message);
    return null;
  }
}

// --- Rate Limiting ---
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // messages per window per user
const userMessageTimestamps = new Map();

function isRateLimited(userId) {
  const now = Date.now();
  const timestamps = userMessageTimestamps.get(userId) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  userMessageTimestamps.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX;
}

// --- Pending Interactions (ask/plan follow-up routing) ---
const pendingInteractions = new Map(); // `${channelId}:${userId}` -> { type, content, timestamp }
const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function setPending(channelId, userId, type, content) {
  const key = `${channelId}:${userId}`;
  pendingInteractions.set(key, { type, content, timestamp: Date.now() });
  // Auto-expire
  setTimeout(() => {
    const pending = pendingInteractions.get(key);
    if (pending && pending.content === content) {
      pendingInteractions.delete(key);
      console.log(`[gummi] Pending ${type} expired for user ${userId}`);
    }
  }, PENDING_TIMEOUT_MS);
}

function consumePending(channelId, userId) {
  const key = `${channelId}:${userId}`;
  const pending = pendingInteractions.get(key);
  if (!pending) return null;
  if (Date.now() - pending.timestamp > PENDING_TIMEOUT_MS) {
    pendingInteractions.delete(key);
    return null;
  }
  pendingInteractions.delete(key);
  return pending;
}

// --- Channel Allowlist ---
const CHANNEL_ALLOWLIST = process.env.CHANNEL_ALLOWLIST
  ? process.env.CHANNEL_ALLOWLIST.split(',').map(s => s.trim())
  : null; // null = allow all

// --- Guild Allowlist ---
const GUILD_ALLOWLIST = process.env.GUILD_ALLOWLIST
  ? process.env.GUILD_ALLOWLIST.split(',').map(s => s.trim())
  : null; // null = allow all guilds

// --- Channel History ---
const HISTORY_FETCH_COUNT = 20;

/**
 * Fetch recent message history from Discord API and seed the channel buffer.
 * Used on cold starts when the passive buffer is empty.
 */
async function fetchAndSeedHistory(message) {
  try {
    const fetched = await message.channel.messages.fetch({
      limit: HISTORY_FETCH_COUNT + 1,
      before: message.id,
    });

    const sorted = Array.from(fetched.values())
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .filter(msg => !msg.content.startsWith('!'));

    for (const msg of sorted) {
      const authorName = msg.member?.displayName || msg.author.displayName || msg.author.username;
      const isBot = msg.author.id === message.client.user.id;
      const content = isBot
        ? `[${AGENT_NAME} responded]: ${msg.content.substring(0, 300)}`
        : cleanMentions(msg.content, msg);
      seedBuffer(message.channel.id, authorName, content, msg.author.id, msg.createdAt.toISOString());
    }

    console.log(`[gummi] Seeded ${sorted.length} messages from channel history`);
  } catch (err) {
    console.error('[gummi] Failed to fetch channel history:', err.message);
  }
}

// --- Thread Context ---
const THREAD_MESSAGE_LIMIT = 30;

/**
 * Fetch full thread context when a message is in a thread.
 * Returns formatted context string or empty string.
 */
async function fetchThreadContext(message) {
  const channel = message.channel;
  if (!channel.isThread || !channel.isThread()) return '';

  try {
    const starterMessage = await channel.fetchStarterMessage().catch(() => null);
    const fetched = await channel.messages.fetch({ limit: THREAD_MESSAGE_LIMIT });

    const sorted = Array.from(fetched.values())
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .filter(msg => msg.id !== message.id && !msg.content.startsWith('!'));

    let context = `[Thread: "${channel.name || 'Unnamed thread'}"]\n`;

    if (starterMessage) {
      context += `[Started by ${starterMessage.author.username}: "${starterMessage.content.substring(0, 300)}"]\n\n`;
    }

    if (sorted.length > 0) {
      const lines = sorted.map(msg => {
        const author = msg.member?.displayName || msg.author.displayName || msg.author.username;
        const isBot = msg.author.id === message.client.user.id;
        const content = isBot
          ? `[${AGENT_NAME}]: ${msg.content.substring(0, 300)}`
          : msg.content;
        return `- ${author}: ${content}`;
      });
      context += `[Thread history:]\n${lines.join('\n')}\n`;
    }

    context += `[End thread context]\n\n`;
    console.log(`[gummi] Fetched ${sorted.length} thread messages for context`);
    return context;
  } catch (err) {
    console.error('[gummi] Failed to fetch thread context:', err.message);
    return '';
  }
}

// --- Bookmark Saving ---
const BOOKMARK_PATH = (process.env.MAGI_WORKSPACE || process.env.RHIZO_WORKSPACE)
  ? path.join(process.env.MAGI_WORKSPACE || process.env.RHIZO_WORKSPACE, 'bookmarks.jsonl')
  : path.join(homedir(), 'Desktop', 'Magi', 'bookmarks.jsonl');

function saveBookmarks(labels, message) {
  for (const label of labels) {
    try {
      const entry = JSON.stringify({
        label,
        timestamp: new Date().toISOString(),
        channel: message.channel.name || 'unknown',
        author: message.author.username,
        message: message.content.substring(0, 500),
      });
      fs.mkdirSync(path.dirname(BOOKMARK_PATH), { recursive: true });
      fs.appendFileSync(BOOKMARK_PATH, entry + '\n', 'utf-8');
      console.log(`[gummi] Bookmark saved: ${label}`);
    } catch (err) {
      console.error(`[gummi] Failed to save bookmark:`, err.message);
    }
  }
}

// --- Channel Resolution ---

/**
 * Find a text channel by name across all guilds the bot is in.
 */
async function resolveChannel(channelName) {
  for (const guild of client.guilds.cache.values()) {
    let found = guild.channels.cache.find(
      ch => ch && ch.name === channelName && ch.isTextBased()
    );
    if (!found) {
      try {
        const fetched = await guild.channels.fetch();
        found = fetched.find(ch => ch && ch.name === channelName && ch.isTextBased());
      } catch (err) {
        console.error(`[gummi] Failed to fetch channels for ${guild.name}:`, err.message);
      }
    }
    if (found) return found;
  }
  return null;
}

// --- Available Channel Cache ---
let _availableChannels = []; // populated on ready

async function refreshAvailableChannels() {
  const names = new Set();
  for (const guild of client.guilds.cache.values()) {
    try {
      const channels = await guild.channels.fetch();
      const me = guild.members.me;
      for (const ch of channels.values()) {
        if (!ch || !ch.isTextBased() || !ch.name) continue;
        // Only include channels the bot can actually send to
        if (me && ch.permissionsFor) {
          const perms = ch.permissionsFor(me);
          if (!perms || !perms.has('SendMessages')) continue;
        }
        names.add(ch.name);
      }
    } catch (err) {
      console.error(`[gummi] Failed to list channels for ${guild.name}:`, err.message);
    }
  }
  _availableChannels = [...names].sort();
  console.log(`[gummi] Discovered ${_availableChannels.length} sendable text channels`);
}

function getAvailableChannels() {
  return _availableChannels;
}

// --- Schedule Tag Processing ---

const scheduler = new Scheduler();

/**
 * Process work queue tags from any response (focus, backlog, timer, cancel).
 */
function handleWorkTags(response) {
  // Focus
  if (isFocusDone(response)) {
    scheduler.clearFocus();
  }
  const focusDesc = parseFocus(response);
  if (focusDesc) {
    scheduler.setFocus(focusDesc);
  }

  // Backlog
  const backlogItems = parseBacklog(response);
  for (const desc of backlogItems) {
    scheduler.addBacklog(desc);
  }
  const backlogDoneIds = parseBacklogDone(response);
  for (const id of backlogDoneIds) {
    const removed = scheduler.removeBacklog(id);
    if (!removed) console.warn(`[scheduler] No backlog item with ID "${id}"`);
  }

  // Timers
  const timerTags = parseTimerTags(response);
  for (const tag of timerTags) {
    const ms = parseDuration(tag.duration);
    if (ms) {
      scheduler.addTimer(ms, tag.description);
    } else {
      console.warn(`[scheduler] Invalid duration "${tag.duration}" in timer tag`);
    }
  }

  // Daily
  const dailyTags = parseDaily(response);
  for (const tag of dailyTags) {
    scheduler.addDaily(tag.description, tag.timeOfDay);
  }
  const dailyDoneIds = parseDailyDone(response);
  for (const id of dailyDoneIds) {
    const removed = scheduler.removeDaily(id);
    if (!removed) console.warn(`[scheduler] No daily task with ID "${id}"`);
  }

  // Event proposals — coworkers/agents can propose future drama scenarios
  const eventProposals = parseEventProposal(response);
  for (const desc of eventProposals) {
    const proposalPath = path.join(
      process.env.COWORKER_WORKSPACE || path.join(homedir(), 'Desktop', 'Coworkers'),
      '_drama-proposals.json'
    );
    try {
      let proposals = [];
      try { proposals = JSON.parse(fs.readFileSync(proposalPath, 'utf-8')); } catch {}
      proposals.push({
        id: Math.random().toString(36).substring(2, 8),
        proposedBy: (process.env.PERSONALITY_ID || 'unknown').toLowerCase(),
        description: desc,
        proposedAt: new Date().toISOString(),
        status: 'pending',
      });
      // Keep max 20 proposals
      if (proposals.length > 20) proposals = proposals.slice(-20);
      const tmp = proposalPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(proposals, null, 2));
      fs.renameSync(tmp, proposalPath);
      console.log(`[event] Proposal saved: "${desc.substring(0, 60)}..." by ${process.env.PERSONALITY_ID}`);
    } catch (err) {
      console.error(`[event] Failed to save proposal: ${err.message}`);
    }
  }

  // Cancel (works for timers, backlog, and daily items)
  const cancelIds = parseCancel(response);
  for (const id of cancelIds) {
    const removedBacklog = scheduler.removeBacklog(id);
    const removedTimer = scheduler.removeTimer(id);
    const removedDaily = scheduler.removeDaily(id);
    if (!removedBacklog && !removedTimer && !removedDaily) {
      console.warn(`[scheduler] No item with ID "${id}" to cancel`);
    }
  }
}

/**
 * Send a response to a Discord channel, handling routing, files, embeds, and replies.
 * @param {string} visibleText - Text content to send
 * @param {string|null} sendTarget - Channel name to route to (from [send:#channel])
 * @param {object|null} fallbackChannel - Discord channel to use if sendTarget is null
 * @param {object} opts - { files: [], embeds: [], replyTo: null }
 * @returns {object|null} The channel sent to, or null
 */
async function sendToDiscord(visibleText, sendTarget, fallbackChannel, opts = {}) {
  const { files = [], embeds = [], replyTo = null } = opts;

  if (!visibleText && files.length === 0 && embeds.length === 0) return null;

  let targetChannel = fallbackChannel;
  if (sendTarget) {
    const found = await resolveChannel(sendTarget);
    if (found) {
      targetChannel = found;
      console.log(`[gummi] Routing response to #${sendTarget}`);
    } else {
      console.warn(`[gummi] [send:#${sendTarget}] — channel not found in any guild${fallbackChannel ? ', using fallback' : ''}`);
    }
  }

  // If no target yet, try the agent's default channel
  if (!targetChannel) {
    targetChannel = await getDefaultChannel();
  }

  if (!targetChannel) {
    console.error(`[gummi] SEND FAILED — no target channel and default channel "${CHANNEL_CONFIG.defaultChannel}" is not accessible. Ask Jordan to check bot permissions.`);
    return null;
  }

  // No text — send files/embeds only
  if (!visibleText) {
    const msgOpts = {};
    if (files.length > 0) msgOpts.files = files;
    if (embeds.length > 0) msgOpts.embeds = embeds;
    if (replyTo) msgOpts.reply = { messageReference: replyTo, failIfNotExists: false };
    await targetChannel.send(msgOpts);
    return targetChannel;
  }

  const chunks = splitMessage(visibleText);
  for (let i = 0; i < chunks.length; i++) {
    const msgOpts = { content: chunks[i] };
    // First chunk gets files, embeds, and reply reference
    if (i === 0) {
      if (files.length > 0) msgOpts.files = files;
      if (embeds.length > 0) msgOpts.embeds = embeds;
      if (replyTo) msgOpts.reply = { messageReference: replyTo, failIfNotExists: false };
    }
    await targetChannel.send(msgOpts);
  }
  if (files.length > 0) {
    console.log(`[gummi] Sent ${files.length} attachment(s) to #${targetChannel.name}`);
  }
  if (embeds.length > 0) {
    console.log(`[gummi] Sent ${embeds.length} embed(s) to #${targetChannel.name}`);
  }
  return targetChannel;
}

// --- Discord Client ---

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.once('clientReady', () => {
  console.log(`[gummi] Logged in as ${client.user.tag}`);
  console.log(`[gummi] Idle timeout: ${process.env.IDLE_TIMEOUT_MS || 1800000}ms`);
  if (CHANNEL_ALLOWLIST) {
    console.log(`[gummi] Channel allowlist: ${CHANNEL_ALLOWLIST.join(', ')}`);
  } else {
    console.log(`[gummi] Channel allowlist: disabled (all channels)`);
  }
  pruneOldDigests();
  refreshAvailableChannels().then(() => {
    setContextProviders({ availableChannels: getAvailableChannels() });
  }).catch(err => {
    console.error('[gummi] Channel discovery error:', err.message);
  });
  // Lightweight catch-up: only fetches 20 msgs from channels with gaps > 5 min
  backfillDigests(client, client.user.id).catch(err => {
    console.error('[gummi] Backfill error:', err.message);
  });

  // Start board web UI (only one process should run this)
  if (process.env.ENABLE_BOARD_SERVER === 'true') {
    require('./board-server').start();
  }

  // Start health reporter (sentinel duty — only one process should run this)
  if (process.env.ENABLE_HEALTH_REPORTER === 'true') {
    healthReporter.start();
  }

  // Start the work queue scheduler
  scheduler.start(async (mode, task) => {
    console.log(`[scheduler] Waking ${AGENT_NAME} (${mode}): "${task.description}"`);

    const workQueue = scheduler.listFormatted();
    const reactionContext = getReactionContext();
    let prompt;

    if (mode === 'focus') {
      prompt = `[FOCUS CHECK-IN #${task.checkIns} — You set this focus task for yourself. This is NOT from a Discord user.]

Task: ${task.description}
Started: ${task.createdAt}

Continue working toward completion. When done, use [focus-done] to clear the focus and resume background work.

Your work queue:
${workQueue}`;
    } else if (mode === 'daily') {
      prompt = `[DAILY TASK — This is your daily improvement cycle task. This is NOT from a Discord user.]

Task: ${task.description}

Follow the scientific method cycle: Problem Audit → Research → Hypothesis → **Verify** → Evaluate → Recommend.
CRITICAL: Before recommending ANY infrastructure change, you MUST read the actual source code or config file to verify your assumptions. Read Ecto/infrastructure-reference.md for file paths. Never recommend based on log patterns alone — logs show symptoms, source shows truth.
Queue follow-up phases as background work with [backlog:description].
Post your final summary or tiebreaker request to #fungi-core with [send:#fungi-core].

Your work queue:
${workQueue}`;
    } else if (mode === 'background') {
      prompt = `[BACKGROUND TASK — This task was picked from your backlog. This is NOT from a Discord user.]

Task: ${task.description}

Work on this for one focused session. When complete, use [backlog-done:${task.id}] to remove it.

Your work queue:
${workQueue}`;
    } else if (mode === 'wake') {
      // Extract proposal name from various wake file formats
      const proposalName = task.proposalName || task.proposal
        || task.details?.proposalName || task.details?.proposal
        || 'unknown';
      const requester = task.requester || task.from || 'a sibling';
      const wakeMessage = task.message || task.details?.description || task.details?.message || '';
      const pending = task._pendingCount || 1;

      // Determine this agent's lens file
      const personalityId = (process.env.PERSONALITY_ID || 'rhizo').toLowerCase();
      const lensMap = { rhizo: 'pattern-lens.md', mico: 'communication-lens.md', ecto: 'systems-lens.md' };
      const myLens = lensMap[personalityId] || 'pattern-lens.md';

      // If proposal name is unknown, tell agent to search
      const proposalInstruction = proposalName !== 'unknown'
        ? `Read the proposal at \`Proposals/Active/${proposalName}/proposal.md\``
        : `Search \`Proposals/Active/\` for the most recent proposal from ${requester}`;

      prompt = `[SIBLING WAKE — Collaboration request. This is NOT from a Discord user.]

A sibling has submitted a proposal for your review via the FeedbackLoop system.

Proposal: "${proposalName}"
From: ${requester}
Type: ${task.type || 'strategic'}
${wakeMessage ? `Message: ${wakeMessage}` : ''}
Pending wakes for you: ${pending}

**Your task:**
1. ${proposalInstruction}
2. Write your analysis to \`Proposals/Active/${proposalName}/${myLens}\`
3. Be substantive — real analysis with ## section headers, not template text
4. Your lens is **${myLens}** — focus on your domain expertise

Your work queue:
${workQueue}`;
    } else if (mode === 'project' && task._useExecutionAgent) {
      // Execution agent task — runs outside isBusy, doesn't block triad
      const board = projectBoard.getBoard();
      console.log(`[scheduler] Routing task ${task.id} to execution agent`);
      try {
        projectBoard.claimTask(task.id, PERSONALITY_ID);
        const result = await runExecutionTask(task, board);

        // Log any insights the execution agent discovered
        if (result.insights && result.insights.length > 0) {
          for (const insight of result.insights) {
            console.log(`[execution] Insight from ${task.id}: ${insight}`);
          }
          // Store insights on the task for review
          try {
            const currentBoard = projectBoard.getBoard();
            const currentTask = currentBoard.tasks.find(t => t.id === task.id);
            if (currentTask) currentTask.executionInsights = result.insights;
          } catch { /* non-fatal */ }
        }

        if (result.success) {
          const completed = await projectBoard.completeTask(task.id, result.output);
          if (completed.status === 'validation-failed') {
            console.log(`[execution] Task ${task.id} validation failed — will retry`);
          } else if (completed.status === 'pending-review') {
            console.log(`[execution] Task ${task.id} pending review`);
            projectBoard.requestReview(task.id);
            await sendReviewNotification(completed);
          } else {
            console.log(`[execution] Task ${task.id} completed → ${result.output}`);
          }
        } else {
          projectBoard.failTask(task.id, result.error);
          console.log(`[execution] Task ${task.id} failed: ${result.error}`);
        }
      } catch (err) {
        console.error(`[execution] Task ${task.id} crashed: ${err.message}`);
        try {
          projectBoard.failTask(task.id, `Execution agent error: ${err.message}`);
        } catch { /* task may not be in-progress if claim failed */ }
      }
      return;
    } else if (mode === 'project') {
      // Triad project task — normal personality-driven handling
      const board = projectBoard.getBoard();
      const depOutputs = (task.depends || [])
        .map(depId => {
          const depTask = board.tasks.find(t => t.id === depId);
          if (depTask && depTask.output) return `- ${depTask.title} → \`${depTask.output}\``;
          return `- ${depTask?.title || depId} → (no output path)`;
        })
        .join('\n');

      const specPath = board.project.spec;
      const projectName = board.project.name;
      const budgetInfo = board.project.budget
        ? `Budget: ${board.project.budget.spent}/${board.project.budget.max} sessions used`
        : '';

      if (task._isRetry && task.status === 'validation-failed') {
        // Retry after validation failure
        const errors = (task.validationErrors || []).map(e => `  - ${e}`).join('\n');
        const warnings = (task.validationWarnings || []).map(w => `  - ${w}`).join('\n');
        prompt = `[PROJECT TASK RETRY — Validation failed. You MUST fix the errors before resubmitting. This is NOT from a Discord user.]

Project: "${projectName}"
Task: ${task.title} (${task.id})
${task.notes ? `Notes: ${task.notes}` : ''}
${task.description ? `\n${task.description}\n` : ''}
Previous output: \`${task.output || 'none'}\`

**Validation errors (must fix):**
${errors || '  (none)'}

**Validation warnings:**
${warnings || '  (none)'}

**CRITICAL INSTRUCTIONS:**
1. Read the validation errors above carefully — they explain exactly what failed
2. If the error says "Build failed", run the build command yourself and read the compiler output
3. Fix the ACTUAL CODE that caused the error — do not just resubmit the same output
4. Verify the build passes BEFORE completing: \`${task.validation?.buildCommand || 'npx tsc --noEmit'}\`
5. Save your corrected output and use \`[project-complete:${task.id}:path/to/output]\` when done

DO NOT resubmit without making changes. If you resubmit the same output, it will fail again.

Your work queue:
${workQueue}`;

        try {
          projectBoard.retryTask(task.id);
        } catch (err) {
          console.warn(`[scheduler] Failed to retry project task ${task.id}: ${err.message}`);
          return;
        }
      } else if (task._isRetry && task.status === 'revision-required') {
        // Retry after human revision request
        prompt = `[PROJECT TASK REVISION — Jordan requested changes. This is NOT from a Discord user.]

Project: "${projectName}"
Task: ${task.title} (${task.id})
${task.notes ? `Notes: ${task.notes}` : ''}
Previous output: \`${task.output || 'none'}\`

**Revision feedback from Jordan:**
${task.revisionFeedback || '(no specific feedback)'}

**Instructions:**
1. Read your previous output and Jordan's feedback
2. Make the requested changes
3. Save your updated output and use \`[project-complete:${task.id}:path/to/output]\` when done

Your work queue:
${workQueue}`;

        try {
          projectBoard.retryTask(task.id);
        } catch (err) {
          console.warn(`[scheduler] Failed to retry project task ${task.id}: ${err.message}`);
          return;
        }
      } else {
        // Normal new task
        prompt = `[PROJECT TASK — Assigned to you by the project board. This is NOT from a Discord user.]

Project: "${projectName}"
Phase: ${board.project.phase}
${budgetInfo}

**Your task:** ${task.title}
Task ID: ${task.id}
${task.notes ? `Notes: ${task.notes}` : ''}

${depOutputs ? `**Dependency outputs (read these first):**\n${depOutputs}` : '**No dependencies — you can start fresh.**'}

**Instructions:**
1. Read the project spec at \`${specPath}\` if you haven't already
2. Read any dependency outputs listed above for context
3. Do the work described in your task
4. Save your output to a file and use \`[project-complete:${task.id}:path/to/output]\` when done
5. If you hit a blocker you can't resolve, use \`[project-fail:${task.id}:reason]\`

Your work queue:
${workQueue}`;

        // Claim the task atomically before sending to agent
        try {
          projectBoard.claimTask(task.id, PERSONALITY_ID);
        } catch (err) {
          console.warn(`[scheduler] Failed to claim project task ${task.id}: ${err.message}`);
          return;
        }
      }
    } else if (mode === 'review') {
      // Cross-agent review — read the deliverable and check against criteria
      const board = projectBoard.getBoard();
      const outputPath = task.output;
      let deliverableContent = '';
      if (outputPath) {
        try {
          const resolvedPath = path.resolve(WORKSPACE_PATH, outputPath);
          deliverableContent = fs.readFileSync(resolvedPath, 'utf-8').slice(0, 8000); // cap at 8k chars
        } catch {
          try {
            deliverableContent = fs.readFileSync(outputPath, 'utf-8').slice(0, 8000);
          } catch {
            deliverableContent = `(Could not read deliverable at ${outputPath})`;
          }
        }
      }

      const criteria = (task.acceptanceCriteria || []).map(c => `- [ ] ${c}`).join('\n') || '(none specified)';

      prompt = `[CROSS-AGENT REVIEW — You are reviewing another agent's work. This is NOT from a Discord user.]

**Task:** ${task.title} (${task.id})
**Completed by:** ${task.completedBy || 'unknown'}
**Output file:** \`${outputPath || 'none'}\`

## Deliverable Content
${deliverableContent}

## Acceptance Criteria
${criteria}

## Your Review
You did NOT write this. Review it with fresh eyes — do not assume it's correct.

Check each of these:
1. Does the output satisfy every acceptance criterion? Check each one specifically.
2. Are there obvious bugs, missing error handling, or security issues?
3. Is the output actually runnable/usable, or is it just documentation of what you would do?
4. Are there hardcoded values that should be configurable?
5. Any placeholder/stub functions that weren't fully implemented?

## Your Response (use exactly ONE of these tags)
- If everything looks good: [review-approve:${task.id}]
- If you found issues needing fixes: [review-revise:${task.id}:describe what needs to change]
- If something needs Jordan's attention: [review-flag:${task.id}:describe the concern]

Be specific. "Looks good" is not a review. Cite the specific criterion or code.`;
    } else {
      // timer
      prompt = `[TIMER REMINDER — You set this one-off reminder for yourself. This is NOT from a Discord user.]

Reminder: ${task.description}

Your work queue:
${workQueue}`;
    }

    prompt += `\n\nYou can:\n- Do the task silently (workspace work, file updates, etc.)\n- Post to Discord with [send:#channel-name]\n- Add work with [backlog:description] or [focus:description]\n- Complete work with [focus-done] or [backlog-done:ID]\n- Set reminders with [timer:DURATION:description]\n- Schedule daily recurring tasks with [daily:HH:MM:description] or remove with [daily-done:ID]\n- Propose a future scenario or situation with [event:description] — it'll come back to you later as a conversation starter\n- Cancel items with [cancel:ID]\n- Use [no-response] if there's nothing to do right now`;

    // Prepend reaction context if any
    if (reactionContext) {
      prompt = reactionContext + prompt;
    }

    // Set prompt modes based on scheduler task type for token efficiency
    const promptModes = [];
    if (mode === 'project' || mode === 'wake' || mode === 'review') promptModes.push('project');
    // Detect art-related content in the prompt
    if (/\b(sprite|pixel art|visual|ui|ux|frontend|css|html|design|render)\b/i.test(prompt)) promptModes.push('art');
    setContextProviders({ modes: promptModes });

    // Use Opus for autonomous scheduled work (Magi agents only)
    const isMagi = ['rhizo', 'mico', 'ecto'].includes((process.env.PERSONALITY_ID || '').toLowerCase());
    const autonomousModes = ['focus', 'daily', 'background', 'project', 'wake', 'review'];
    const schedulerOverrides = isMagi && autonomousModes.includes(mode)
      ? { model: 'claude-opus-4-20250514', maxTurns: 30, maxBudgetUsd: 5.0 }
      : undefined;

    const response = await sendMessage(prompt, 'SYSTEM', 'scheduler', 'scheduled', schedulerOverrides);

    // Reset modes after query so Discord conversations get minimal prompt
    setContextProviders({ modes: [] });

    if (!isNoResponse(response)) {
      const sendTarget = parseSendTarget(response);
      const attachmentPaths = parseAttachments(response);
      const spritePaths = parseSpriteTags(response);
      const embedDatas = parseEmbeds(response);
      const replyTo = parseReplyTo(response);
      const visibleText = stripTags(response);
      const validAttachments = attachmentPaths.length > 0
        ? await resolveAttachments(attachmentPaths)
        : [];
      const renderedSprites = spritePaths.length > 0
        ? await resolveSprites(spritePaths)
        : [];
      const allFiles = [...validAttachments, ...renderedSprites];
      const validEmbeds = embedDatas
        .map(data => buildEmbed(data))
        .filter(e => e !== null);
      const sentCh = await sendToDiscord(visibleText, sendTarget, null, {
        files: allFiles,
        embeds: validEmbeds,
        replyTo: replyTo || null,
      });
      // Track that we spoke in this channel (for follow-up detection)
      if (sentCh) {
        _lastSpokeInChannel.set(`${PERSONALITY_ID}:${sentCh.id}`, Date.now());
      }
    }

    // Handle project board tags in the response
    const projectComplete = parseProjectComplete(response);
    if (projectComplete) {
      try {
        const completedTask = await projectBoard.completeTask(projectComplete.taskId, projectComplete.output);
        if (completedTask.status === 'validation-failed') {
          console.log(`[project] Task ${projectComplete.taskId} validation failed — will retry next cycle`);
        } else if (completedTask.status === 'pending-review') {
          console.log(`[project] Task ${projectComplete.taskId} pending review`);
          projectBoard.requestReview(projectComplete.taskId);
          await sendReviewNotification(completedTask);
        } else {
          console.log(`[project] Task ${projectComplete.taskId} completed → ${projectComplete.output}`);
        }
      } catch (err) {
        console.error(`[project] Failed to complete task: ${err.message}`);
      }
    }
    const projectFail = parseProjectFail(response);
    if (projectFail) {
      try {
        projectBoard.failTask(projectFail.taskId, projectFail.reason);
        console.log(`[project] Task ${projectFail.taskId} failed: ${projectFail.reason}`);
      } catch (err) {
        console.error(`[project] Failed to record task failure: ${err.message}`);
      }
    }
    const projectInsights = parseProjectInsight(response);
    for (const { taskId, insight } of projectInsights) {
      console.log(`[project] Insight from ${taskId}: ${insight}`);
    }

    // Handle cross-agent review tags
    const reviewApprove = response.match(/\[review-approve:([^\]]+)\]/);
    if (reviewApprove) {
      const taskId = reviewApprove[1].trim();
      try {
        projectBoard.completeReview(taskId, PERSONALITY_ID, 'approved');
        projectBoard.approveTask(taskId);
        console.log(`[review] Task ${taskId} approved by ${PERSONALITY_ID}`);
      } catch (err) {
        console.error(`[review] Failed to approve ${taskId}: ${err.message}`);
      }
    }

    const reviewRevise = response.match(/\[review-revise:([^:\]]+):([^\]]+)\]/);
    if (reviewRevise) {
      const taskId = reviewRevise[1].trim();
      const feedback = reviewRevise[2].trim();
      try {
        projectBoard.completeReview(taskId, PERSONALITY_ID, 'revision-requested');
        projectBoard.requestRevision(taskId, feedback);
        console.log(`[review] Task ${taskId} revision requested by ${PERSONALITY_ID}: ${feedback}`);
      } catch (err) {
        console.error(`[review] Failed to request revision for ${taskId}: ${err.message}`);
      }
    }

    const reviewFlag = response.match(/\[review-flag:([^:\]]+):([^\]]+)\]/);
    if (reviewFlag) {
      const taskId = reviewFlag[1].trim();
      const concern = reviewFlag[2].trim();
      try {
        projectBoard.completeReview(taskId, PERSONALITY_ID, 'flagged');
        console.log(`[review] Task ${taskId} flagged by ${PERSONALITY_ID}: ${concern}`);
        // Send flag to Jordan via Discord
        await sendReviewFlag(taskId, concern);
      } catch (err) {
        console.error(`[review] Failed to flag ${taskId}: ${err.message}`);
      }
    }

    // Ack wake file after processing
    if (mode === 'wake' && task._wakeFile) {
      scheduler.ackWake(task._wakeFile);
    }

    // Process work queue tags in the response
    handleWorkTags(response);
  });
});

// --- Reaction Monitoring ---
client.on('messageReactionAdd', async (reaction, user) => {
  // Fetch partials if needed
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  // Only track reactions to our own messages
  if (reaction.message.author.id !== client.user.id) return;
  // Don't track our own reactions
  if (user.id === client.user.id) return;

  const emoji = reaction.emoji.name || reaction.emoji.toString();
  const member = reaction.message.guild?.members.cache.get(user.id);
  const userName = member?.displayName || user.displayName || user.username;

  // --- Review reaction buttons (trusted users only) ---
  // Check in-memory map first, fall back to parsing embed title for surviving restarts
  let taskId = pendingReviewMessages.get(reaction.message.id);
  if (!taskId && reaction.message.embeds?.length > 0) {
    const title = reaction.message.embeds[0]?.title || '';
    const match = title.match(/Review:\s+(.+)/);
    if (match) {
      // Extract task ID from the embed description which has "Task **ID**"
      const desc = reaction.message.embeds[0]?.description || '';
      const idMatch = desc.match(/Task \*\*(\S+)\*\*/);
      if (idMatch) taskId = idMatch[1];
    }
  }
  if (taskId && TRUSTED_USER_IDS.includes(user.id)) {
    try {
      if (emoji === '✅') {
        projectBoard.approveTask(taskId);
        pendingReviewMessages.delete(reaction.message.id);
        // Update embed to show approved
        const approvedEmbed = buildEmbed({
          title: `✅ Approved: ${taskId}`,
          description: `Approved by ${userName}`,
          color: '#28a745',
        });
        if (approvedEmbed) await reaction.message.edit({ embeds: [approvedEmbed] });
        console.log(`[project] Task ${taskId} approved via reaction by ${userName}`);
      } else if (emoji === '🔄') {
        // For revise, we need feedback — set pending and ask in a thread
        const thread = await reaction.message.startThread({
          name: `Revise ${taskId}`,
          autoArchiveDuration: 60,
        }).catch(() => null);
        if (thread) {
          await thread.send(`🔄 **Revision requested for ${taskId}** — what needs to change?`);
          setPending(thread.id, user.id, 'revise-review', taskId);
        }
        console.log(`[project] Revision requested for ${taskId} — waiting for feedback from ${userName}`);
      } else if (emoji === '❌') {
        // For reject, also need a reason
        const thread = await reaction.message.startThread({
          name: `Reject ${taskId}`,
          autoArchiveDuration: 60,
        }).catch(() => null);
        if (thread) {
          await thread.send(`❌ **Rejecting ${taskId}** — what's the reason?`);
          setPending(thread.id, user.id, 'reject-review', taskId);
        }
        console.log(`[project] Rejection requested for ${taskId} — waiting for reason from ${userName}`);
      }
    } catch (err) {
      console.error(`[project] Review reaction failed for ${taskId}: ${err.message}`);
    }
    return; // Don't fall through to normal reaction tracking
  }

  const snippet = reaction.message.content ? reaction.message.content.substring(0, 80) : '(embed/media)';

  addReaction(reaction.message.channelId, emoji, userName, snippet, reaction.message.id);
  console.log(`[gummi] Reaction ${emoji} from ${userName} on msg ${reaction.message.id}`);
});

/**
 * Process a response from the agent: parse all tags, resolve files, send to Discord.
 * Shared by normal message handler and follow-up handler.
 */
async function processAndSendResponse(response, message) {
  // Parse all tags
  const reactions = parseReactions(response);
  const bookmarks = parseBookmarks(response);
  const sendTarget = parseSendTarget(response);
  const attachmentPaths = parseAttachments(response);
  const spritePaths = parseSpriteTags(response);
  const embedDatas = parseEmbeds(response);
  const replyTo = parseReplyTo(response);
  const askContent = parseAskTag(response);
  const planContent = parsePlanTag(response);
  const visibleText = stripTags(response);

  // Validate attachment paths
  const validAttachments = attachmentPaths.length > 0
    ? await resolveAttachments(attachmentPaths)
    : [];

  // Render sprites
  const renderedSprites = spritePaths.length > 0
    ? await resolveSprites(spritePaths)
    : [];
  const allFiles = [...validAttachments, ...renderedSprites];

  // Build embeds
  const validEmbeds = embedDatas
    .map(data => buildEmbed(data))
    .filter(e => e !== null);

  // Apply reactions to triggering message
  for (const emoji of reactions) {
    await message.react(emoji).catch(err => {
      console.error(`[gummi] Failed to react with ${emoji}:`, err.message);
    });
  }

  // Save bookmarks
  if (bookmarks.length > 0) {
    saveBookmarks(bookmarks, message);
  }

  // Send response — use threads for replies in public channels
  let replyChannel = sendTarget ? null : message.channel; // sendTarget overrides threading
  const isAlreadyThread = message.channel.isThread && message.channel.isThread();

  // Thread creation disabled — replies go directly in channel for now
  // const canThread = !sendTarget && !isAlreadyThread && visibleText
  //   && message.channel.type !== undefined
  //   && (message.channel.type === 0 || message.channel.type === 5);
  //
  // if (canThread) {
  //   try {
  //     const msgText = message.content.replace(/<@!?\d+>/g, '').trim();
  //     const threadName = msgText.length > 0
  //       ? `${AGENT_NAME}: ${msgText.substring(0, 90)}${msgText.length > 90 ? '…' : ''}`
  //       : `${AGENT_NAME} reply`;
  //     const thread = await message.startThread({
  //       name: threadName.substring(0, 100),
  //       autoArchiveDuration: 60,
  //     });
  //     replyChannel = thread;
  //   } catch (err) {
  //     replyChannel = message.channel;
  //   }
  // }

  const sentChannel = await sendToDiscord(visibleText, sendTarget, replyChannel, {
    files: allFiles,
    embeds: validEmbeds,
    replyTo: (!sendTarget && isAlreadyThread) ? (replyTo || null) : null, // only use reply-to inside existing threads
  });

  // Track when we last spoke in this channel (for ambient follow-up boosting)
  if (sentChannel) {
    _lastSpokeInChannel.set(`${PERSONALITY_ID}:${sentChannel.id}`, Date.now());
  }

  // Set up pending follow-up if agent asked a question or proposed a plan
  const pendingChannelId = replyChannel?.id || message.channel.id;
  if (askContent) {
    setPending(pendingChannelId, message.author.id, 'ask', askContent);
    console.log(`[gummi] Agent asked: "${askContent}" — waiting for follow-up from ${message.author.username}`);
  } else if (planContent) {
    setPending(pendingChannelId, message.author.id, 'plan', planContent);
    console.log(`[gummi] Agent proposed plan: "${planContent}" — waiting for approval from ${message.author.username}`);
  }

  // Process work queue tags in the response
  handleWorkTags(response);
}

// --- Review Notification ---

// Track review messages so we can handle reactions on them
const pendingReviewMessages = new Map(); // messageId -> taskId

async function sendReviewNotification(task) {
  try {
    const groupCh = await resolveChannel(CHANNEL_CONFIG.groupChannel);
    if (!groupCh) {
      console.warn('[gummi] Cannot send review notification — group channel not found');
      return;
    }

    const warnings = (task.validationWarnings || []).map(w => `⚠️ ${w}`).join('\n') || 'None';
    const insights = (task.executionInsights || []).map(i => `💡 ${i}`).join('\n');
    const fields = [
      { name: 'Output', value: `\`${task.output || 'none'}\``, inline: false },
      { name: 'Warnings', value: warnings.substring(0, 1024), inline: false },
    ];
    if (insights) {
      fields.push({ name: 'Insights', value: insights.substring(0, 1024), inline: false });
    }

    const embed = buildEmbed({
      title: `📋 Review: ${task.title}`,
      description: `Task **${task.id}** by **${task.assignee}** is ready for review.`,
      color: '#f0ad4e',
      fields,
      footer: `React: ✅ approve · 🔄 revise · ❌ reject`,
    });

    if (embed) {
      const msg = await groupCh.send({ embeds: [embed] });
      // Add reaction buttons
      await msg.react('✅');
      await msg.react('🔄');
      await msg.react('❌');
      // Track for reaction handling
      pendingReviewMessages.set(msg.id, task.id);
      console.log(`[gummi] Review notification sent for ${task.id} (msg ${msg.id})`);
    }
  } catch (err) {
    console.error('[gummi] Review notification failed:', err.message);
  }
}

async function sendReviewFlag(taskId, concern) {
  try {
    const groupCh = await resolveChannel(CHANNEL_CONFIG.groupChannel);
    if (!groupCh) {
      console.warn('[review] Cannot send flag — group channel not found');
      return;
    }

    const embed = buildEmbed({
      title: `🚩 Review Flag: ${taskId}`,
      description: `**${AGENT_NAME}** flagged task **${taskId}** for your attention:\n\n${concern}`,
      color: '#d9534f',
      footer: `Use /review to see the task, /approve ${taskId} or /reject ${taskId}`,
    });

    if (embed) {
      await groupCh.send({ embeds: [embed] });
      console.log(`[review] Flag sent for ${taskId}`);
    }
  } catch (err) {
    console.error('[review] Flag notification failed:', err.message);
  }
}

// --- Trusted User Check ---
const TRUSTED_USER_IDS = process.env.TRUSTED_USER_IDS
  ? process.env.TRUSTED_USER_IDS.split(',').map(s => s.trim())
  : [];

client.on('messageCreate', async (message) => {
  // --- Guild filter: drop everything from non-allowed guilds immediately ---
  if (GUILD_ALLOWLIST && message.guild && !GUILD_ALLOWLIST.includes(message.guild.id)) return;

  // --- Channel digest: log guild messages to daily files (includes bot embeds) ---
  // Thread messages log under the parent channel name for unified conversation history.
  if (message.guild && message.channel.name && !message.content.startsWith('!')) {
    const isSelf = message.author.id === client.user.id;
    const displayContent = buildDigestContent(message.content, message.embeds);
    // Log all messages that have usable content (human, self, or bots with embeds)
    if (displayContent && displayContent.trim()) {
      const authorName = message.member?.displayName || message.author.displayName || message.author.username;
      const isThread = message.channel.isThread && message.channel.isThread();
      const channelName = isThread ? (message.channel.parent?.name || message.channel.name) : message.channel.name;
      const threadPrefix = isThread ? `[thread: ${message.channel.name}] ` : '';
      appendToDigest(channelName, authorName, threadPrefix + displayContent, message.createdAt.toISOString(), isSelf || message.author.bot);
    }
  }

  // Skip self
  if (message.author.id === client.user.id) return;


  // --- Review commands from trusted users (approve/revise/reject TASK_ID) ---
  if (!message.author.bot && TRUSTED_USER_IDS.includes(message.author.id)) {
    const reviewCmd = parseReviewCommand(message.content);
    if (reviewCmd) {
      try {
        if (reviewCmd.action === 'approve') {
          projectBoard.approveTask(reviewCmd.taskId);
          await message.react('✅');
          console.log(`[project] Task ${reviewCmd.taskId} approved by ${message.author.username}`);
        } else if (reviewCmd.action === 'revise') {
          projectBoard.requestRevision(reviewCmd.taskId, reviewCmd.feedback);
          await message.react('🔄');
          console.log(`[project] Task ${reviewCmd.taskId} revision requested by ${message.author.username}`);
        } else if (reviewCmd.action === 'reject') {
          projectBoard.rejectTask(reviewCmd.taskId, reviewCmd.feedback);
          await message.react('❌');
          console.log(`[project] Task ${reviewCmd.taskId} rejected by ${message.author.username}`);
        }
      } catch (err) {
        console.error(`[project] Review command failed: ${err.message}`);
        await message.react('💥').catch(() => {});
      }
      return; // Review command handled — don't process as normal message
    }
  }

  // Detect sibling agents
  const isSibling = message.author.bot && isSiblingAgent(message.author.id);

  // Skip bots (unless they're sibling agents)
  if (message.author.bot && !isSibling) return;

  // Skip sibling embed-only messages (review notifications, system embeds — not conversation)
  if (isSibling && !message.content.trim() && message.embeds.length > 0) return;

  // Skip ! commands (legacy Letta commands)
  if (message.content.startsWith('!')) return;

  // --- Track channel activity (guild-filtered) ---
  if (message.guild && (!GUILD_ALLOWLIST || GUILD_ALLOWLIST.includes(message.guild.id))) {
    if (message.author.bot) {
      _lastBotInChannel.set(message.channel.id, Date.now());
    } else {
      _lastHumanInChannel.set(message.channel.id, Date.now());
    }
  }

  // --- Passive listening: buffer messages while a session is active (guild-filtered) ---
  if (isActive() && (!GUILD_ALLOWLIST || !message.guild || GUILD_ALLOWLIST.includes(message.guild.id))) {
    const authorName = message.member?.displayName || message.author.displayName || message.author.username;
    const cleaned = cleanMentions(message.content, message);
    bufferMessage(message.channel.id, authorName, cleaned, message.author.id);
  }

  // --- Follow-up routing: check if agent asked this user a question or proposed a plan ---
  const pending = consumePending(message.channel.id, message.author.id);
  if (pending) {
    // Handle review follow-ups (revise/reject need feedback text)
    if (pending.type === 'revise-review' || pending.type === 'reject-review') {
      const feedback = message.content.trim();
      if (!feedback) return;
      try {
        const taskId = pending.content; // stored the taskId in content
        if (pending.type === 'revise-review') {
          projectBoard.requestRevision(taskId, feedback);
          await message.react('🔄');
          // Update the original review embed if we can find it
          for (const [msgId, tid] of pendingReviewMessages) {
            if (tid === taskId) {
              pendingReviewMessages.delete(msgId);
              break;
            }
          }
          console.log(`[project] Task ${taskId} revision requested: ${feedback}`);
        } else {
          projectBoard.rejectTask(taskId, feedback);
          await message.react('❌');
          for (const [msgId, tid] of pendingReviewMessages) {
            if (tid === taskId) {
              pendingReviewMessages.delete(msgId);
              break;
            }
          }
          console.log(`[project] Task ${taskId} rejected: ${feedback}`);
        }
      } catch (err) {
        console.error(`[project] Review follow-up failed: ${err.message}`);
        await message.react('💥').catch(() => {});
      }
      return;
    }

    const cleaned = cleanMentions(message.content, message);
    const senderName = message.member?.displayName || message.author.displayName || message.author.username;
    const stopTyping = startTyping(message.channel);

    try {
      const prefix = pending.type === 'ask'
        ? `[FOLLOW-UP — You asked: "${pending.content}" and ${senderName} replied:]`
        : `[PLAN RESPONSE — You proposed: "${pending.content}" and ${senderName} replied:]`;

      const response = await sendMessage(`${prefix}\n${cleaned}`, senderName, message.author.id, message.channel.id);

      if (!isNoResponse(response)) {
        await processAndSendResponse(response, message);
      }
    } catch (err) {
      console.error('[gummi] Error handling follow-up:', err);
      await message.react('💥').catch(() => {});
    } finally {
      stopTyping();
    }
    return; // Follow-up handled — don't fall through to normal trigger logic
  }

  // Check trigger: DM, bot @mentioned, replied to, or name mentioned
  const isDM = !message.guild;
  const isMentioned = message.mentions.has(client.user.id);
  const isReply = message.reference?.messageId
    ? (await message.channel.messages.fetch(message.reference.messageId).catch(() => null))?.author?.id === client.user.id
    : false;
  const isNameMentioned = !isDM && new RegExp('\\b' + AGENT_NAME + '\\b', 'i').test(message.content);

  // Trigger check — respond if directly addressed (mention, reply, name)
  // Follow-up routing is handled centrally by the coworker orchestrator — not here.
  // Siblings must also @mention or name-mention to get a response.
  if (!isDM && !isMentioned && !isReply && !isNameMentioned) return;

  // Loop protection: check agent chain depth
  if (!checkAgentChain(message.channel.id, isSibling)) return;

  // Determine if this is an implicit invocation (name only, no @mention or reply)
  const isImplicit = !isSibling && !isDM && !isMentioned && !isReply && isNameMentioned;

  // Channel allowlist (skip for DMs)
  if (!isDM && CHANNEL_ALLOWLIST && !CHANNEL_ALLOWLIST.includes(message.channel.id)) {
    console.log(`[gummi] Ignored message in non-allowed channel ${message.channel.id}`);
    return;
  }

  // Rate limit
  if (isRateLimited(message.author.id)) {
    console.log(`[gummi] Rate limited user ${message.author.username}`);
    await message.react('⏳').catch(() => {});
    return;
  }

  // Clean and sanitize
  const cleaned = cleanMentions(message.content, message);
  const check = sanitize(cleaned);
  if (!check.safe) {
    console.log(`[gummi] Blocked message from ${message.author.username}: ${check.reason}`);
    await message.react('🚫').catch(() => {});
    return;
  }

  // Start typing (skip for implicit mentions — Rhizo may choose not to respond)
  let stopTyping = () => {};
  if (!isImplicit) {
    stopTyping = startTyping(message.channel);
  }

  try {
    // Fetch thread context if in a thread, otherwise seed channel history on cold start
    let threadContext = '';
    const isThread = message.channel.isThread && message.channel.isThread();
    if (isThread) {
      threadContext = await fetchThreadContext(message);
    } else if (getBufferSize(message.channel.id) === 0) {
      await fetchAndSeedHistory(message);
    }

    const senderName = message.member?.displayName || message.author.displayName || message.author.username;
    let fullMessage = threadContext ? `${threadContext}${cleaned}` : cleaned;

    // Inject reaction context (so agent sees how people reacted to their messages)
    const reactionContext = getReactionContext();
    if (reactionContext) {
      fullMessage = reactionContext + fullMessage;
    }

    // Download and attach images
    if (message.attachments.size > 0) {
      const images = await downloadAttachments(message);
      if (images.length > 0) {
        const imageLines = images.map(img => {
          const desc = img.description ? ` (description: "${img.description}")` : '';
          return `- ${img.localPath}${desc}`;
        }).join('\n');
        fullMessage += `\n\n[Images attached — use Read to view them:]\n${imageLines}`;
      }
    }

    // Tag sibling agent messages
    if (isSibling) {
      const siblingName = message.member?.displayName || message.author.displayName || message.author.username;
      fullMessage = `[AGENT MESSAGE from ${siblingName} — this is a sibling agent in the Magi triad, not a human. Respond naturally as a colleague.]\n${fullMessage}`;
    }

    // For implicit invocations (name mentioned without @), ask agent to evaluate
    if (isImplicit) {
      fullMessage = `[IMPLICIT MENTION — your name appeared in this message, but you were NOT @mentioned or replied to. Evaluate whether you are being directly addressed or just referenced. If you are just being referenced or talked about, respond ONLY with [no-response]. If you are clearly being spoken to, respond normally.]\n${fullMessage}`;
    }

    // Commensurate response — match the weight of the incoming message (+2 words headroom)
    const isMagiAgent = MAGI_IDS.includes(PERSONALITY_ID);
    if (!isMagiAgent) {
      const wordCount = message.content.trim().split(/\s+/).length;
      let responseGuide;
      if (wordCount <= 3) {
        responseGuide = '[MATCH ENERGY — This is a very short message. Respond with 1-5 words. "hey?" → "hey!" / "what\'s up?" → "not much, you?" / "nice" → "right?" Don\'t over-explain or introduce yourself unprompted on short messages.]';
      } else if (wordCount <= 10) {
        responseGuide = '[MATCH ENERGY — This is a brief message. Keep your response to one casual sentence, roughly ' + (wordCount + 2) + ' words max.]';
      } else if (wordCount <= 30) {
        responseGuide = '[MATCH ENERGY — This is a moderate message. You can respond with 1-2 sentences, roughly ' + (wordCount + 2) + ' words max.]';
      }
      // longer messages get no constraint — respond naturally
      if (responseGuide) {
        fullMessage = responseGuide + '\n' + fullMessage;
      }
    }

    const response = await sendMessage(fullMessage, senderName, message.author.id, message.channel.id);

    // Check if agent decided not to respond (implicit mention, not addressed)
    if (isNoResponse(response)) {
      console.log(`[gummi] ${AGENT_NAME} chose not to respond (implicit mention, not addressed)`);
      return;
    }

    // Process tags, send response, handle ask/plan follow-ups
    await processAndSendResponse(response, message);
  } catch (err) {
    console.error('[gummi] Error handling message:', err);
    await message.react('💥').catch(() => {});
  } finally {
    stopTyping();
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[gummi] Shutting down...');
  scheduler.stop();
  healthReporter.stop();
  const { endSession } = require('./session-manager');
  await endSession();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[gummi] Shutting down...');
  scheduler.stop();
  healthReporter.stop();
  const { endSession } = require('./session-manager');
  await endSession();
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
