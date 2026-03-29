'use strict';
// ipc.js — File-based command interface for the MUD daemon.
// Mico writes command files, daemon processes them and writes results.
//
// Protocol:
//   Command: ipc/commands/<id>.json → { id, commands: [...], waitFor?, timeout? }
//   Result:  ipc/results/<id>.json  → { id, status, output, events, blackboard }
//
// Atomic writes: write .tmp, rename. Daemon deletes command file after reading.

const fs = require('fs');
const path = require('path');

class IpcServer {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'ipc');
    this.commandsDir = path.join(this.baseDir, 'commands');
    this.resultsDir = path.join(this.baseDir, 'results');
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this._pollTimer = null;
    this._handler = null;

    fs.mkdirSync(this.commandsDir, { recursive: true });
    fs.mkdirSync(this.resultsDir, { recursive: true });
  }

  // Set the command handler: async fn(command) => result
  onCommand(handler) {
    this._handler = handler;
  }

  start() {
    if (this._pollTimer) return;
    this._poll(); // immediate first check
    this._pollTimer = setInterval(() => this._poll(), this.pollIntervalMs);
  }

  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // Write a result file (called by daemon after processing)
  writeResult(id, result) {
    const filePath = path.join(this.resultsDir, `${id}.json`);
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(result, null, 2));
    fs.renameSync(tmp, filePath);
  }

  // --- Internal ---

  async _poll() {
    let files;
    try {
      files = fs.readdirSync(this.commandsDir).filter(f => f.endsWith('.json'));
    } catch {
      return;
    }

    // Sort by filename (timestamp-based = chronological)
    files.sort();

    for (const file of files) {
      const filePath = path.join(this.commandsDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        // Delete before processing to prevent double-execution on crash
        fs.unlinkSync(filePath);

        const command = JSON.parse(raw);
        if (!command.id) {
          command.id = path.basename(file, '.json');
        }

        if (this._handler) {
          try {
            const result = await this._handler(command);
            this.writeResult(command.id, {
              id: command.id,
              status: 'complete',
              ...result,
            });
          } catch (err) {
            this.writeResult(command.id, {
              id: command.id,
              status: 'error',
              error: err.message,
            });
          }
        }
      } catch (err) {
        // Partial read or bad JSON — skip
        try { fs.unlinkSync(filePath); } catch { /* already gone */ }
      }
    }
  }
}

// --- Client helper (for Mico's side) ---

class IpcClient {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'ipc');
    this.commandsDir = path.join(this.baseDir, 'commands');
    this.resultsDir = path.join(this.baseDir, 'results');

    fs.mkdirSync(this.commandsDir, { recursive: true });
    fs.mkdirSync(this.resultsDir, { recursive: true });
  }

  // Send a command and return the ID
  sendCommand(commands, options = {}) {
    const id = options.id || `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const command = {
      id,
      commands: Array.isArray(commands) ? commands : [commands],
      waitFor: options.waitFor || null,
      timeout: options.timeout || 15000,
      label: options.label || null,
    };

    const filePath = path.join(this.commandsDir, `${id}.json`);
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(command, null, 2));
    fs.renameSync(tmp, filePath);

    return id;
  }

  // Check if result is ready (non-blocking)
  getResult(id) {
    const filePath = path.join(this.resultsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      fs.unlinkSync(filePath); // consume
      return result;
    } catch {
      return null;
    }
  }

  // Wait for result with timeout (blocking-ish, for scripts)
  async waitForResult(id, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = this.getResult(id);
      if (result) return result;
      await new Promise(r => setTimeout(r, 500));
    }
    return { id, status: 'timeout', error: `No result after ${timeoutMs}ms` };
  }
}

module.exports = { IpcServer, IpcClient };
