'use strict';
// reflex-engine.js — JSON-driven, hot-reloadable, priority-based reflex rule engine.
// Evaluates conditions against world model state, fires actions with cooldown management.
//
// Rules are loaded from JSON files and can be hot-swapped by the LLM via IPC.

const EventEmitter = require('events');
const fs = require('fs');

class ReflexEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.worldModel = options.worldModel;
    this.sharedState = options.sharedState || null; // Phase 4
    this.log = options.log || ((type, msg) => console.log(`[Reflex:${type}] ${msg}`));

    this._rules = [];           // sorted by priority (lower = higher priority)
    this._cooldowns = new Map(); // ruleId → last fired timestamp
    this._suppressed = new Map(); // ruleId → true (suppressed until conditions change)
    this._ipcBusy = false;       // mutex: true when IPC is executing
    this._watchPath = null;
    this._watcher = null;
  }

  // --- Rule Management ---

  loadRules(filePath) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const rules = Array.isArray(raw) ? raw : (raw.rules || []);
      this._setRules(rules, `file:${filePath}`);
      return true;
    } catch (e) {
      this.log('WARN', `Failed to load rules from ${filePath}: ${e.message}`);
      return false;
    }
  }

  watchRules(filePath) {
    this._watchPath = filePath;
    this.loadRules(filePath);
    try {
      this._watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          setTimeout(() => this.loadRules(filePath), 100); // debounce
        }
      });
    } catch {
      // fs.watch not available — rules are loaded once
    }
  }

  stopWatching() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  setRules(rules) {
    this._setRules(rules, 'ipc');
  }

  addRule(rule) {
    if (!rule.id) rule.id = `rule-${Date.now()}`;
    this._rules.push(rule);
    this._sortRules();
    this.log('RULE', `Added rule: ${rule.id} (priority ${rule.priority || 99})`);
  }

  removeRule(ruleId) {
    const idx = this._rules.findIndex(r => r.id === ruleId);
    if (idx !== -1) {
      this._rules.splice(idx, 1);
      this._cooldowns.delete(ruleId);
      this.log('RULE', `Removed rule: ${ruleId}`);
    }
  }

  getRules() {
    return [...this._rules];
  }

  // --- Mutex ---

  acquireMutex() { this._ipcBusy = true; }
  releaseMutex() { this._ipcBusy = false; }

  // --- Text Processing (failure detection) ---

  // Call this from the daemon data handler to detect action failures.
  // When a failure pattern matches, the rule that fired is suppressed
  // and its fallback action (if any) fires instead.
  processText(text) {
    if (!text) return;
    const lower = text.toLowerCase();

    // Check each rule for failure patterns
    for (const rule of this._rules) {
      if (!rule.action) continue;
      const failPatterns = rule.action.failPatterns || [];

      for (const pattern of failPatterns) {
        if (lower.includes(pattern.toLowerCase())) {
          // This rule's action failed!
          if (!this._suppressed.get(rule.id)) {
            this._suppressed.set(rule.id, true);
            this.log('FAIL', `Rule "${rule.id}" suppressed: "${pattern}" detected`);

            // Fire fallback if defined
            if (rule.action.fallback) {
              this.emit('action', rule.action.fallback, rule);
              this.log('FALLBACK', `Rule "${rule.id}" fallback: ${rule.action.fallback}`);
            }
          }
          break;
        }
      }
    }

    // Also check global failure patterns that suppress any heal-type rule
    const HEAL_FAIL_PATTERNS = [
      "you don't have that",
      "you do not have that",
      "no potion",
      "nothing to quaff",
    ];
    for (const pattern of HEAL_FAIL_PATTERNS) {
      if (lower.includes(pattern)) {
        // Suppress all rules whose action contains 'quaff' or 'potion'
        for (const rule of this._rules) {
          if (!rule.action || !rule.action.command) continue;
          const cmd = rule.action.command.toLowerCase();
          if (cmd.includes('quaff') || cmd.includes('potion')) {
            if (!this._suppressed.get(rule.id)) {
              this._suppressed.set(rule.id, true);
              this.log('FAIL', `Rule "${rule.id}" suppressed: out of potions`);
              if (rule.action.fallback) {
                this.emit('action', rule.action.fallback, rule);
                this.log('FALLBACK', `Rule "${rule.id}" fallback: ${rule.action.fallback}`);
              }
            }
          }
        }
        break;
      }
    }
  }

  // Unsuppress rules (call when conditions change — e.g., player bought new potions,
  // or combat ended and we want a fresh start next fight)
  unsuppressAll() {
    if (this._suppressed.size > 0) {
      this.log('UNSUPPRESS', `Clearing ${this._suppressed.size} suppressed rules`);
      this._suppressed.clear();
    }
  }

  // --- Evaluation ---

  evaluate(trigger) {
    if (this._ipcBusy) return [];
    if (!this.worldModel) return [];

    // Expire TTL rules
    this._expireTTLRules();

    const actions = [];
    const now = Date.now();

    for (const rule of this._rules) {
      if (rule.enabled === false) continue;
      if (this._suppressed.get(rule.id)) continue; // Skip suppressed rules

      // Check cooldown
      const lastFired = this._cooldowns.get(rule.id) || 0;
      const cooldown = rule.cooldown || 0;
      if (now - lastFired < cooldown) continue;

      // Evaluate all conditions (AND logic)
      const conditions = rule.conditions || [];
      const allMet = conditions.every(c => this._evaluateCondition(c));

      if (allMet) {
        // Fire!
        this._cooldowns.set(rule.id, now);
        const action = rule.action;
        if (action && action.command) {
          actions.push(action.command);
          this.emit('action', action.command, rule);
          this.log('FIRE', `Rule "${rule.id}": ${action.command}`);
        }
        // Only fire highest-priority matching rule per evaluation
        // (prevents heal + flee in same tick)
        break;
      }
    }

    return actions;
  }

  // --- Snapshot ---

  snapshot() {
    return {
      ruleCount: this._rules.length,
      suppressedCount: this._suppressed.size,
      rules: this._rules.map(r => ({
        id: r.id,
        priority: r.priority,
        enabled: r.enabled !== false,
        suppressed: this._suppressed.get(r.id) || false,
        description: r.description || null,
        cooldown: r.cooldown || 0,
        lastFired: this._cooldowns.get(r.id) || null,
        hasFallback: !!(r.action && r.action.fallback),
      })),
    };
  }

  // --- Internal ---

  _setRules(rules, source) {
    this._rules = rules.filter(r => r && r.id);
    this._sortRules();
    this.log('LOAD', `Loaded ${this._rules.length} rules from ${source}`);
    this.emit('rules:loaded', this._rules.length);
  }

  _sortRules() {
    this._rules.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }

  _expireTTLRules() {
    const now = Date.now();
    this._rules = this._rules.filter(rule => {
      if (!rule.ttl) return true;
      if (!rule._createdAt) rule._createdAt = now;
      return (now - rule._createdAt) < rule.ttl;
    });
  }

  _evaluateCondition(condition) {
    if (!condition || !condition.type) return false;
    const wm = this.worldModel;

    switch (condition.type) {
      case 'hpPercent': {
        if (!wm.self.maxHp || wm.self.maxHp === 0) return false;
        const pct = wm.self.hp / wm.self.maxHp;
        return this._compareOp(pct, condition.op, condition.value);
      }

      case 'manaPercent': {
        if (!wm.self.maxMana || wm.self.maxMana === 0) return false;
        const pct = wm.self.mana / wm.self.maxMana;
        return this._compareOp(pct, condition.op, condition.value);
      }

      case 'movesPercent': {
        if (!wm.self.maxMoves || wm.self.maxMoves === 0) return false;
        const pct = wm.self.moves / wm.self.maxMoves;
        return this._compareOp(pct, condition.op, condition.value);
      }

      case 'resourcePercent': {
        const resName = condition.resource;
        if (!resName) return false;
        const current = wm.self[resName];
        const maxField = condition.maxField || ('max' + resName.charAt(0).toUpperCase() + resName.slice(1));
        const max = wm.self[maxField];
        if (current == null || !max || max === 0) return false;
        return this._compareOp(current / max, condition.op, condition.value);
      }

      case 'state':
        return wm.self.state === condition.equals;

      case 'inCombat':
        return wm.self.inCombat === true;

      case 'notInCombat':
        return wm.self.inCombat !== true;

      case 'hasTarget':
        return !!wm.self.currentTarget;

      case 'groupMemberHp': {
        // Check if any (or specific role's) party member HP is below threshold
        const members = wm.party.members || [];
        return members.some(m => {
          if (condition.role && condition.role !== m.role) return false;
          if (condition.name && condition.name !== m.name) return false;
          if (!m.maxHp || m.maxHp === 0) return false;
          const pct = m.hp / m.maxHp;
          return this._compareOp(pct, condition.op, condition.value);
        });
      }

      case 'entityInRoom': {
        const entities = wm.getEntitiesInRoom();
        return entities.some(e => {
          if (condition.entityType && e.type !== condition.entityType) return false;
          if (condition.name && !e.name.toLowerCase().includes(condition.name.toLowerCase())) return false;
          return true;
        });
      }

      case 'textMatch':
        // This would need the most recent text — not directly available
        // from world model. Could be added as a temporary field.
        return false;

      case 'not':
        return !this._evaluateCondition(condition.condition);

      case 'and':
        return (condition.conditions || []).every(c => this._evaluateCondition(c));

      case 'or':
        return (condition.conditions || []).some(c => this._evaluateCondition(c));

      default:
        return false;
    }
  }

  _compareOp(actual, op, value) {
    switch (op) {
      case '<':  return actual < value;
      case '<=': return actual <= value;
      case '>':  return actual > value;
      case '>=': return actual >= value;
      case '==': return actual === value;
      case '!=': return actual !== value;
      default:   return actual <= value; // default to <=
    }
  }
}

module.exports = { ReflexEngine };
