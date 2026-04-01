#!/usr/bin/env node
'use strict';
// harness-client.js — Typed harness protocol client for the Caves of Qud C# bridge.
// Speaks the request.json/response.json protocol; falls back to legacy command.txt.

const fs = require('fs');
const path = require('path');

const DEFAULT_IPC_DIR = path.join(__dirname, 'mud-daemon', 'data', 'qud', 'ipc');
const DEFAULT_TIMEOUT = 15000;
const POLL_INTERVAL = 200;

class HarnessClient {
  /**
   * @param {string} [ipcDir] — path to the IPC directory (contains state.json, command.txt, etc.)
   */
  constructor(ipcDir) {
    this.ipcDir = ipcDir || DEFAULT_IPC_DIR;
    this.paths = {
      state:    path.join(this.ipcDir, 'state.json'),
      events:   path.join(this.ipcDir, 'events.jsonl'),
      request:  path.join(this.ipcDir, 'request.json'),
      response: path.join(this.ipcDir, 'response.json'),
      command:  path.join(this.ipcDir, 'command.txt'),
      result:   path.join(this.ipcDir, 'result.json'),
    };
    this._legacyMode = false; // set true after first request.json timeout
  }

  // ---------------------------------------------------------------------------
  // State access
  // ---------------------------------------------------------------------------

