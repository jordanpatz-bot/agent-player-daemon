// Sibling Mail — file-based inter-agent communication
// Replaces Discord for sibling-to-sibling messaging (avoids security filter, Missing Access, wake issues)

const fs = require('fs');
const path = require('path');
const homedir = require('./home');

const MAGI_WORKSPACE = process.env.MAGI_WORKSPACE || process.env.RHIZO_WORKSPACE || path.join(homedir(), 'Desktop', 'Magi');
const PERSONALITY_ID = (process.env.PERSONALITY_ID || 'rhizo').toLowerCase();
const MAIL_ROOT = path.join(MAGI_WORKSPACE, 'Sibling_Mail');
const ARCHIVE_DIR = path.join(MAIL_ROOT, 'archive');

const MAX_INBOX = 10;
const DEFAULT_TTL_HOURS = 48;
const VALID_AGENTS = ['ecto', 'mico', 'rhizo'];

/**
 * Ensure mail directories exist for all agents.
 */
function ensureDirectories() {
  for (const agent of VALID_AGENTS) {
    fs.mkdirSync(path.join(MAIL_ROOT, agent, 'inbox'), { recursive: true });
  }
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

/**
 * Send a message to another agent's inbox.
 * Uses atomic write (tmp + rename) to prevent partial reads.
 *
 * @param {Object} opts
 * @param {string} opts.to - recipient agent id
 * @param {string} opts.subject - short description
 * @param {string} opts.body - full message
 * @param {string[]} [opts.domain] - domain tags for triage (e.g. ['systems', 'debugging'])
 * @param {string} [opts.priority] - 'low', 'normal', 'urgent'
 * @param {string|null} [opts.deadline] - ISO timestamp or null
 * @param {number} [opts.ttl] - hours until auto-archive (default 48)
 * @param {string|null} [opts.replyTo] - filename of message being replied to
 * @returns {string} filename of the sent message
 */
function sendMail(opts) {
  const { to, subject, body, domain = [], priority = 'normal', deadline = null, ttl = DEFAULT_TTL_HOURS, replyTo = null } = opts;

  if (!VALID_AGENTS.includes(to)) {
    throw new Error(`Invalid recipient: ${to}. Must be one of: ${VALID_AGENTS.join(', ')}`);
  }

  ensureDirectories();

  const timestamp = Date.now();
  const filename = `${timestamp}_${PERSONALITY_ID}.msg`;
  const inboxDir = path.join(MAIL_ROOT, to, 'inbox');

  // Enforce inbox cap — drop oldest if full
  const existing = listInbox(to);
  if (existing.length >= MAX_INBOX) {
    const toDrop = existing.slice(0, existing.length - MAX_INBOX + 1);
    for (const msg of toDrop) {
      archiveMessage(to, msg.filename);
    }
    console.log(`[sibling-mail] Inbox for ${to} was full — archived ${toDrop.length} oldest messages`);
  }

  const message = {
    from: PERSONALITY_ID,
    to,
    timestamp: new Date(timestamp).toISOString(),
    subject,
    body,
    domain,
    priority,
    deadline,
    ttl,
    replyTo,
  };

  // Atomic write
  const msgPath = path.join(inboxDir, filename);
  const tmpPath = msgPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(message, null, 2));
  fs.renameSync(tmpPath, msgPath);

  console.log(`[sibling-mail] Sent to ${to}: "${subject}" (${filename})`);
  return filename;
}

/**
 * List messages in an agent's inbox, sorted oldest first.
 * @param {string} [agent] - defaults to PERSONALITY_ID
 * @returns {Array<{filename, message}>}
 */
function listInbox(agent = PERSONALITY_ID) {
  const inboxDir = path.join(MAIL_ROOT, agent, 'inbox');
  try {
    if (!fs.existsSync(inboxDir)) return [];
  } catch { return []; }

  let files;
  try {
    files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.msg')).sort();
  } catch { return []; }

  const results = [];
  for (const filename of files) {
    try {
      const message = JSON.parse(fs.readFileSync(path.join(inboxDir, filename), 'utf-8'));
      results.push({ filename, message });
    } catch (err) {
      console.warn(`[sibling-mail] Bad message file ${filename}: ${err.message}`);
    }
  }
  return results;
}

