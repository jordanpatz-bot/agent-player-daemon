// Work queue scheduler — focus mode + background backlog + one-off timers
// Replaces the old arbitrary recurring task system

const fs = require('fs');
const path = require('path');
const homedir = require('./home');

const MAGI_WORKSPACE = process.env.MAGI_WORKSPACE || process.env.RHIZO_WORKSPACE || path.join(homedir(), 'Desktop', 'Magi');
const PERSONALITY_ID = process.env.PERSONALITY_ID || 'rhizo';

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const SCHEDULES_PATH = path.join(MAGI_WORKSPACE, `schedules-${PERSONALITY_ID}.json`);

const CHECK_INTERVAL_MS = 15_000;        // check every 15 seconds
const FOCUS_INTERVAL_MS = 10 * 60_000;   // focus check-in every 10 minutes
const BACKGROUND_INTERVAL_MS = 60 * 60_000; // background work every hour
const WAKE_CHECK_INTERVAL_MS = 30 * 60_000; // check sibling wakes every 30 min
const MAIL_CHECK_INTERVAL_MS = 30 * 60_000; // check sibling mail every 30 min
const PROJECT_CHECK_INTERVAL_MS = 5 * 60_000; // check project board every 5 min
const MAX_BACKLOG = 10;
const RETRY_HELP_THRESHOLD = 3;  // auto-send help request after this many retries
const RETRY_PAUSE_THRESHOLD = 5; // auto-pause task after this many retries

/**
 * Parse a duration string like "30m", "2h", "1d" into milliseconds.
 */
function parseDuration(str) {
  const match = str.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'm': return num * 60_000;
    case 'h': return num * 3_600_000;
    case 'd': return num * 86_400_000;
    default: return null;
  }
}

function formatDuration(ms) {
  if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)}d`;
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 60_000)}m`;
}

