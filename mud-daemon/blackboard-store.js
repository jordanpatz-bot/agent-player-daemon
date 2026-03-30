'use strict';
// blackboard-store.js — Persistent blackboard with TTL on volatile fields.
// Durable fields survive restarts. Volatile fields expire after TTL.

const fs = require('fs');
const path = require('path');

// Field categories with TTL (0 = durable, persists forever)
const FIELD_TTLS = {
  // Volatile — stale quickly
  hp: 120000,           // 2 min
  maxHp: 120000,
  mana: 120000,
  maxMana: 120000,
  inCombat: 60000,      // 1 min
  currentTarget: 60000,
  combatRound: 60000,
  currentRoom: 300000,  // 5 min
  playersInRoom: 120000,
  alertLevel: 300000,
  momentum: 300000,

  // Durable — persist across restarts
  name: 0,
  level: 0,
  class: 0,
  killCount: 0,
  recentPlayers: 0,
  conversationHistory: 0,
  habituationScores: 0,
  sessionGoal: 0,
  socialCooldownMs: 0,
  _spamSources: 0,
  _warnedPlayers: 0,
};

const DEFAULTS = {
  name: 'Mycelico',
  level: 8,
  class: 'ranger',
  hp: 400,
  maxHp: 400,
  mana: 250,
  maxMana: 250,
  inCombat: false,
  currentTarget: null,
  killCount: 0,
  combatRound: 0,
  unreadTells: [],
  recentPlayers: {},
  lastSocialAction: 0,
  conversationHistory: {},
  socialQueue: [],
  currentRoom: { name: 'unknown', zone: 'unknown', exits: [] },
  playersInRoom: [],
  alertLevel: 0,
  momentum: { activity: 'idle', since: Date.now(), strength: 0.3 },
  habituationScores: {},
  sessionGoal: 'hunt',
  socialCooldownMs: 30000,
};

class BlackboardStore {
  constructor(options = {}) {
    this.filePath = options.filePath || path.join(process.cwd(), 'blackboard.json');
    this.saveDebounceMs = options.saveDebounceMs || 5000;
    // Profile-specific defaults override the hardcoded DEFAULTS.
    // Fixes: all profiles falling back to 'Mycelico' on TTL expiry.
    this._defaults = { ...DEFAULTS, ...(options.defaults || {}) };
    this._saveTimer = null;
    this._dirty = false;
    this._data = {};
    this._timestamps = {}; // field → last-set time
    this._load();
  }

  // Get a field value, returning default if expired
  get(field) {
    const ttl = FIELD_TTLS[field];
    if (ttl && ttl > 0 && this._timestamps[field]) {
      const age = Date.now() - this._timestamps[field];
      if (age > ttl) {
        // Expired — return default
        return this._defaults[field] !== undefined ? this._defaults[field] : null;
      }
    }
    return this._data[field] !== undefined ? this._data[field] : (this._defaults[field] !== undefined ? this._defaults[field] : null);
  }

  // Set a field value
  set(field, value) {
    this._data[field] = value;
    this._timestamps[field] = Date.now();
    this._scheduleSave();
  }

  // Bulk update (e.g. from prompt parse)
  update(fields) {
    const now = Date.now();
    for (const [k, v] of Object.entries(fields)) {
      this._data[k] = v;
      this._timestamps[k] = now;
    }
    this._scheduleSave();
  }

  // Get a snapshot for reports (includes staleness info)
  snapshot() {
    const now = Date.now();
    const snap = {};
    for (const field of Object.keys({ ...this._defaults, ...this._data })) {
      const ttl = FIELD_TTLS[field];
      const ts = this._timestamps[field] || 0;
      const age = now - ts;
      const stale = ttl && ttl > 0 && age > ttl;
      snap[field] = {
        value: stale ? this._defaults[field] : (this._data[field] !== undefined ? this._data[field] : this._defaults[field]),
        stale,
        ageMs: ts ? age : null,
      };
    }
    return snap;
  }

  // Get a clean object for the social bridge (matches old blackboard shape)
  toBlackboard() {
    const bb = {};
    for (const field of Object.keys(this._defaults)) {
      bb[field] = this.get(field);
    }
    // Add computed properties
    Object.defineProperty(bb, 'hpPct', {
      get() { return this.hp / this.maxHp; },
      enumerable: true,
    });
    Object.defineProperty(bb, 'manaPct', {
      get() { return this.mana / this.maxMana; },
      enumerable: true,
    });
    return bb;
  }

  // Force save now
  saveNow() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._save();
  }

  // --- Internal ---

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this._data = raw.data || {};
        this._timestamps = raw.timestamps || {};

        // Convert Set-like fields back from arrays
        if (Array.isArray(this._data._spamSources)) {
          this._data._spamSources = new Set(this._data._spamSources);
        }
        if (Array.isArray(this._data._warnedPlayers)) {
          this._data._warnedPlayers = new Set(this._data._warnedPlayers);
        }
      }
    } catch (e) {
      // Corrupted file — start fresh
      this._data = {};
      this._timestamps = {};
    }
  }

  _save() {
    const serializable = { ...this._data };
    // Convert Sets to arrays for JSON
    if (serializable._spamSources instanceof Set) {
      serializable._spamSources = [...serializable._spamSources];
    }
    if (serializable._warnedPlayers instanceof Set) {
      serializable._warnedPlayers = [...serializable._warnedPlayers];
    }

    const payload = JSON.stringify({
      data: serializable,
      timestamps: this._timestamps,
      savedAt: new Date().toISOString(),
    }, null, 2);

    // Atomic write
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, this.filePath);
    this._dirty = false;
  }

  _scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (this._dirty) this._save();
    }, this.saveDebounceMs);
  }
}

module.exports = { BlackboardStore, DEFAULTS, FIELD_TTLS };