/**
 * Read and archive a specific message (marks it as processed).
 * @param {string} agent
 * @param {string} filename
 * @returns {Object|null} the message, or null if not found
 */
function readAndArchive(agent, filename) {
  const msgPath = path.join(MAIL_ROOT, agent, 'inbox', filename);
  try {
    const message = JSON.parse(fs.readFileSync(msgPath, 'utf-8'));
    archiveMessage(agent, filename);
    return message;
  } catch {
    return null;
  }
}

/**
 * Move a message to the archive.
 */
function archiveMessage(agent, filename) {
  const src = path.join(MAIL_ROOT, agent, 'inbox', filename);
  const dest = path.join(ARCHIVE_DIR, `${agent}_${filename}`);
  try {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    fs.renameSync(src, dest);
    console.log(`[sibling-mail] Archived: ${agent}/${filename}`);
  } catch (err) {
    console.warn(`[sibling-mail] Archive failed for ${filename}: ${err.message}`);
  }
}

/**
 * Clean up expired messages across all inboxes (call periodically).
 */
function cleanExpired() {
  const now = Date.now();
  let cleaned = 0;

  for (const agent of VALID_AGENTS) {
    const messages = listInbox(agent);
    for (const { filename, message } of messages) {
      const created = new Date(message.timestamp).getTime();
      const ttlMs = (message.ttl || DEFAULT_TTL_HOURS) * 3600_000;
      if (now - created > ttlMs) {
        archiveMessage(agent, filename);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[sibling-mail] Cleaned ${cleaned} expired messages`);
  }
  return cleaned;
}

/**
 * Get my inbox — convenience for current agent.
 * @returns {Array<{filename, message}>}
 */
function getMyInbox() {
  return listInbox(PERSONALITY_ID);
}

/**
 * Check if current agent has unread mail.
 * @returns {number} count of messages
 */
function getInboxCount() {
  return getMyInbox().length;
}

/**
 * Format inbox as readable summary for the agent prompt.
 * @returns {string}
 */
function formatInboxSummary() {
  const messages = getMyInbox();
  if (messages.length === 0) return '';

  const lines = [`**INBOX:** ${messages.length} message(s)`];
  for (const { filename, message } of messages) {
    const age = Math.round((Date.now() - new Date(message.timestamp).getTime()) / 3600_000);
    const pri = message.priority !== 'normal' ? ` [${message.priority.toUpperCase()}]` : '';
    const tags = message.domain?.length > 0 ? ` (${message.domain.join(', ')})` : '';
    lines.push(`  - From **${message.from}**: "${message.subject}"${pri}${tags} — ${age}h ago`);
  }
  return lines.join('\n');
}

/**
 * Send an auto-help-request when a backlog item has been retried too many times.
 * @param {Object} task - the backlog task with retryCount
 */
function sendHelpRequest(task) {
  const recipients = VALID_AGENTS.filter(a => a !== PERSONALITY_ID);

  for (const to of recipients) {
    sendMail({
      to,
      subject: `Stuck on: ${task.description}`,
      body: `I've attempted this task ${task.retryCount} times without completing it.\n\nTask: ${task.description}\nCreated: ${task.createdAt}\nLast attempted: ${task.lastWorkedAt}\n\nIf you have domain expertise that could help, any advice is welcome.`,
      domain: ['help-request'],
      priority: 'normal',
      ttl: 48,
    });
  }

  console.log(`[sibling-mail] Auto-help-request sent for task "${task.description}" (${task.retryCount} retries)`);
}

module.exports = {
  sendMail,
  listInbox,
  getMyInbox,
  getInboxCount,
  readAndArchive,
  archiveMessage,
  cleanExpired,
  formatInboxSummary,
  sendHelpRequest,
  ensureDirectories,
  MAIL_ROOT,
  VALID_AGENTS,
};
