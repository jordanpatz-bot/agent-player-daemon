// Channel digest — appends every guild message to daily text files in the workspace.
// Files are organized as: channel-history/<channel-name>/YYYY-MM-DD.txt
// Agents can Read/Grep these to catch up on conversations in any channel.

const fs = require('fs');
const path = require('path');

const MAGI_WORKSPACE = process.env.MAGI_WORKSPACE || process.env.RHIZO_WORKSPACE || path.join(require('os').homedir(), 'Desktop', 'Magi');
const DIGEST_ENABLED = process.env.ENABLE_DIGEST !== 'false'; // default true for backward compat
const DIGEST_DIR = path.join(MAGI_WORKSPACE, 'channel-history');
const RETENTION_DAYS = parseInt(process.env.DIGEST_RETENTION_DAYS || '365', 10);

/**
 * Extract readable text from Discord message embeds.
 * Returns a string combining embed descriptions/titles, or empty string if none.
 */
function extractEmbedText(embeds) {
  if (!embeds || embeds.length === 0) return '';
  const parts = [];
  for (const embed of embeds) {
    if (embed.description) parts.push(embed.description);
    else if (embed.title) parts.push(embed.title);
  }
  return parts.join(' | ');
}

/**
 * Build display content from a Discord message, falling back to embed text
 * when message content is empty (common for link-preview bots like FixTweet).
 */
function buildDigestContent(content, embeds) {
  if (content && content.trim()) return content;
  const embedText = extractEmbedText(embeds);
  return embedText || content;
}

/**
 * Append a message to the appropriate daily digest file.
 * Creates directories and files as needed.
 */
function appendToDigest(channelName, authorName, content, timestamp, isBot) {
  if (!DIGEST_ENABLED) return;
  try {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = date.toTimeString().slice(0, 5);  // HH:MM

    // Sanitize channel name for filesystem
    const safeName = channelName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const channelDir = path.join(DIGEST_DIR, safeName);
    const filePath = path.join(channelDir, `${dateStr}.txt`);

    // Ensure directory exists
    fs.mkdirSync(channelDir, { recursive: true });

    // Write header if new file
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# #${channelName} — ${dateStr}\n\n`, 'utf-8');
    }

    // Truncate long messages for the digest
    const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
    const prefix = isBot ? `[${timeStr}] *${authorName}*` : `[${timeStr}] ${authorName}`;
    const line = `${prefix}: ${truncated}\n`;

    fs.appendFileSync(filePath, line, 'utf-8');
  } catch (err) {
    // Non-fatal — don't let digest failures break message handling
    console.error('[gummi] Digest append failed:', err.message);
  }
}

/**
 * Prune digest files older than RETENTION_DAYS.
 * Called on startup.
 */
function pruneOldDigests() {
  try {
    if (!fs.existsSync(DIGEST_DIR)) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    let pruned = 0;
    const channels = fs.readdirSync(DIGEST_DIR);

    for (const channel of channels) {
      const channelDir = path.join(DIGEST_DIR, channel);
      if (!fs.statSync(channelDir).isDirectory()) continue;

      const files = fs.readdirSync(channelDir);
      for (const file of files) {
        // Files are named YYYY-MM-DD.txt — compare date prefix
        const fileDate = file.replace('.txt', '');
        if (fileDate < cutoffStr) {
          fs.unlinkSync(path.join(channelDir, file));
          pruned++;
        }
      }

      // Remove empty channel directories
      const remaining = fs.readdirSync(channelDir);
      if (remaining.length === 0) {
        fs.rmdirSync(channelDir);
      }
    }

    if (pruned > 0) {
      console.log(`[gummi] Pruned ${pruned} digest files older than ${RETENTION_DAYS} days`);
    }
  } catch (err) {
    console.error('[gummi] Digest pruning failed:', err.message);
  }
}

const BACKFILL_MESSAGES = 20; // messages per channel on startup catch-up (only need recent ones)
const BACKFILL_DELAY_MS = 500; // delay between channels to avoid rate limits
const BACKFILL_SKIP_IF_RECENT_MS = 5 * 60 * 1000; // skip channels with digest entries < 5 min old

