// Discord utilities — message splitting, typing indicators, tag parsing

const DISCORD_MESSAGE_LIMIT = 2000;

// --- Tag Parsing ---

/**
 * Extract [react:emoji] tags from text.
 * Returns array of emoji strings.
 */
function parseReactions(text) {
  const reactions = [];
  const pattern = /\[react:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    reactions.push(match[1].trim());
  }
  return reactions;
}

/**
 * Extract [bookmark:label] tags from text.
 * Returns array of label strings.
 */
function parseBookmarks(text) {
  const bookmarks = [];
  const pattern = /\[bookmark:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    bookmarks.push(match[1].trim());
  }
  return bookmarks;
}

/**
 * Check if response contains a [no-response] tag, meaning the bot
 * decided it was only referenced (not addressed) and should stay quiet.
 */
function isNoResponse(text) {
  return /\[no-response\]/i.test(text);
}

/**
 * Extract [send:#channel-name] tag from text.
 * Returns channel name (without #) or null.
 * Only the first tag is used if multiple are present.
 */
function parseSendTarget(text) {
  const match = text.match(/\[send:#([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Extract [focus:description] tag. Returns description string or null.
 * Only the first tag is used.
 */
function parseFocus(text) {
  const match = text.match(/\[focus:([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Check for [focus-done] tag.
 */
function isFocusDone(text) {
  return /\[focus-done\]/i.test(text);
}

/**
 * Extract [backlog:description] tags. Returns array of description strings.
 */
function parseBacklog(text) {
  const items = [];
  const pattern = /\[backlog:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    items.push(match[1].trim());
  }
  return items;
}

/**
 * Extract [backlog-done:ID] tags. Returns array of IDs.
 */
function parseBacklogDone(text) {
  const ids = [];
  const pattern = /\[backlog-done:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    ids.push(match[1].trim());
  }
  return ids;
}

/**
 * Extract [timer:DURATION:DESCRIPTION] tags.
 * Returns array of { duration: string, description: string }.
 */
function parseTimerTags(text) {
  const tags = [];
  const pattern = /\[timer:([^\]:]+):([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    tags.push({ duration: match[1].trim(), description: match[2].trim() });
  }
  return tags;
}

/**
 * Extract [daily:HH:MM:description] tags. Returns array of { timeOfDay, description }.
 */
function parseDaily(text) {
  const tags = [];
  const pattern = /\[daily:(\d{1,2}:\d{2}):([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    tags.push({ timeOfDay: match[1].trim(), description: match[2].trim() });
  }
  return tags;
}

/**
 * Extract [daily-done:ID] tags. Returns array of IDs.
 */
function parseDailyDone(text) {
  const ids = [];
  const pattern = /\[daily-done:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    ids.push(match[1].trim());
  }
  return ids;
}

/**
 * Extract [event:description] tags. Proposes a future drama/scenario event.
 */
function parseEventProposal(text) {
  const proposals = [];
  const pattern = /\[event:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    proposals.push(match[1].trim());
  }
  return proposals;
}

/**
 * Extract [cancel:ID] tags. Returns array of IDs (for timers, backlog, or daily items).
 */
function parseCancel(text) {
  const ids = [];
  const pattern = /\[cancel:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    ids.push(match[1].trim());
  }
  return ids;
}

/**
 * Extract [sprite:filepath] tags from text.
 * Returns array of sprite JSON file path strings.
 */
function parseSpriteTags(text) {
  const sprites = [];
  const pattern = /\[sprite:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    sprites.push(match[1].trim());
  }
  return sprites;
}

/**
 * Extract [attach:filepath] tags from text.
 * Returns array of file path strings.
 */
function parseAttachments(text) {
  const attachments = [];
  const pattern = /\[attach:([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    attachments.push(match[1].trim());
  }
  return attachments;
}

/**
 * Extract [embed:{json}] tags from text using bracket-balanced parsing.
 * Returns array of parsed embed data objects.
 * Uses brace-balancing because JSON contains ] characters that break simple regex.
 */
function parseEmbeds(text) {
  const embeds = [];
  const marker = '[embed:';
  let searchFrom = 0;

  while (true) {
    const idx = text.indexOf(marker, searchFrom);
    if (idx === -1) break;

    const jsonStart = idx + marker.length;
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }

    if (jsonEnd === -1) { searchFrom = jsonStart; continue; }

    try {
      embeds.push(JSON.parse(text.substring(jsonStart, jsonEnd)));
    } catch (e) {
      console.warn('[discord-util] Invalid embed JSON:', e.message);
    }
    searchFrom = jsonEnd;
  }

  return embeds;
}

/**
 * Extract [reply-to:messageId] tag. Returns message ID string or null.
 */
function parseReplyTo(text) {
  const match = text.match(/\[reply-to:(\d+)\]/);
  return match ? match[1] : null;
}

/**
 * Extract [ask:question] tag. Returns the question string or null.
 * Only the first tag is used — one question at a time.
 */
function parseAskTag(text) {
  const match = text.match(/\[ask:([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Extract [plan:description] tag. Returns the plan description or null.
 * Only the first tag is used.
 */
function parsePlanTag(text) {
  const match = text.match(/\[plan:([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

/**
 * Extract [project-complete:TASK_ID:output_path] tag.
 */
function parseProjectComplete(text) {
  const match = text.match(/\[project-complete:([^:\]]+):([^\]]+)\]/);
  return match ? { taskId: match[1].trim(), output: match[2].trim() } : null;
}

/**
 * Extract [project-fail:TASK_ID:reason] tag.
 */
function parseProjectFail(text) {
  const match = text.match(/\[project-fail:([^:\]]+):([^\]]+)\]/);
  return match ? { taskId: match[1].trim(), reason: match[2].trim() } : null;
}

/**
 * Strip all [embed:{...}] tags using brace-balanced parsing.
 */
function stripEmbedTags(text) {
  const marker = '[embed:';
  let result = text;

  while (true) {
    const idx = result.indexOf(marker);
    if (idx === -1) break;

    const jsonStart = idx + marker.length;
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < result.length; i++) {
      if (result[i] === '{') depth++;
      else if (result[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i + 1; break; }
      }
    }

    if (jsonEnd === -1) break;
    // Also strip the closing ] if present
    const end = result[jsonEnd] === ']' ? jsonEnd + 1 : jsonEnd;
    result = result.substring(0, idx) + result.substring(end);
  }

  return result;
}

/**
 * Strip all special tags from text before posting to Discord.
 */
function stripTags(text) {
  let result = text
    .replace(/\[react:[^\]]+\]/g, '')
    .replace(/\[bookmark:[^\]]+\]/g, '')
    .replace(/\[send:#[^\]]+\]/g, '')
    .replace(/\[reply-to:\d+\]/g, '')
    .replace(/\[focus:[^\]]+\]/g, '')
    .replace(/\[focus-done\]/gi, '')
    .replace(/\[backlog:[^\]]+\]/g, '')
    .replace(/\[backlog-done:[^\]]+\]/g, '')
    .replace(/\[timer:[^\]]+\]/g, '')
    .replace(/\[cancel:[^\]]+\]/g, '')
    .replace(/\[attach:[^\]]+\]/g, '')
    .replace(/\[sprite:[^\]]+\]/g, '')
    .replace(/\[ask:[^\]]+\]/g, '')
    .replace(/\[plan:[^\]]+\]/g, '')
    .replace(/\[project-complete:[^\]]+\]/g, '')
    .replace(/\[project-fail:[^\]]+\]/g, '')
    .replace(/\[project-insight:[^\]]+\]/g, '')
    .replace(/\[mail:\w+:[^\]]+\]/g, '')
    .replace(/\[no-response\]/gi, '')
    // Legacy tags
    .replace(/\[schedule:[^\]]+\]/g, '')
    .replace(/\[unschedule:[^\]]+\]/g, '');

  result = stripEmbedTags(result);
  return result.trim();
}

// --- Message Splitting (ported from messages.ts) ---

function splitText(text, limit) {
  if (text.length <= limit) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = limit;
    const lastNewline = remaining.lastIndexOf('\n', splitIndex);
    if (lastNewline > splitIndex * 0.5) {
      splitIndex = lastNewline + 1;
    } else {
      const lastSpace = remaining.lastIndexOf(' ', splitIndex);
      if (lastSpace > splitIndex * 0.5) {
        splitIndex = lastSpace + 1;
      }
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex);
  }

  return chunks;
}

function splitCodeBlock(block, limit) {
  if (block.length <= limit) return [block];

  const openMatch = block.match(/^```(\w*)\n?/);
  const openTag = openMatch ? openMatch[0] : '```\n';
  const closeTag = '```';

  const innerContent = block.substring(openTag.length, block.length - closeTag.length);
  const overhead = openTag.length + closeTag.length;
  const maxInnerLength = limit - overhead;

  if (maxInnerLength <= 0) return [block];

  const chunks = [];
  let remaining = innerContent;

  while (remaining.length > 0) {
    if (remaining.length <= maxInnerLength) {
      chunks.push(openTag + remaining + closeTag);
      break;
    }

    let splitIndex = maxInnerLength;
    const lastNewline = remaining.lastIndexOf('\n', splitIndex);
    if (lastNewline > splitIndex * 0.5) {
      splitIndex = lastNewline + 1;
    }

    chunks.push(openTag + remaining.substring(0, splitIndex) + closeTag);
    remaining = remaining.substring(splitIndex);
  }

  return chunks;
}

/**
 * Split a message into chunks that fit Discord's 2000-char limit.
 * Handles code blocks gracefully.
 */
function splitMessage(content, limit = DISCORD_MESSAGE_LIMIT) {
  if (content.length <= limit) return [content];

  const result = [];
  const codeBlockRegex = /```[\s\S]*?```/g;

  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore.trim()) {
      result.push(...splitText(textBefore, limit));
    }

    result.push(...splitCodeBlock(match[0], limit));
    lastIndex = match.index + match[0].length;
  }

  const textAfter = content.substring(lastIndex);
  if (textAfter.trim()) {
    result.push(...splitText(textAfter, limit));
  }

  return result.length > 0 ? result : [content];
}