  /** Read current state.json. Returns parsed object or null. */
  readState() {
    try {
      return JSON.parse(fs.readFileSync(this.paths.state, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Read events.jsonl lines since a given ISO timestamp (or all if omitted). */
  readEvents(since) {
    try {
      const raw = fs.readFileSync(this.paths.events, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (since) {
        const cutoff = typeof since === 'number' ? since : new Date(since).getTime();
        return events.filter(e => {
          const ts = e.timestamp || e.turn || 0;
          return (typeof ts === 'string' ? new Date(ts).getTime() : ts) >= cutoff;
        });
      }
      return events;
    } catch {
      return [];
    }
  }

  /** Return current stateVersion from state.json (falls back to turn number). */
  getStateVersion() {
    const state = this.readState();
    if (!state) return 0;
    return state.stateVersion ?? state.turn ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Core protocol — typed request/response
  // ---------------------------------------------------------------------------

  /** Generate a unique command ID. */
  _generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Atomically write a file (write .tmp, rename). */
  _atomicWrite(filePath, data) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  /** Clear a file if it exists. */
  _clearFile(filePath) {
    try { fs.unlinkSync(filePath); } catch {}
  }

  /**
   * Send a raw request object and wait for a matching response.
   * @param {object} request — the inner request payload (must have .kind)
   * @param {number} [timeout] — ms to wait
   * @returns {Promise<object>} — the response object
   */
  async sendRequest(request, timeout = DEFAULT_TIMEOUT) {
    const commandId = this._generateCommandId();
    const stateVersion = this.getStateVersion();

    const envelope = {
      commandId,
      issuedAgainstStateVersion: stateVersion,
      request,
    };

    // Clear any stale response
    this._clearFile(this.paths.response);

    // Write the request atomically
    this._atomicWrite(this.paths.request, envelope);

    // Poll for response
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (fs.existsSync(this.paths.response)) {
          const raw = fs.readFileSync(this.paths.response, 'utf8');
          const resp = JSON.parse(raw);
          // Match by commandId
          if (resp.commandId === commandId) {
            return resp;
          }
          // If commandId doesn't match, it might be stale — keep waiting
        }
      } catch { /* file mid-write, retry */ }
      await _sleep(POLL_INTERVAL);
    }

    // Timed out — mark legacy mode for future calls
    this._legacyMode = true;
    return { commandId, status: 'timeout', error: 'No response within timeout (request.json protocol)' };
  }

  /**
   * Send a command via the legacy command.txt / result.json path.
   * @param {string} cmd — raw command string (e.g. "navigate Elder Irudad")
   * @param {number} [timeout] — ms to wait
   * @returns {Promise<object>} — the result object
   */
  async sendLegacyCommand(cmd, timeout = DEFAULT_TIMEOUT) {
    // Clear old result
    this._clearFile(this.paths.result);

    // Write command atomically
    this._atomicWrite(this.paths.command, cmd);

    // Poll for result
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (fs.existsSync(this.paths.result)) {
          const raw = fs.readFileSync(this.paths.result, 'utf8');
          return JSON.parse(raw);
        }
      } catch { /* mid-write, retry */ }
      await _sleep(POLL_INTERVAL);
    }
    return { status: 'timeout', error: 'No result within timeout (legacy protocol)' };
  }

  // ---------------------------------------------------------------------------
  // High-level: performAction (typed with legacy fallback)
  // ---------------------------------------------------------------------------

  /**
   * Perform a typed action through the harness protocol.
   * Falls back to legacy command.txt if the bridge doesn't support request.json.
   *
   * @param {object} action — typed action (e.g. {type: "movement.step", direction: "n"})
   * @param {object} [options]
   * @param {number} [options.timeout] — ms to wait (default 15000)
   * @param {boolean} [options.forceLegacy] — skip typed protocol, go straight to legacy
   * @returns {Promise<object>}
   */
  async performAction(action, options = {}) {
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    // If we know the bridge is legacy-only, or caller forces legacy, use command.txt
    if (this._legacyMode || options.forceLegacy) {
      const cmd = _actionToLegacyCommand(action);
      return this.sendLegacyCommand(cmd, timeout);
    }

    // Try typed protocol first
    const resp = await this.sendRequest({ kind: 'perform_action', action }, timeout);

    if (resp.status === 'timeout') {
      // Typed protocol timed out — fall back to legacy
      const cmd = _actionToLegacyCommand(action);
      return this.sendLegacyCommand(cmd, timeout);
    }

    return resp;
  }

  /**
   * Evaluate state assertions through the harness protocol.
   * @param {Array|object} assertions — assertion(s) to evaluate
   * @param {number} [timeout]
   * @returns {Promise<object>}
   */
  async assertState(assertions, timeout = DEFAULT_TIMEOUT) {
    const arr = Array.isArray(assertions) ? assertions : [assertions];

    // If bridge is legacy, evaluate assertions locally
    if (this._legacyMode) {
      return this._evaluateAssertionsLocally(arr);
    }

    const resp = await this.sendRequest({ kind: 'assert_state', assertions: arr }, timeout);

    if (resp.status === 'timeout') {
      // Fall back to local evaluation
      return this._evaluateAssertionsLocally(arr);
    }

    return resp;
  }

  /**
   * Save a game checkpoint with a name.
   * @param {string} name — checkpoint name
   * @param {number} [timeout]
   * @returns {Promise<object>}
   */
  async checkpointSave(name, timeout = DEFAULT_TIMEOUT) {
    return this.performAction({ type: 'system.save', checkpoint: name }, { timeout });
  }

  /**
   * Poll until a condition is met or timeout expires.
   * @param {function} condition — receives state, returns truthy when done
   * @param {number} [timeout] — ms (default 15000)
   * @param {number} [pollInterval] — ms between polls (default 500)
   * @returns {Promise<{met: boolean, state: object}>}
   */
  async waitUntil(condition, timeout = DEFAULT_TIMEOUT, pollInterval = 500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const state = this.readState();
      if (state && condition(state)) {
        return { met: true, state };
      }
      await _sleep(pollInterval);
    }
    return { met: false, state: this.readState() };
  }

  // ---------------------------------------------------------------------------
  // Local assertion evaluation (fallback when bridge is legacy)
  // ---------------------------------------------------------------------------

  _evaluateAssertionsLocally(assertions) {
    const state = this.readState();
    if (!state) {
      return {
        status: 'error',
        error: 'No state available',
        results: assertions.map(a => ({ assertion: a, passed: false, error: 'no state' })),
      };
    }

    const results = assertions.map(a => {
      try {
        const actual = _getNestedValue(state, a.path);
        let passed = false;
        if ('equals' in a) passed = actual === a.equals;
        else if ('notEquals' in a) passed = actual !== a.notEquals;
        else if ('contains' in a) passed = String(actual).includes(a.contains);
        else if ('gt' in a) passed = actual > a.gt;
        else if ('lt' in a) passed = actual < a.lt;
        else if ('exists' in a) passed = a.exists ? actual !== undefined : actual === undefined;
        else passed = actual !== undefined && actual !== null;

        return { assertion: a, passed, actual };
      } catch (e) {
        return { assertion: a, passed: false, error: e.message };
      }
    });

    const allPassed = results.every(r => r.passed);
    return { status: allPassed ? 'ok' : 'fail', results };
  }

  // ---------------------------------------------------------------------------
  // Helper methods for common actions
  // ---------------------------------------------------------------------------

  async move(direction)       { return this.performAction({ type: 'movement.step', direction }); }
  async navigateTo(target) {
    if (typeof target === 'string') {
      return this.performAction({ type: 'movement.path_to', target });
    }
    // target is {x, y} or two separate args handled by caller
    return this.performAction({ type: 'movement.path_to', x: target.x, y: target.y });
  }
  async talk(target)          { return this.performAction({ type: 'interaction.talk', target }); }
  async chooseDialogue(index) { return this.performAction({ type: 'interaction.choose_dialogue', choice: index }); }
  async attack(target)        { return this.performAction({ type: 'combat.melee', target }); }
  async examine(target)       { return this.performAction({ type: 'observe.examine', target }); }
  async trade(target)         { return this.performAction({ type: 'interact.trade', target }); }
  async eat()                 { return this.performAction({ type: 'inventory.consume_food' }); }
  async drink()               { return this.performAction({ type: 'inventory.consume_water' }); }
  async equip(item)           { return this.performAction({ type: 'inventory.equip', item }); }
  async pickup(item)          { return this.performAction({ type: 'inventory.pickup', item }); }
  async activate(ability)     { return this.performAction({ type: 'ability.activate', ability }); }
  async save()                { return this.performAction({ type: 'system.save' }); }
  async status()              { return this.performAction({ type: 'system.status' }); }
  async rest()                { return this.performAction({ type: 'survival.rest' }); }
}

// ---------------------------------------------------------------------------
// Utilities (module-private)
// ---------------------------------------------------------------------------

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Convert a typed action to a legacy command string. */
function _actionToLegacyCommand(action) {
  if (!action || !action.type) return String(action);

  const t = action.type;

  if (t === 'movement.step')             return `move ${action.direction}`;
  if (t === 'movement.path_to') {
    if (action.target) return `navigate ${action.target}`;
    if (action.x !== undefined)          return `navigate ${action.x} ${action.y}`;
    return 'navigate';
  }
  if (t === 'interaction.talk')          return `talkto ${action.target}`;
  if (t === 'interaction.choose_dialogue') return `choose ${action.choice}`;
  if (t === 'combat.melee')             return `attack ${action.target}`;
  if (t === 'observe.examine')          return `examine ${action.target}`;
  if (t === 'interact.trade')           return `trade ${action.target}`;
  if (t === 'inventory.consume_food')   return 'eat';
  if (t === 'inventory.consume_water')  return 'drink';
  if (t === 'inventory.equip')          return `equip ${action.item}`;
  if (t === 'inventory.pickup')         return `pickup ${action.item}`;
  if (t === 'ability.activate')         return `activate ${action.ability}`;
  if (t === 'system.save')              return 'save';
  if (t === 'system.status')            return 'status';
  if (t === 'survival.rest')            return 'rest';

  // Unknown type — pass through as raw
  return action.command || action.type;
}

/** Resolve a dot-separated path on an object (e.g. "interaction.conversationActive"). */
function _getNestedValue(obj, dotPath) {
  if (!dotPath) return obj;
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

module.exports = { HarnessClient, _actionToLegacyCommand, _getNestedValue };
