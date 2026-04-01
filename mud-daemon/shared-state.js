'use strict';
// shared-state.js — File-based state sync between daemon instances.
// Each agent publishes its state; others read it. Uses the same
// atomic-write pattern as IPC (write .tmp, rename).
//
// File layout:
//   data/shared/<serverName>/agents/<profileKey>.json
//   data/shared/<serverName>/plan.json

const fs = require('fs');
const { atomicWriteJSON } = require('./atomic-write');
const path = require('path');
const EventEmitter = require('events');

const STALE_THRESHOLD_MS = 30000; // Agent state older than 30s = stale

class SharedState extends EventEmitter {
  constructor(options = {}) {
    super();
    this.profileKey = options.profileKey;
    this.serverName = options.serverName || 'aardwolf';
    this.baseDir = options.baseDir || path.join(__dirname, 'data', 'shared');
    this.agentsDir = path.join(this.baseDir, this.serverName, 'agents');
    this.planPath = path.join(this.baseDir, this.serverName, 'plan.json');
    this._pollTimer = null;
    this._knownAgents = new Set();
    this.log = options.log || ((type, msg) => console.log(`[Shared:${type}] ${msg}`));

    // Ensure directories exist
    fs.mkdirSync(this.agentsDir, { recursive: true });
  }

  // --- Publish this agent's state ---

  publishState(state) {
    const payload = {
      ...state,
      profile: this.profileKey,
      timestamp: new Date().toISOString(),
    };
    try {
      atomicWriteJSON(path.join(this.agentsDir, `${this.profileKey}.json`), payload);
    } catch { /* non-fatal */ }
  }

  // --- Read all agents ---

  readAllStates() {
    const states = new Map();
    try {
      const files = fs.readdirSync(this.agentsDir).filter(f => f.endsWith('.json'));
      const now = Date.now();
      for (const file of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(this.agentsDir, file), 'utf8'));
          const age = now - new Date(raw.timestamp).getTime();
          raw._stale = age > STALE_THRESHOLD_MS;
          raw._ageMs = age;
          states.set(raw.profile || path.basename(file, '.json'), raw);
        } catch { /* skip corrupt files */ }
      }
    } catch { /* directory missing */ }
    return states;
  }

  readState(profileKey) {
    const filePath = path.join(this.agentsDir, `${profileKey}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const age = Date.now() - new Date(raw.timestamp).getTime();
      raw._stale = age > STALE_THRESHOLD_MS;
      raw._ageMs = age;
      return raw;
    } catch {
      return null;
    }
  }

  // --- Tactical plan ---

  publishPlan(plan) {
    const payload = {
      ...plan,
      updatedAt: new Date().toISOString(),
    };
    try {
      atomicWriteJSON(this.planPath, payload);
      this.log('PLAN', `Published plan: ${plan.encounter || 'unnamed'}`);
    } catch { /* non-fatal */ }
  }

  readPlan() {
    if (!fs.existsSync(this.planPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.planPath, 'utf8'));
    } catch {
      return null;
    }
  }

  clearPlan() {
    try { fs.unlinkSync(this.planPath); } catch { /* fine */ }
  }

  // --- Polling for peer changes ---

  start(intervalMs = 2000) {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => this._checkPeers(), intervalMs);
  }

  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    // Clean up own state file
    const ownFile = path.join(this.agentsDir, `${this.profileKey}.json`);
    try { fs.unlinkSync(ownFile); } catch { /* fine */ }
  }

  _checkPeers() {
    const states = this.readAllStates();
    const currentAgents = new Set(states.keys());

    // Detect new agents
    for (const agent of currentAgents) {
      if (!this._knownAgents.has(agent) && agent !== this.profileKey) {
        this._knownAgents.add(agent);
        this.emit('agent:joined', agent, states.get(agent));
        this.log('PEER', `Agent joined: ${agent}`);
      }
    }

    // Detect departed agents (stale)
    for (const agent of this._knownAgents) {
      const state = states.get(agent);
      if (!state || state._stale) {
        this._knownAgents.delete(agent);
        this.emit('agent:left', agent);
        this.log('PEER', `Agent left: ${agent} (stale)`);
      }
    }
  }
}

module.exports = { SharedState };
