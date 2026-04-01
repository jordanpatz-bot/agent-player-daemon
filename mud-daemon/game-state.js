'use strict';
// game-state.js — Game state machine (Phase 2).
// Layers on top of the connection state machine to track what the character
// is *doing* in the game world: idle, combat, exploring, resting.
//
// Responsibilities:
//   1. Track gameState on the blackboard (idle/combat/exploring/resting)
//   2. Detect state transitions from MUD output + GMCP events
//   3. Execute reflexes (auto-heal, auto-flee) during combat
//   4. Log recentEvents[] and set decisionNeeded flag
//   5. Accept typed commands (move/attack/look) with raw passthrough
//
// Design constraints (from systems lens review):
//   - State detection is conservative: stay idle unless confidence is high
//   - Only two reflexes in v1: auto-heal and auto-flee, combat-gated
//   - Command mutex: reflexes queue behind active IPC commands
//   - Typed commands are convenience, not gates: raw passthrough stays
//
// All server-specific patterns, thresholds, and commands are read from a
// ServerProfile instance. If no profile is supplied the engine still works
// with safe (no-op) defaults and logs a warning.

const EventEmitter = require('events');

// --- Game States ---
const GAME_STATES = {
  idle: 'idle',
  combat: 'combat',
  exploring: 'exploring',
  resting: 'resting',
};


class GameStateEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.blackboard = options.blackboard;   // BlackboardStore instance
    this.connection = options.connection;     // MudConnection instance (for sending commands)
    this.log = options.log || ((type, msg) => console.log(`[GameState:${type}] ${msg}`));

    // Server profile — all patterns, thresholds, and command templates
    this.serverProfile = options.serverProfile || null;
    this._characterClass = options.characterClass || 'unknown';

    if (!this.serverProfile) {
      this.log('WARN', 'No serverProfile supplied — combat detection, reflexes, and mob parsing will be inert');
    }

    // Current game state
    this._state = GAME_STATES.idle;
    this._stateEnteredAt = Date.now();

    // Recent events ring buffer (max 50)
    this._recentEvents = [];
    this._maxEvents = 50;

    // Decision needed flag
    this._decisionNeeded = false;
    this._decisionReason = null;

    // Command mutex: true when IPC is executing commands
    this._ipcBusy = false;

    // --- Thresholds & cooldowns (from profile, with defaults) ---
    const combat = (this.serverProfile && this.serverProfile.combatCooldowns) || {};
    this._healThreshold = 0.50;
    this._fleeThreshold = 0.20;
    if (this.serverProfile) {
      // Allow the profile to override thresholds via its combat config
      const raw = this.serverProfile._raw && this.serverProfile._raw.combat;
      if (raw) {
        if (typeof raw.healThreshold === 'number') this._healThreshold = raw.healThreshold;
        if (typeof raw.fleeThreshold === 'number') this._fleeThreshold = raw.fleeThreshold;
      }
    }

    this._healCooldownMs = combat.healMs || 5000;
    this._fleeCooldownMs = combat.fleeMs || 10000;
    this._combatIdleMs = (this.serverProfile && this.serverProfile.combatIdleTimeoutMs) || 15000;

    // Idle timer: if no combat output for N seconds while in combat, drop to idle
    this._combatIdleTimer = null;

    // Reflex cooldowns (prevent spam)
    this._lastHealAt = 0;
    this._lastFleeAt = 0;

    // Write initial state to blackboard
    this._syncBlackboard();
  }

  // --- Public API ---

  getState() { return this._state; }

  getRecentEvents() { return [...this._recentEvents]; }

  isDecisionNeeded() { return this._decisionNeeded; }

  // Called by IPC handler before executing commands
  acquireMutex() { this._ipcBusy = true; }

  // Called by IPC handler after commands complete
  releaseMutex() { this._ipcBusy = false; }

  // Process a typed command. Returns { command, error } or raw passthrough.
  translateCommand(typed) {
    if (!typed || typeof typed !== 'object') {
      return { error: 'Typed command must be an object with an "action" field' };
    }

    const action = typed.action;

    // --- move ---
    if (action === 'move') {
      const dir = typed.direction;
      const validDirs = this.serverProfile
        ? this.serverProfile.getMoveDirections()
        : ['north', 'south', 'east', 'west', 'up', 'down',
           'n', 's', 'e', 'w', 'u', 'd'];
      if (!dir || !validDirs.includes(dir.toLowerCase())) {
        return { error: `Invalid direction: "${dir}". Valid: ${validDirs.join(', ')}` };
      }
      return { command: dir.toLowerCase() };
    }

    // --- attack ---
    if (action === 'attack') {
      const target = typed.target;
      if (!target || typeof target !== 'string') {
        return { error: 'Attack requires a target string' };
      }
      const clean = target.replace(/[;\n\r]/g, '').trim().substring(0, 50);
      if (!clean) return { error: 'Empty target after sanitization' };
      const cmd = this.serverProfile
        ? this.serverProfile.getCommand('attack', { target: clean })
        : `kill ${clean}`;
      return { command: cmd || `kill ${clean}` };
    }

    // --- look ---
    if (action === 'look') {
      const params = {};
      if (typed.target) {
        params.target = typed.target.replace(/[;\n\r]/g, '').trim().substring(0, 50);
      }
      const cmd = this.serverProfile
        ? this.serverProfile.getCommand('look', params)
        : (params.target ? `look ${params.target}` : 'look');
      return { command: cmd || (params.target ? `look ${params.target}` : 'look') };
    }

    // --- Unknown action — check raw passthrough ---
    if (typed.raw && typeof typed.raw === 'string') {
      return { command: typed.raw.replace(/[;\n\r]/g, '').trim() };
    }
    return { error: `Unknown action: "${action}". Valid: move, attack, look. Use "raw" field for passthrough.` };
  }

  // Get a snapshot for IPC results
  snapshot() {
    return {
      gameState: this._state,
      stateAge: Date.now() - this._stateEnteredAt,
      recentEvents: this._recentEvents.slice(-20),
      decisionNeeded: this._decisionNeeded,
      decisionReason: this._decisionReason,
    };
  }

  // Clear the decision flag (agent has responded)
  clearDecision() {
    this._decisionNeeded = false;
    this._decisionReason = null;
    this._syncBlackboard();
  }

  // --- Text Processing (called from daemon's data handler) ---

  // Process incoming MUD text for state detection and reflexes
  processText(text) {
    const cp = this.serverProfile && this.serverProfile.combatPatterns;
    if (!cp) return; // No profile — skip combat detection entirely

    // Combat detection
    const mobHitYou = cp.mobHitYou;
    const youHitMob = cp.youHitMob;
    if ((mobHitYou && mobHitYou.test(text)) || (youHitMob && youHitMob.test(text))) {
      this._enterCombat(text);
      this._resetCombatIdleTimer();
    }

    // Mob death
    const mobDied = cp.mobDied;
    if (mobDied) {
      const deathMatch = text.match(mobDied);
      if (deathMatch) {
        const mobName = deathMatch[1] || deathMatch[2] || 'Unknown';
        this._recordEvent('kill', `${mobName} slain`);
        this._exitCombat('mob died');
      }
    }

    // Mob fled
    const mobFled = cp.mobFled;
    if (mobFled && mobFled.test(text)) {
      this._recordEvent('mob_fled', 'Target fled combat');
      this._exitCombat('mob fled');
    }

    // Successful flee/recall
    const fleeSuccess = cp.fleeSuccess;
    if (fleeSuccess && fleeSuccess.test(text)) {
      this._recordEvent('fled', 'Escaped combat');
      this._transition(GAME_STATES.resting, 'fled combat');
    }

    // Room detection — if we see exits, we might be exploring
    const exitPattern = this.serverProfile.exitPattern;
    if (exitPattern && exitPattern.test(text) && this._state === GAME_STATES.idle) {
      // Only transition to exploring if we recently moved (not just looking around)
      // For now, don't auto-transition — let the agent or typed commands drive this
    }
  }

  // Process HP updates (from GMCP or prompt parsing)
  processVitals(hp, maxHp, mana, maxMana) {
    if (hp == null || maxHp == null || maxHp === 0) return;

    const hpPct = hp / maxHp;

    // --- Reflexes (combat-gated, mutex-gated) ---
    if (this._state === GAME_STATES.combat && !this._ipcBusy) {
      const now = Date.now();

      // Auto-flee at threshold (highest priority)
      if (hpPct <= this._fleeThreshold && (now - this._lastFleeAt > this._fleeCooldownMs)) {
        this._lastFleeAt = now;
        this._recordEvent('reflex_flee', `HP critical: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        this.log('REFLEX', `Auto-flee triggered: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        const fleeCmd = this.serverProfile
          ? this.serverProfile.getFleeCommand()
          : 'recall';
        this.emit('reflex', fleeCmd);
        return; // Don't also heal
      }

      // Auto-heal at threshold
      if (hpPct <= this._healThreshold && (now - this._lastHealAt > this._healCooldownMs)) {
        this._lastHealAt = now;
        this._recordEvent('reflex_heal', `HP low: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        this.log('REFLEX', `Auto-heal triggered: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        const healCmd = this.serverProfile
          ? this.serverProfile.getHealCommand(this._characterClass)
          : 'quaff heal';
        this.emit('reflex', healCmd);
      }
    }

    // Resting recovery: if HP is back above 80%, return to idle
    if (this._state === GAME_STATES.resting && hpPct >= 0.80) {
      this._transition(GAME_STATES.idle, 'HP recovered');
      this._recordEvent('recovered', `HP restored to ${(hpPct * 100).toFixed(0)}%`);
    }
  }

  // --- Room Parsing (ported from Mico's combat-fsm.js) ---

  // Parse room text and return detected mobs. Does NOT change state —
  // the caller decides what to do with the mob list.
  parseMobs(roomText) {
    const mobs = [];
    const lines = roomText.split('\n');
    let pastExits = false;

    const exitPattern = this.serverProfile && this.serverProfile.exitPattern;
    const promptLine = this.serverProfile && this.serverProfile.promptLine;
    const flavorFilters = (this.serverProfile && this.serverProfile.flavorFilters) || [];
    const sceneryMobs = (this.serverProfile && this.serverProfile.sceneryMobs) || [];
    const standingVerbs = this.serverProfile && this.serverProfile.standingVerbs;

    for (const line of lines) {
      const trimmed = line.trim();

      if (exitPattern && exitPattern.test(trimmed)) {
        pastExits = true;
        continue;
      }

      if (!pastExits) continue;
      if (!trimmed) continue;
      // Skip prompt lines
      if (promptLine && promptLine.test(trimmed)) continue;
      if (/^>/.test(trimmed)) continue;
      if (trimmed.length > 100) continue;

      const isFlavor = flavorFilters.some(re => re.test(trimmed));
      if (isFlavor) continue;

      const lower = trimmed.toLowerCase();
      if (sceneryMobs.some(s => lower.includes(s))) continue;

      let mobName = null;

      // Pattern 1: "A/An/The <mob> <standing-verb>"
      const stripped = trimmed.replace(/^\([^)]+\)\s*/, '');
      if (/^(A|An|The) /i.test(stripped) && standingVerbs && standingVerbs.test(stripped)) {
        // Use the standingVerbs regex itself to find the break point
        const nameMatch = stripped.match(new RegExp(
          '^(?:A|An|The)\\s+(.+?)(?:\\s+(?:' + standingVerbs.source + '|is |with ))',
          'i'
        ));
        if (nameMatch) mobName = nameMatch[1].toLowerCase();
      }

      // Pattern 2: "<Name> is here"
      if (!mobName && /\bis here\b/i.test(stripped) && !/(Player)|you/i.test(stripped)) {
        const npcMatch = stripped.match(/^([A-Z][a-z]+)/);
        if (npcMatch) mobName = npcMatch[1].toLowerCase();
      }

      // Pattern 3: "A/An/The <mob> is <doing something> here"
      if (!mobName && /^(A|An|The) /i.test(stripped) && /\bis\b.*\bhere\b/i.test(stripped)) {
        const nameMatch = stripped.match(/^(?:A|An|The)\s+(.+?)\s+is\b/i);
        if (nameMatch) mobName = nameMatch[1].toLowerCase();
      }

      if (mobName) mobs.push(mobName);
    }

    return mobs;
  }

  // --- Internal ---

  _enterCombat(text) {
    if (this._state !== GAME_STATES.combat) {
      this._transition(GAME_STATES.combat, 'combat detected');
      this._recordEvent('combat_start', 'Entered combat');
    }
  }

  _exitCombat(reason) {
    if (this._state === GAME_STATES.combat) {
      this._clearCombatIdleTimer();
      this._transition(GAME_STATES.idle, reason);
    }
  }

  _transition(newState, reason) {
    if (newState === this._state) return;
    const old = this._state;
    this._state = newState;
    this._stateEnteredAt = Date.now();
    this.log('STATE', `${old} → ${newState} (${reason})`);
    this.emit('transition', { from: old, to: newState, reason });
    this._syncBlackboard();
  }

  _resetCombatIdleTimer() {
    this._clearCombatIdleTimer();
    if (this._state === GAME_STATES.combat) {
      this._combatIdleTimer = setTimeout(() => {
        if (this._state === GAME_STATES.combat) {
          this.log('STATE', `Combat idle timeout — returning to idle`);
          this._exitCombat(`combat timeout (no output for ${this._combatIdleMs / 1000}s)`);
        }
      }, this._combatIdleMs);
    }
  }

  _clearCombatIdleTimer() {
    if (this._combatIdleTimer) {
      clearTimeout(this._combatIdleTimer);
      this._combatIdleTimer = null;
    }
  }

  _recordEvent(type, detail) {
    const event = {
      type,
      detail,
      state: this._state,
      at: new Date().toISOString(),
    };
    this._recentEvents.push(event);
    if (this._recentEvents.length > this._maxEvents) {
      this._recentEvents.shift();
    }
    this._syncBlackboard();
  }

  _requestDecision(reason) {
    this._decisionNeeded = true;
    this._decisionReason = reason;
    this._syncBlackboard();
    this.emit('decision-needed', { reason, state: this._state });
  }

  _syncBlackboard() {
    if (!this.blackboard) return;
    this.blackboard.set('gameState', this._state);
    this.blackboard.set('recentEvents', this._recentEvents.slice(-20));
    this.blackboard.set('decisionNeeded', this._decisionNeeded);
    this.blackboard.set('decisionReason', this._decisionReason);
  }
}

module.exports = {
  GameStateEngine,
  GAME_STATES,
};
