'use strict';
// server-profile.js — Loads a game server JSON config, compiles regex strings
// into RegExp objects, and exposes a clean API for the daemon.
//
// Usage:
//   const { loadServerProfile } = require('./server-profile');
//   const profile = loadServerProfile('aardwolf'); // loads servers/aardwolf.json

const fs = require('fs');
const path = require('path');

function compileRegex(str, flags) {
  if (!str) return null;
  return new RegExp(str, flags || 'i');
}

class ServerProfile {
  constructor(raw) {
    this._raw = raw;
    this.id = raw.id;
    this.name = raw.name || raw.id;
    this.connectionType = raw.connectionType || 'tcp'; // 'tcp' or 'file-ipc'

    // --- Connection ---
    const c = raw.connection || {};
    this.connection = {
      host: c.host,
      port: c.port,
      loginDetect: c.loginDetect || '',
      passwordDetect: c.passwordDetect || 'password',
      inGameDetect: compileRegex(c.inGameDetect, 'i'),
      enterPrompts: compileRegex(c.enterPrompts, 'i'),
      promptPattern: compileRegex(c.promptPattern),
      promptFields: c.promptFields || [],
      quitCommands: c.quitCommands || ['quit'],
      debounceMs: c.debounceMs || 800,
      extraLogin: (c.extraLogin || []).map(step => ({
        detect: step.detect,
        send: step.send,
      })),
      keepalive: {
        command: (c.keepalive && c.keepalive.command) || 'time',
        intervalMs: (c.keepalive && c.keepalive.intervalMs) || 600000,
      },
    };

    // --- GMCP ---
    const g = raw.gmcp || {};
    this.gmcpPackages = g.packages || [];
    this.gmcpStateMap = g.stateMap || {};

    // --- Combat ---
    const cb = raw.combat || {};
    const cp = cb.patterns || {};
    this.combatPatterns = {};
    for (const [key, pattern] of Object.entries(cp)) {
      this.combatPatterns[key] = compileRegex(pattern, 'i');
    }
    this.combatIdleTimeoutMs = cb.idleTimeoutMs || 15000;
    this.combatCooldowns = cb.cooldowns || { healMs: 5000, fleeMs: 10000 };

    // --- Parsing ---
    const p = raw.parsing || {};
    this.flavorFilters = (p.flavorFilters || []).map(s => compileRegex(s, 'i'));
    this.sceneryMobs = p.sceneryMobs || [];
    this.standingVerbs = compileRegex(p.standingVerbs, 'i');
    this.exitPattern = compileRegex(p.exitPattern);
    this.playerMarker = compileRegex(p.playerMarker, 'i');
    this.promptLine = compileRegex(p.promptLine);

    // --- Commands ---
    this._commands = raw.commands || {};

    // --- GMCP vitals mapping ---
    this.gmcpVitalsMap = (g && g.vitalsMap) || null;
    this.gmcpChannelFormat = (g && g.channelFormat) || 'auto';

    // --- Resources (game-defined resource pools) ---
    this.resources = raw.resources || [
      { name: 'hp', max: 'maxHp', label: 'Health' },
      { name: 'mana', max: 'maxMana', label: 'Mana' },
    ];

    // --- Capabilities (what features this game has) ---
    this.capabilities = raw.capabilities || {};

    // --- Defaults & TTLs ---
    this.defaults = raw.defaults || {};
    this.fieldTTLs = raw.fieldTTLs || {};
  }

  // --- Command helpers ---

  getCommand(action, params) {
    const cmd = this._commands[action];
    if (!cmd) return null;

    if (action === 'look' && params && params.target && cmd.targetTemplate) {
      return cmd.targetTemplate.replace('{target}', params.target);
    }

    let template = cmd.template || '';
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replace(`{${k}}`, v);
      }
    }
    return template;
  }

  getHealCommand(characterClass) {
    const heal = this._commands.heal || {};
    const cls = (characterClass || '').toLowerCase();
    return heal[cls] || heal.default || 'quaff heal';
  }

  getFleeCommand() {
    const flee = this._commands.flee;
    return (flee && flee.template) || 'recall';
  }

  getMoveDirections() {
    const move = this._commands.move || {};
    return move.validDirections || [
      'north', 'south', 'east', 'west', 'up', 'down',
      'n', 's', 'e', 'w', 'u', 'd',
    ];
  }

  // --- Build a connection game config (backward compat with MudConnection) ---

  toGameConfig(profileData) {
    return {
      // File-IPC connections don't have host/port
      host: this.connection.host || null,
      port: this.connection.port || null,
      // File-IPC specific
      stateFile: this.connection.stateFile || null,
      commandFile: this.connection.commandFile || null,
      resultFile: this.connection.resultFile || null,
      pollIntervalMs: this.connection.pollIntervalMs || 500,
      name: profileData.name,
      pass: profileData.pass,
      loginDetect: this.connection.loginDetect,
      passwordDetect: this.connection.passwordDetect,
      inGameDetect: this.connection.inGameDetect,
      enterPrompts: this.connection.enterPrompts,
      promptPattern: this.connection.promptPattern,
      quitCommands: this.connection.quitCommands,
      debounceMs: this.connection.debounceMs,
      extraLogin: this.connection.extraLogin,
      // Profile metadata
      server: this.id,
      owner: profileData.owner || profileData.name,
      class: profileData.class || 'unknown',
      subclass: profileData.subclass || '',
      race: profileData.race || 'unknown',
      level: profileData.level || 1,
    };
  }
}

// --- Loader ---

function loadServerProfile(serverName) {
  const jsonPath = path.join(__dirname, 'servers', `${serverName}.json`);
  if (!fs.existsSync(jsonPath)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return new ServerProfile(raw);
}

module.exports = { ServerProfile, loadServerProfile };
