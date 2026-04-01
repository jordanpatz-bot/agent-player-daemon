'use strict';
// qud-connection.js — File-based connection for Caves of Qud.
// Drop-in replacement for connection.js (MudConnection).
// Same EventEmitter interface: emits 'data', 'connected', 'loggedIn', 'disconnected'.
//
// The C# mod (AgentBridge) writes state.json and reads command.txt.
// This connection polls state.json and writes command.txt — same role as TCP for MUDs.

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { atomicWrite } = require('./atomic-write');

class QudConnection extends EventEmitter {
  constructor(gameConfig, options = {}) {
    super();
    this.game = gameConfig;
    this.state = 'disconnected';
    this._pollTimer = null;
    this._pollMs = gameConfig.pollIntervalMs || 500;
    this._lastStateTime = 0;
    this._shutdownRequested = false;

    // File paths — resolved relative to the daemon's data dir
    const dataDir = options.dataDir || path.join(__dirname, 'data', 'qud', 'ipc');
    this.statePath = path.join(dataDir, gameConfig.stateFile || 'state.json');
    this.commandPath = path.join(dataDir, gameConfig.commandFile || 'command.txt');
    this.resultPath = path.join(dataDir, gameConfig.resultFile || 'result.json');

    fs.mkdirSync(dataDir, { recursive: true });
  }

  connect() {
    if (this.state !== 'disconnected') return;
    if (this._shutdownRequested) return;

    this.state = 'connecting';
    this.emit('stateChange', 'connecting');

    // Start polling for state.json
    this._pollTimer = setInterval(() => this._poll(), this._pollMs);
    this._poll(); // Immediate first check
  }

  send(command) {
    if (this.state !== 'playing') return false;
    try {
      atomicWrite(this.commandPath, command);
      return true;
    } catch (e) {
      this.emit('error', e);
      return false;
    }
  }

  // Wait for result.json to appear after sending a command
  async sendAndWait(command, timeoutMs = 15000) {
    // Clear old result
    try { fs.unlinkSync(this.resultPath); } catch {}

    if (!this.send(command)) return { error: 'Not connected' };

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (fs.existsSync(this.resultPath)) {
          const raw = fs.readFileSync(this.resultPath, 'utf8');
          return JSON.parse(raw);
        }
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    return { error: 'Timeout waiting for result' };
  }

  disconnect() {
    this._shutdownRequested = true;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this.state = 'disconnected';
    this.emit('disconnected', { wasPlaying: true });
    this.emit('stateChange', 'disconnected');
  }

  isPlaying() {
    return this.state === 'playing';
  }

  getState() {
    return this.state;
  }

  // --- Internal ---

  _poll() {
    try {
      if (!fs.existsSync(this.statePath)) {
        if (this.state === 'playing') {
          // State file disappeared — game may have closed
          this.state = 'disconnected';
          this.emit('disconnected', { wasPlaying: true });
          this.emit('stateChange', 'disconnected');
        }
        return;
      }

      const stat = fs.statSync(this.statePath);
      const mtime = stat.mtimeMs;

      // Only process if file changed since last poll
      if (mtime <= this._lastStateTime) return;
      this._lastStateTime = mtime;

      const raw = fs.readFileSync(this.statePath, 'utf8');
      const stateData = JSON.parse(raw);

      // First time seeing state — emit connected + loggedIn
      if (this.state !== 'playing') {
        this.state = 'playing';
        this.emit('connected');
        this.emit('loggedIn');
        this.emit('stateChange', 'playing');
      }

      // Emit state data as 'data' event — the bridge handles mapping
      this.emit('data', stateData);
    } catch (e) {
      // File might be mid-write — skip this poll
    }
  }
}

module.exports = { QudConnection };