// --- Typing Indicator ---

const MAX_TYPING_DURATION = 3 * 60 * 1000; // 3 minutes safety cap
const activeTypingIntervals = new Map(); // channelId -> { interval, timeout, startedAt }

/**
 * Start a typing indicator loop. Returns a function to stop it.
 * Includes a safety timeout to prevent orphaned intervals from typing forever.
 */
function startTyping(channel) {
  // Clear any existing typing on this channel first (prevents stacking)
  stopTypingForChannel(channel.id);

  channel.sendTyping().catch(() => {});
  const interval = setInterval(() => {
    channel.sendTyping().catch(() => {});
  }, 8000);

  // Safety: auto-clear after MAX_TYPING_DURATION
  const timeout = setTimeout(() => {
    clearInterval(interval);
    activeTypingIntervals.delete(channel.id);
    console.warn(`[typing] Safety timeout: force-cleared typing for channel ${channel.id}`);
  }, MAX_TYPING_DURATION);

  activeTypingIntervals.set(channel.id, { interval, timeout, startedAt: Date.now() });

  return () => {
    clearInterval(interval);
    clearTimeout(timeout);
    activeTypingIntervals.delete(channel.id);
  };
}

/**
 * Force-stop typing for a specific channel. Used to clean up orphaned intervals.
 */