class Scheduler {
  constructor() {
    this.data = this._load();
    this.checkInterval = null;
    this.onFire = null;
    this.isBusy = false;
    this.lastBackgroundFire = this.data._lastBackgroundFire || 0;
    this.lastWakeCheck = 0;
    this.lastMailCheck = 0;
    this.lastProjectCheck = 0;
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf-8'));

      // Migration: old format was a flat array of recurring/once tasks
      if (Array.isArray(raw)) {
        console.log(`[scheduler] Migrating ${raw.length} old-format tasks to backlog`);
        const backlog = raw
          .filter(t => t.type === 'recurring')
          .slice(0, MAX_BACKLOG)
          .map(t => ({
            id: t.id,
            description: t.description,
            createdAt: t.createdAt,
            lastWorkedAt: null,
          }));
        return { focus: null, backlog, timers: [], daily: [] };
      }

      return {
        focus: raw.focus || null,
        backlog: raw.backlog || [],
        timers: raw.timers || [],
        daily: raw.daily || [],
      };
    } catch {
      return { focus: null, backlog: [], timers: [], daily: [] };
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(SCHEDULES_PATH), { recursive: true });
    const saveData = {
      focus: this.data.focus,
      backlog: this.data.backlog,
      timers: this.data.timers,
      daily: this.data.daily,
      _lastBackgroundFire: this.lastBackgroundFire,
    };
    const tmp = SCHEDULES_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(saveData, null, 2));
    fs.renameSync(tmp, SCHEDULES_PATH);
  }

  /**
   * Start the check loop. onFire is called with (mode, task) when work is due.
   * mode is 'focus', 'background', or 'timer'.
   */
  start(onFire) {
    this.onFire = onFire;
    this.checkInterval = setInterval(() => this._check(), CHECK_INTERVAL_MS);

    const summary = [];
    if (this.data.focus) summary.push(`focus: "${this.data.focus.description}"`);
    summary.push(`${this.data.backlog.length} backlog items`);
    summary.push(`${this.data.timers.length} timers`);
    console.log(`[scheduler] Started — ${summary.join(', ')}`);

    // Check shortly after startup for any overdue work
    setTimeout(() => this._check(), 5000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // --- Focus ---

  setFocus(description) {
    this.data.focus = {
      description,
      createdAt: new Date().toISOString(),
      checkIns: 0,
      lastCheckIn: null,
    };
    this._save();
    console.log(`[scheduler] Focus set: "${description}"`);
  }

  clearFocus() {
    if (this.data.focus) {
      console.log(`[scheduler] Focus completed: "${this.data.focus.description}" (${this.data.focus.checkIns} check-ins)`);
      this.data.focus = null;
      this._save();
    }
  }

  // --- Backlog ---

  addBacklog(description) {
    if (this.data.backlog.length >= MAX_BACKLOG) {
      console.warn(`[scheduler] Backlog full (${MAX_BACKLOG}), rejecting: "${description}"`);
      return null;
    }
    const id = Math.random().toString(36).substring(2, 8);
    this.data.backlog.push({
      id,
      description,
      createdAt: new Date().toISOString(),
      lastWorkedAt: null,
    });
    this._save();
    console.log(`[scheduler] Backlog added: "${description}" (${id})`);
    return id;
  }

  removeBacklog(id) {
    const idx = this.data.backlog.findIndex(b => b.id === id);
    if (idx >= 0) {
      const removed = this.data.backlog.splice(idx, 1)[0];
      this._save();
      console.log(`[scheduler] Backlog removed: "${removed.description}" (${id})`);
      return removed;
    }
    return null;
  }

  // --- Timers ---

  addTimer(durationMs, description) {
    const id = Math.random().toString(36).substring(2, 8);
    this.data.timers.push({
      id,
      description,
      fireAt: Date.now() + durationMs,
      createdAt: new Date().toISOString(),
    });
    this._save();
    console.log(`[scheduler] Timer set: "${description}" (${id}), fires in ${formatDuration(durationMs)}`);
    return id;
  }

  removeTimer(id) {
    const idx = this.data.timers.findIndex(t => t.id === id);
    if (idx >= 0) {
      const removed = this.data.timers.splice(idx, 1)[0];
      this._save();
      console.log(`[scheduler] Timer removed: "${removed.description}" (${id})`);
      return removed;
    }
    return null;
  }

  // --- Daily Tasks ---

  addDaily(description, timeOfDay) {
    const id = Math.random().toString(36).substring(2, 8);
    this.data.daily.push({
      id,
      description,
      timeOfDay,       // "HH:MM" in local time
      lastExecuted: null,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    this._save();
    console.log(`[scheduler] Daily task added: "${description}" at ${timeOfDay} (${id})`);
    return id;
  }

  removeDaily(id) {
    const idx = this.data.daily.findIndex(d => d.id === id);
    if (idx >= 0) {
      const removed = this.data.daily.splice(idx, 1)[0];
      this._save();
      console.log(`[scheduler] Daily task removed: "${removed.description}" (${id})`);
      return removed;
    }
    return null;
  }

  /** Find the next daily task that's due today but hasn't executed yet. */
  _nextDailyTask() {
    if (this.data.daily.length === 0) return null;
    const now = new Date();
    const todayStr = localDateKey(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const task of this.data.daily) {
      if (!task.enabled) continue;
      if (task.lastExecuted === todayStr) continue;
      const [h, m] = task.timeOfDay.split(':').map(Number);
      if (nowMinutes >= h * 60 + m) {
        return task;
      }
    }
    return null;
  }

  // --- Query ---

  /** Get the next backlog item to work on (least recently worked). */
  _nextBacklogItem() {
    if (this.data.backlog.length === 0) return null;
    return this.data.backlog.reduce((oldest, item) => {
      if (!oldest) return item;
      const oldestTime = oldest.lastWorkedAt ? new Date(oldest.lastWorkedAt).getTime() : 0;
      const itemTime = item.lastWorkedAt ? new Date(item.lastWorkedAt).getTime() : 0;
      return itemTime < oldestTime ? item : oldest;
    }, null);
  }

  /** Format work queue as readable text for the agent. */
  listFormatted() {
    const lines = [];

    // Project board summary
    try {
      const { getProjectSummary } = require('./project-board');
      const summary = getProjectSummary();
      if (summary) {
        const status = Object.entries(summary.byStatus).map(([k, v]) => `${v} ${k}`).join(', ');
        lines.push(`**PROJECT:** "${summary.name}" (${summary.phase}) — ${status} — ${summary.myReadyTasks} ready for you`);
      }
    } catch { /* no board */ }

    if (this.data.focus) {
      lines.push(`**FOCUS:** "${this.data.focus.description}" (${this.data.focus.checkIns} check-ins since ${this.data.focus.createdAt})`);
    } else {
      lines.push(`**FOCUS:** none`);
    }

    // Sibling mail summary
    try {
      const { formatInboxSummary } = require('./sibling-mail');
      const inboxSummary = formatInboxSummary();
      if (inboxSummary) lines.push(inboxSummary);
    } catch { /* sibling-mail not available yet */ }

    if (this.data.backlog.length > 0) {
      lines.push(`**BACKLOG:** (${this.data.backlog.length}/${MAX_BACKLOG})`);
      for (const item of this.data.backlog) {
        const worked = item.lastWorkedAt ? `last worked ${item.lastWorkedAt}` : 'not started';
        const retries = item.retryCount ? ` [${item.retryCount} retries]` : '';
        const paused = item.paused ? ' **PAUSED**' : '';
        lines.push(`  - [${item.id}] "${item.description}" (${worked})${retries}${paused}`);
      }
    } else {
      lines.push(`**BACKLOG:** empty`);
    }

    if (this.data.daily.length > 0) {
      const todayStr = localDateKey();
      lines.push(`**DAILY:**`);
      for (const task of this.data.daily) {
        const status = !task.enabled ? 'disabled'
          : task.lastExecuted === todayStr ? 'done today'
          : `due at ${task.timeOfDay}`;
        lines.push(`  - [${task.id}] "${task.description}" (${status})`);
      }
    }

    if (this.data.timers.length > 0) {
      lines.push(`**TIMERS:**`);
      for (const timer of this.data.timers) {
        const timeLeft = Math.max(0, timer.fireAt - Date.now());
        lines.push(`  - [${timer.id}] "${timer.description}" — fires in ${formatDuration(timeLeft)}`);
      }
    }

    return lines.join('\n');
  }

  // --- Project Board ---

  /** Check for ready project tasks assigned to this agent. Retry tasks take priority. */
  _nextProjectTask() {
    try {
      const { getMyTasks, getRetryTasks } = require('./project-board');

      // Retry tasks (validation-failed, revision-required) have priority
      // But enforce a 5-minute cooldown to prevent instant resubmission
      const RETRY_COOLDOWN_MS = 5 * 60 * 1000;
      const retries = getRetryTasks(PERSONALITY_ID);
      if (retries.length > 0) {
        const task = retries[0];
        const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : 0;
        if (Date.now() - completedAt < RETRY_COOLDOWN_MS) {
          // Too soon — skip this cycle, let the agent cool down
          return null;
        }
        return { ...task, _isRetry: true };
      }

      const tasks = getMyTasks(PERSONALITY_ID);
      if (tasks.length === 0) return null;

      const task = tasks[0];

      // Route to execution layer if explicitly opted in
      if (task.execution === true && task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        return { ...task, _useExecutionAgent: true };
      }

      return task;
    } catch {
      return null; // no board file or module error
    }
  }

  /** Reset in-progress tasks that have been stale for too long (agent died or hit max turns). */
  _checkStaleTasks() {
    const STALE_MS = 30 * 60 * 1000; // 30 minutes
    try {
      const { getBoard } = require('./project-board');
      const board = getBoard();
      if (!board) return;
      const now = Date.now();

      for (const task of board.tasks) {
        if (task.status !== 'in-progress' || !task.claimedAt) continue;
        const age = now - new Date(task.claimedAt).getTime();
        if (age > STALE_MS) {
          console.warn(`[scheduler] Resetting stale task "${task.id}" — in-progress for ${Math.round(age / 60000)}min`);
          try {
            const fs = require('fs');
            const path = require('path');
            const BOARD_PATH = path.join(MAGI_WORKSPACE, 'project-board.json');
            const data = JSON.parse(fs.readFileSync(BOARD_PATH, 'utf-8'));
            const t = data.tasks.find(t => t.id === task.id);
            if (t && t.status === 'in-progress') {
              t.status = 'pending';
              t.claimedAt = null;
              fs.writeFileSync(BOARD_PATH, JSON.stringify(data, null, 2));
            }
          } catch (err) {
            console.error(`[scheduler] Stale reset failed for ${task.id}: ${err.message}`);
          }
        }
      }
    } catch { /* no board */ }
  }

  /** Auto-approve pending-review tasks older than the timeout. */
  _checkReviewTimeouts() {
    try {
      const { getPendingReviews, approveTask, REVIEW_TIMEOUT_MS } = require('./project-board');
      const pending = getPendingReviews();
      const now = Date.now();

      for (const task of pending) {
        const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : 0;
        if (completedAt && (now - completedAt > REVIEW_TIMEOUT_MS)) {
          console.warn(`[scheduler] Auto-approving task "${task.id}" — review timed out after 72h`);
          try {
            approveTask(task.id);
          } catch (err) {
            console.error(`[scheduler] Auto-approve failed for ${task.id}: ${err.message}`);
          }
        }
      }
    } catch { /* no board */ }
  }

  // --- Wake File Scanning (Sibling Collaboration) ---

  /** Find the oldest pending wake file targeting this bot. */
  _nextWakeFile() {
    const wakeDir = path.join(MAGI_WORKSPACE, 'Sibling_Wake', 'Active');
    try {
      if (!fs.existsSync(wakeDir)) return null;
    } catch { return null; }

    const myId = PERSONALITY_ID.toLowerCase();
    let files;
    try {
      files = fs.readdirSync(wakeDir)
        .filter(f => f.endsWith('.wake') && f.toLowerCase().includes(`_${myId}.wake`))
        .sort(); // oldest first by timestamp prefix
    } catch { return null; }

    if (files.length === 0) return null;

    const filePath = path.join(wakeDir, files[0]);
    try {
      const wake = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // Extract proposal name from various wake file structures
      const proposalName = wake.proposalName || wake.proposal
        || wake.details?.proposalName || wake.details?.proposal
        || wake.details?.description || wake.message || 'collaboration request';
      return {
        description: `Sibling wake: ${proposalName}`,
        proposalName,  // ensure it's a top-level field for index.js
        ...wake,
        _wakeFile: files[0],
        _wakePath: filePath,
        _pendingCount: files.length,
      };
    } catch (err) {
      console.warn(`[scheduler] Bad wake file ${files[0]}: ${err.message}`);
      return null;
    }
  }

  /** Move a processed wake file to Completed. */
  ackWake(wakeFileName) {
    const activeDir = path.join(MAGI_WORKSPACE, 'Sibling_Wake', 'Active');
    const completedDir = path.join(MAGI_WORKSPACE, 'Sibling_Wake', 'Completed');
    const activePath = path.join(activeDir, wakeFileName);
    try {
      fs.mkdirSync(completedDir, { recursive: true });
      fs.renameSync(activePath, path.join(completedDir, wakeFileName));
      console.log(`[scheduler] Wake acked: ${wakeFileName}`);
    } catch (err) {
      console.error(`[scheduler] Wake ack failed: ${err.message}`);
    }
  }

  // --- Cross-Agent Review ---

  /** Check for review tasks assigned to this agent. */
  _nextReviewTask() {
    try {
      const { getMyReviews } = require('./project-board');
      const reviews = getMyReviews(PERSONALITY_ID);
      return reviews.length > 0 ? reviews[0] : null;
    } catch {
      return null;
    }
  }

  /** Route unassigned pending-review tasks to available agents. */
  _routePendingReviews() {
    try {
      const { getPendingReviews, routeReview } = require('./project-board');
      const pending = getPendingReviews();
      const unassigned = pending.filter(t => !t.reviewAssignee);
      if (unassigned.length === 0) return;

      // Only route if we're not busy (i.e., this agent could be a reviewer)
      // Pass ourselves as an available reviewer
      for (const task of unassigned) {
        routeReview(task.id, [PERSONALITY_ID]);
      }
    } catch { /* no board */ }
  }

  // --- Retry Thresholds ---

  /**
   * Check if a backlog item has hit retry thresholds.
   * At RETRY_HELP_THRESHOLD: auto-send help request to siblings.
   * At RETRY_PAUSE_THRESHOLD: auto-pause the item.
   */
  _checkRetryThresholds(item) {
    if (!item.retryCount) return;

    if (item.retryCount === RETRY_HELP_THRESHOLD) {
      console.warn(`[scheduler] Task "${item.description}" hit ${RETRY_HELP_THRESHOLD} retries — sending help request`);
      try {
        const { sendHelpRequest } = require('./sibling-mail');
        sendHelpRequest(item);
        item._helpRequestSent = true;
        this._save();
      } catch (err) {
        console.warn(`[scheduler] Failed to send help request: ${err.message}`);
      }
    }

    if (item.retryCount >= RETRY_PAUSE_THRESHOLD && !item.paused) {
      console.warn(`[scheduler] Task "${item.description}" hit ${RETRY_PAUSE_THRESHOLD} retries — auto-pausing`);
      item.paused = true;
      this._save();
    }
  }

  // --- Check loop ---

  async _check() {
    if (this.isBusy) return;
    const now = Date.now();

    // Re-read schedule file to pick up externally-written timers (from orchestrator/routine)
    const fresh = this._load();
    // Merge any new timers from disk that we don't have in memory
    const existingIds = new Set(this.data.timers.map(t => t.id));
    for (const t of fresh.timers) {
      if (!existingIds.has(t.id)) this.data.timers.push(t);
    }

    // 1. One-off timers (highest priority — these are time-sensitive)
    const dueTimers = this.data.timers.filter(t => t.fireAt <= now);
    for (const timer of dueTimers) {
      this.data.timers = this.data.timers.filter(t => t.id !== timer.id);
      this._save();
      await this._fire('timer', timer);
      if (this.isBusy) return; // don't stack
    }

    // 2. Sibling wake files (high priority — collaboration requests)
    if (now - this.lastWakeCheck >= WAKE_CHECK_INTERVAL_MS) {
      this.lastWakeCheck = now;
      const wake = this._nextWakeFile();
      if (wake) {
        await this._fire('wake', wake);
        if (this.isBusy) return;
      }
    }

    // 2.5. Sibling mail (same priority tier as wake, checked on same interval)
    if (now - this.lastMailCheck >= MAIL_CHECK_INTERVAL_MS) {
      this.lastMailCheck = now;
      try {
        const { getMyInbox, cleanExpired } = require('./sibling-mail');
        cleanExpired(); // housekeeping — archive expired messages
        const inbox = getMyInbox();
        if (inbox.length > 0) {
          // Fire with all messages — agent reads them all at once
          await this._fire('mail', {
            description: `Sibling mail: ${inbox.length} message(s)`,
            messages: inbox,
            _messageCount: inbox.length,
          });
          if (this.isBusy) return;
        }
      } catch (err) {
        // sibling-mail module not available yet — silently skip
        if (!err.message.includes('Cannot find module')) {
          console.warn(`[scheduler] Mail check failed: ${err.message}`);
        }
      }
    }

    // 3. Project board tasks (check every 5 min when project is active)
    if (now - this.lastProjectCheck >= PROJECT_CHECK_INTERVAL_MS) {
      this.lastProjectCheck = now;

      // Check for review timeouts and stale tasks alongside project check
      this._checkReviewTimeouts();
      this._checkStaleTasks();

      // 3a. Cross-agent reviews assigned to me (higher priority than new tasks)
      const reviewTask = this._nextReviewTask();
      if (reviewTask) {
        await this._fire('review', {
          description: `Review task: ${reviewTask.title}`,
          ...reviewTask,
        });
        if (this.isBusy) return;
      }

      // 3b. Route any unassigned pending-review tasks to available agents
      this._routePendingReviews();

      const projectTask = this._nextProjectTask();
      if (projectTask) {
        await this._fire('project', {
          description: `Project task: ${projectTask.title}`,
          ...projectTask,
        });
        if (this.isBusy) return;
      }
    }

    // 4. Focus check-in (every 10 minutes while focus task exists)
    if (this.data.focus) {
      const lastCheck = this.data.focus.lastCheckIn
        ? new Date(this.data.focus.lastCheckIn).getTime()
        : 0;
      if (now - lastCheck >= FOCUS_INTERVAL_MS) {
        this.data.focus.checkIns++;
        this.data.focus.lastCheckIn = new Date().toISOString();
        this._save();
        await this._fire('focus', this.data.focus);
        return; // Focus blocks daily + background
      }
      return; // Focus exists but not due yet — still blocks daily + background
    }

    // 5. Daily tasks (routine, blocked by focus)
    const dailyTask = this._nextDailyTask();
    if (dailyTask) {
      dailyTask.lastExecuted = localDateKey();
      this._save();
      await this._fire('daily', dailyTask);
      if (this.isBusy) return;
    }

    // 6. Background work (every hour, only when no focus task)
    if (this.data.backlog.length > 0 && now - this.lastBackgroundFire >= BACKGROUND_INTERVAL_MS) {
      const item = this._nextBacklogItem();
      if (item) {
        // Skip paused items (auto-paused after too many retries)
        if (item.paused) {
          // Try to find a non-paused item instead
          const alt = this.data.backlog.find(b => !b.paused && b.id !== item.id);
          if (!alt) return; // all items paused, nothing to do
          alt.lastWorkedAt = new Date().toISOString();
          alt.retryCount = (alt.retryCount || 0) + 1;
          this.lastBackgroundFire = now;
          this._save();
          this._checkRetryThresholds(alt);
          await this._fire('background', alt);
          return;
        }

        item.lastWorkedAt = new Date().toISOString();
        item.retryCount = (item.retryCount || 0) + 1;
        this.lastBackgroundFire = now;
        this._save();
        this._checkRetryThresholds(item);
        await this._fire('background', item);
      }
    }
  }

  async _fire(mode, task) {
    if (this.isBusy || !this.onFire) return;
    this.isBusy = true;
    console.log(`[scheduler] Firing ${mode}: "${task.description}"`);
    try {
      await this.onFire(mode, task);
    } catch (err) {
      console.error(`[scheduler] ${mode} task "${task.description}" failed:`, err.message);
    } finally {
      this.isBusy = false;
    }
  }
}

module.exports = { Scheduler, parseDuration, formatDuration, MAX_BACKLOG };