/**
 * Find the newest message timestamp already recorded in a channel's digest files.
 * Returns null if no digest files exist for this channel.
 */
function getNewestDigestTimestamp(safeName) {
  const channelDir = path.join(DIGEST_DIR, safeName);
  if (!fs.existsSync(channelDir)) return null;

  const files = fs.readdirSync(channelDir)
    .filter(f => f.endsWith('.txt'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  // Read the newest file and find the last [HH:MM] timestamp line
  const newestFile = path.join(channelDir, files[0]);
  const content = fs.readFileSync(newestFile, 'utf-8');
  const lines = content.split('\n');
  const dateStr = files[0].replace('.txt', ''); // YYYY-MM-DD

  // Walk backwards to find the last timestamped message line
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/^\[(\d{2}:\d{2})\]/);
    if (match) {
      return new Date(`${dateStr}T${match[1]}:00Z`); // pad to start of that minute — may re-append same-minute messages, but never drops them
    }
  }

  return null;
}

/**
 * Backfill digest files from Discord channel history on startup.
 * Fetches recent messages from all accessible text channels and active threads.
 * Only appends messages newer than the most recent entry already in the digest files,
 * preventing duplication across bot restarts.
 */
async function backfillDigests(client, botId) {
  if (!DIGEST_ENABLED) {
    console.log('[gummi] Channel digest disabled — skipping backfill');
    return;
  }
  console.log('[gummi] Starting channel history backfill...');
  let channelCount = 0;
  let messageCount = 0;
  let skippedDupe = 0;

  for (const guild of client.guilds.cache.values()) {
    // Collect text channels
    const textChannels = guild.channels.cache.filter(
      ch => ch.isTextBased() && !ch.isThread() && ch.viewable
    );

    // Fetch active threads
    let activeThreads = [];
    try {
      const fetched = await guild.channels.fetchActiveThreads();
      activeThreads = Array.from(fetched.threads.values()).filter(t => t.viewable);
    } catch (err) {
      console.error(`[gummi] Failed to fetch threads for ${guild.name}:`, err.message);
    }

    const allChannels = [...textChannels.values(), ...activeThreads];

    for (const channel of allChannels) {
      const channelName = channel.name || 'unnamed';
      const safeName = channelName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

      // Find the newest timestamp already in our digest files for this channel
      const newestExisting = getNewestDigestTimestamp(safeName);

      // Skip channels where we have very recent data (bot was barely down)
      if (newestExisting && (Date.now() - newestExisting.getTime()) < BACKFILL_SKIP_IF_RECENT_MS) {
        continue;
      }

      try {
        const fetched = await channel.messages.fetch({ limit: BACKFILL_MESSAGES });
        const sorted = Array.from(fetched.values())
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .filter(msg => !msg.content.startsWith('!'));

        let channelAdded = 0;
        for (const msg of sorted) {
          const isSelf = msg.author.id === botId;

          // Skip messages we've already recorded
          if (newestExisting && msg.createdAt <= newestExisting) {
            skippedDupe++;
            continue;
          }

          const displayContent = buildDigestContent(msg.content, msg.embeds);
          // Skip messages with no usable content (empty text + no embeds)
          if (!displayContent || !displayContent.trim()) continue;

          const authorName = msg.member?.displayName || msg.author.displayName || msg.author.username;
          appendToDigest(channelName, authorName, displayContent, msg.createdAt.toISOString(), isSelf || msg.author.bot);
          messageCount++;
          channelAdded++;
        }

        if (channelAdded > 0) channelCount++;
      } catch (err) {
        // Permission errors etc — skip silently
        console.error(`[gummi] Backfill failed for #${channelName}:`, err.message);
      }

      // Rate limit courtesy
      await new Promise(r => setTimeout(r, BACKFILL_DELAY_MS));
    }
  }

  console.log(`[gummi] Backfill complete — ${messageCount} new messages from ${channelCount} channels (${skippedDupe} already recorded, skipped)`);
}

module.exports = { appendToDigest, pruneOldDigests, backfillDigests, buildDigestContent, DIGEST_DIR };