function stopTypingForChannel(channelId) {
  const entry = activeTypingIntervals.get(channelId);
  if (entry) {
    clearInterval(entry.interval);
    clearTimeout(entry.timeout);
    activeTypingIntervals.delete(channelId);
  }
}

/**
 * Extract [project-insight:TASK_ID:observation] tags.
 * Returns array of { taskId, insight }.
 */
function parseProjectInsight(text) {
  const insights = [];
  const pattern = /\[project-insight:([^:\]]+):([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    insights.push({ taskId: match[1].trim(), insight: match[2].trim() });
  }
  return insights;
}

/**
 * Extract [mail:agent:subject] tags. Returns array of { to, subject }.
 * The message body is the visible text of the response (caller provides it).
 */
function parseMailTags(text) {
  const tags = [];
  const pattern = /\[mail:(\w+):([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    tags.push({ to: match[1].trim().toLowerCase(), subject: match[2].trim() });
  }
  return tags;
}

/**
 * Parse review commands from trusted user messages.
 * Matches: "approve TASK_ID", "revise TASK_ID feedback...", "reject TASK_ID reason..."
 * Returns { action, taskId, feedback } or null.
 */
function parseReviewCommand(text) {
  const trimmed = text.trim();

  const approveMatch = trimmed.match(/^approve\s+(\S+)\s*$/i);
  if (approveMatch) return { action: 'approve', taskId: approveMatch[1], feedback: null };

  const reviseMatch = trimmed.match(/^revise\s+(\S+)\s+(.+)$/is);
  if (reviseMatch) return { action: 'revise', taskId: reviseMatch[1], feedback: reviseMatch[2].trim() };

  const rejectMatch = trimmed.match(/^reject\s+(\S+)\s+(.+)$/is);
  if (rejectMatch) return { action: 'reject', taskId: rejectMatch[1], feedback: rejectMatch[2].trim() };

  return null;
}

module.exports = {
  parseReactions,
  parseBookmarks,
  parseSendTarget,
  parseEmbeds,
  parseReplyTo,
  parseAskTag,
  parsePlanTag,
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
  parseProjectComplete,
  parseProjectFail,
  isNoResponse,
  stripTags,
  splitMessage,
  startTyping,
  stopTypingForChannel,
  parseReviewCommand,
  parseProjectInsight,
  parseMailTags,
  DISCORD_MESSAGE_LIMIT,
};
