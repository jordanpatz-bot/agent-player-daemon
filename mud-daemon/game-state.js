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
// Ported state detection logic from Mico's combat-fsm.js (mob parsing,
// HP thresholds, room scanning, flavor text filtering).

const EventEmitter = require('events');

// --- Game States ---
const GAME_STATES = {
  idle: 'idle',
  combat: 'combat',
  exploring: 'exploring',
  resting: 'resting',
};

// --- Mob Detection (ported from Mico's combat-fsm.js) ---

// Lines matching these patterns are room events/flavor, NOT targetable mobs
const FLAVOR_FILTERS = [
  /startled by/i,
  /scampers? (?:off|away)/i,
  /runs? away/i,
  /disappears?/i,
  /leaves? (?:heading |going )?(?:north|south|east|west|up|down)/i,
  /arrives? from/i,
  /your presence/i,
  /flies? (?:off|away)/i,
  /darts? (?:off|away|into)/i,
  /burrows? into/i,
  /slips? (?:away|into)/i,
  /has arrived/i,
  /just left/i,
  /^\(Player\)/i,
  /^\(Charmed\)/i,
  /^\(Animated\)/i,
];

// Scenery "mobs" that appear in descriptions but aren't targetable
const SCENERY_MOBS = ['grasshopper'];

// Standing verbs that indicate a targetable mob in the room
const STANDING_VERBS = /waddles|slithers|glides|lurks|prowls|stands|sits|crawls|hops|coils|rests|waits|watches|guards|circles|paces|flutters|flexes|threatens|wanders|roams|floats|hovers|shambles|staggers|gnaws|snarls|growls|looms|shuffles|flies|scurries|twitches|lopes/i;

// --- Combat Detection Patterns ---
const COMBAT_PATTERNS = {
  MOB_DIED: /(.+?) is (?:slain|DEAD)/i,
  MOB_HIT_YOU: /(.+?) (?:hits|misses|scratches|decimates|mauls|claws|bites|stings|whips|slashes|pierces|pounds|crushes|blasts) you/i,
  YOU_HIT_MOB: /Your (.+?) (?:hits|misses|scratches|decimates|mauls|claws|bites|stings|whips|slashes|pierces|pounds|crushes|blasts)/i,
  FLEE_SUCCESS: /You flee from combat|You recall/i,
  NOT_IN_COMBAT: /You aren't fighting anyone|Not while you are fighting/i,
  MOB_FLED: /turns tail and runs|flees from combat/i,
};

// --- Reflex Thresholds ---
const REFLEX_HEAL_PCT = 0.50;   // Auto-heal at 50% HP
const REFLEX_FLEE_PCT = 0.20;   // Auto-flee at 20% HP

// --- Typed Command Translators (Aardwolf) ---
// Each translator returns a raw MUD command string, or null if invalid.
const TYPED_COMMANDS = {
  move: (params) => {
    const dir = params && params.direction;
    const VALID_DIRS = ['north', 'south', 'east', 'west', 'up', 'down',
      'n', 's', 'e', 'w', 'u', 'd',
      'northeast', 'northwest', 'southeast', 'southwest',
      'ne', 'nw', 'se', 'sw'];
    if (!dir || !VALID_DIRS.includes(dir.toLowerCase())) {
      return { error: `Invalid direction: "${dir}". Valid: ${VALID_DIRS.join(', ')}` };
    }
    return { command: dir.toLowerCase() };
  },

  attack: (params) => {
    const target = params && params.target;
    if (!target || typeof target !== 'string') {
      return { error: 'Attack requires a target string' };
    }
    // Sanitize: no semicolons, no command injection
    const clean = target.replace(/[;\n\r]/g, '').trim().substring(0, 50);
    if (!clean) return { error: 'Empty target after sanitization' };
    return { command: `kill ${clean}` };
  },

  look: (params) => {
    const target = params && params.target;
    if (target) {
      const clean = target.replace(/[;\n\r]/g, '').trim().substring(0, 50);
      return { command: `look ${clean}` };
    }
    return { command: 'look' };
  },
};


class GameStateEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.blackboard = options.blackboard;   // BlackboardStore instance
    this.connection = options.connection;     // MudConnection instance (for sending commands)
    this.log = options.log || ((type, msg) => console.log(`[GameState:${type}] ${msg}`));

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

    // Idle timer: if no combat output for N seconds while in combat, drop to idle
    this._combatIdleTimer = null;
    this._combatIdleMs = 15000; // 15s of silence = not in combat

    // Reflex cooldowns (prevent spam)
    this._lastHealAt = 0;
    this._lastFleeAt = 0;
    this._healCooldownMs = 5000;   // Don't re-heal within 5s
    this._fleeCooldownMs = 10000;  // Don't re-flee within 10s

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

    const translator = TYPED_COMMANDS[typed.action];
    if (!translator) {
      // Unknown action — check if it has a raw field for passthrough
      if (typed.raw && typeof typed.raw === 'string') {
        return { command: typed.raw.replace(/[;\n\r]/g, '').trim() };
      }
      return { error: `Unknown action: "${typed.action}". Valid: ${Object.keys(TYPED_COMMANDS).join(', ')}. Use "raw" field for passthrough.` };
    }

    return translator(typed);
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
    // Combat detection
    if (COMBAT_PATTERNS.MOB_HIT_YOU.test(text) || COMBAT_PATTERNS.YOU_HIT_MOB.test(text)) {
      this._enterCombat(text);
      this._resetCombatIdleTimer();
    }

    // Mob death
    const deathMatch = text.match(COMBAT_PATTERNS.MOB_DIED);
    if (deathMatch) {
      this._recordEvent('kill', `${deathMatch[1]} slain`);
      this._exitCombat('mob died');
    }

    // Mob fled
    if (COMBAT_PATTERNS.MOB_FLED.test(text)) {
      this._recordEvent('mob_fled', 'Target fled combat');
      this._exitCombat('mob fled');
    }

    // Successful flee/recall
    if (COMBAT_PATTERNS.FLEE_SUCCESS.test(text)) {
      this._recordEvent('fled', 'Escaped combat');
      this._transition(GAME_STATES.resting, 'fled combat');
    }

    // Room detection — if we see exits, we might be exploring
    if (/\[ Exits:/.test(text) && this._state === GAME_STATES.idle) {
      // Only transition to exploring if we recently moved (not just looking around)
      // For now, don't auto-transition — let the agent or typed commands drive this
    }
  }

  // Process HP updates (from GMCP or prompt parsing)
  processVitals(hp, maxHp, mana, maxMana) {
    if (!hp || !maxHp) return;

    const hpPct = hp / maxHp;

    // --- Reflexes (combat-gated, mutex-gated) ---
    if (this._state === GAME_STATES.combat && !this._ipcBusy) {
      const now = Date.now();

      // Auto-flee at 20% HP (highest priority)
      if (hpPct <= REFLEX_FLEE_PCT && (now - this._lastFleeAt > this._fleeCooldownMs)) {
        this._lastFleeAt = now;
        this._recordEvent('reflex_flee', `HP critical: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        this.log('REFLEX', `Auto-flee triggered: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        this.emit('reflex', 'recall');
        return; // Don't also heal
      }

      // Auto-heal at 50% HP
      if (hpPct <= REFLEX_HEAL_PCT && (now - this._lastHealAt > this._healCooldownMs)) {
        this._lastHealAt = now;
        this._recordEvent('reflex_heal', `HP low: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        this.log('REFLEX', `Auto-heal triggered: ${hp}/${maxHp} (${(hpPct * 100).toFixed(0)}%)`);
        // Use 'cast cure light' for Aardwolf — profile-configurable in future
        this.emit('reflex', 'cast \'cure light\'');
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

    for (const line of lines) {
      const trimmed = line.trim();

      if (/\[ Exits:/.test(trimmed)) {
        pastExits = true;
        continue;
      }

      if (!pastExits) continue;
      if (!trimmed || /^\[.*hp.*mn.*mv/.test(trimmed) || /^>/.test(trimmed)) continue;
      if (trimmed.length > 100) continue;

      const isFlavor = FLAVOR_FILTERS.some(re => re.test(trimmed));
      if (isFlavor) continue;

      const lower = trimmed.toLowerCase();
      if (SCENERY_MOBS.some(s => lower.includes(s))) continue;

      let mobName = null;

      // Pattern 1: "A/An/The <mob> <standing-verb>"
      const stripped = trimmed.replace(/^\([^)]+\)\s*/, '');
      if (/^(A|An|The) /i.test(stripped) && STANDING_VERBS.test(stripped)) {
        const nameMatch = stripped.match(/^(?:A|An|The)\s+(.+?)(?:\s+(?:waddles|slithers|glides|lurks|prowls|stands|sits|crawls|hops|coils|rests|waits|watches|guards|circles|paces|flutters|flexes|threatens|wanders|roams|floats|hovers|shambles|staggers|gnaws|snarls|growls|looms|shuffles|is |with ))/i);
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
          this.log('STATE', 'Combat idle timeout — returning to idle');
          this._exitCombat('combat timeout (no output for 15s)');
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
  TYPED_COMMANDS,
  COMBAT_PATTERNS,
  FLAVOR_FILTERS,
  SCENERY_MOBS,
  STANDING_VERBS,
  REFLEX_HEAL_PCT,
  REFLEX_FLEE_PCT,
};
