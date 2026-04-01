'use strict';
// behavior-tree.js — LLM-authored, daemon-executed behavior trees.
// The tactical brain: sits between strategic LLM decisions and mechanical execution.
//
// Ticked on every world model update. Evaluates from root, returns SUCCESS/FAILURE/RUNNING.
// The LLM writes the tree in JSON. The daemon runs it at game-tick speed.
//
// Node types:
//   Composites: selector, sequence
//   Decorators: cooldown, condition, inverter, repeatUntil
//   Leaves:     action (send command), check (evaluate condition), escalate (signal LLM), log

const EventEmitter = require('events');
const fs = require('fs');

const STATUS = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  RUNNING: 'RUNNING',
};

class BehaviorTree extends EventEmitter {
  constructor(options = {}) {
    super();
    this.worldModel = options.worldModel;
    this.sharedState = options.sharedState || null;
    this.log = options.log || ((type, msg) => console.log(`[BT:${type}] ${msg}`));

    this._root = null;           // compiled root node
    this._treeDef = null;        // raw JSON definition
    this._cooldowns = new Map(); // nodeId → last fired timestamp
    this._ipcBusy = false;       // mutex
    this._tickCount = 0;
    this._lastActionAt = 0;
    this._minActionIntervalMs = options.minActionIntervalMs || 1000; // min 1s between commands
    this._watchPath = null;
    this._watcher = null;
  }

  // --- Loading ---

  loadFromFile(filePath) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.loadTree(raw.tree || raw);
      this.log('LOAD', `Loaded tree from ${filePath}`);
      return true;
    } catch (e) {
      this.log('WARN', `Failed to load tree: ${e.message}`);
      return false;
    }
  }

  watchFile(filePath) {
    this._watchPath = filePath;
    this.loadFromFile(filePath);
    try {
      this._watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          setTimeout(() => this.loadFromFile(filePath), 100);
        }
      });
    } catch { /* fs.watch not available */ }
  }

  stopWatching() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
  }

  loadTree(definition) {
    this._treeDef = definition;
    this._root = this._compile(definition);
    this._cooldowns.clear();
    this.emit('tree:loaded');
  }

  getTree() {
    return this._treeDef;
  }

  // --- Mutex ---

  acquireMutex() { this._ipcBusy = true; }
  releaseMutex() { this._ipcBusy = false; }

  // --- Tick ---

  tick() {
    if (this._ipcBusy) return STATUS.FAILURE;
    if (!this._root) return STATUS.FAILURE;
    if (!this.worldModel) return STATUS.FAILURE;

    this._tickCount++;
    const result = this._execute(this._root);
    return result;
  }

  // --- Snapshot ---

  snapshot() {
    return {
      hasTree: !!this._root,
      tickCount: this._tickCount,
      cooldowns: Object.fromEntries(this._cooldowns),
      treeSummary: this._treeDef ? this._summarize(this._treeDef) : null,
    };
  }

  // --- Compile JSON → executable node ---

  _compile(def) {
    if (!def || !def.type) return null;

    const node = { ...def, _id: def.name || def.id || `node-${Math.random().toString(36).slice(2, 6)}` };

    // Compile children recursively
    if (node.children) {
      node._children = node.children.map(c => this._compile(c)).filter(Boolean);
    }
    if (node.child) {
      node._child = this._compile(node.child);
    }
    if (node.condition && typeof node.condition === 'object' && node.type !== 'check') {
      // condition decorator — the condition is evaluated, child runs if true
    }

    return node;
  }

  // --- Execute a node ---

  _execute(node) {
    if (!node) return STATUS.FAILURE;

    switch (node.type) {

      // --- Composites ---

      case 'selector': {
        // Try each child until one succeeds (OR / fallback)
        for (const child of (node._children || [])) {
          const result = this._execute(child);
          if (result === STATUS.SUCCESS || result === STATUS.RUNNING) return result;
        }
        return STATUS.FAILURE;
      }

      case 'sequence': {
        // Run each child in order; fail if any fails (AND)
        for (const child of (node._children || [])) {
          const result = this._execute(child);
          if (result === STATUS.FAILURE) return STATUS.FAILURE;
          if (result === STATUS.RUNNING) return STATUS.RUNNING;
        }
        return STATUS.SUCCESS;
      }

      // --- Decorators ---

      case 'cooldown': {
        const cdMs = node.ms || 5000;
        const lastFired = this._cooldowns.get(node._id) || 0;
        if (Date.now() - lastFired < cdMs) return STATUS.FAILURE;
        const result = node._child ? this._execute(node._child) : STATUS.FAILURE;
        if (result === STATUS.SUCCESS) {
          this._cooldowns.set(node._id, Date.now());
        }
        return result;
      }

      case 'condition': {
        // Gate: evaluate condition, run child only if true
        const condMet = this._evaluateCondition(node.condition);
        if (!condMet) return STATUS.FAILURE;
        return node._child ? this._execute(node._child) : STATUS.SUCCESS;
      }

      case 'inverter': {
        const result = node._child ? this._execute(node._child) : STATUS.FAILURE;
        if (result === STATUS.SUCCESS) return STATUS.FAILURE;
        if (result === STATUS.FAILURE) return STATUS.SUCCESS;
        return STATUS.RUNNING;
      }

      case 'guard': {
        // Like condition but wraps a composite — common pattern
        const condMet = this._evaluateCondition(node.condition);
        if (!condMet) return STATUS.FAILURE;
        // Run children as a sequence
        for (const child of (node._children || [])) {
          const result = this._execute(child);
          if (result === STATUS.FAILURE) return STATUS.FAILURE;
          if (result === STATUS.RUNNING) return STATUS.RUNNING;
        }
        return STATUS.SUCCESS;
      }

      // --- Leaves ---

      case 'check': {
        // Pure condition check — no side effects
        return this._evaluateCondition(node.condition) ? STATUS.SUCCESS : STATUS.FAILURE;
      }

      case 'action': {
        // Send a command to the game
        const now = Date.now();
        if (now - this._lastActionAt < this._minActionIntervalMs) {
          return STATUS.RUNNING; // throttled, try again next tick
        }
        const cmd = node.command;
        if (!cmd) return STATUS.FAILURE;
        this._lastActionAt = now;
        this.emit('action', cmd, node);
        this.log('ACTION', `${node._id}: ${cmd}`);
        return STATUS.SUCCESS;
      }

      case 'escalate': {
        // Signal that the LLM needs to make a decision
        this.emit('escalate', {
          reason: node.reason || 'Tactical decision needed',
          context: node.context || {},
          nodeId: node._id,
        });
        this.log('ESCALATE', `${node._id}: ${node.reason || 'decision needed'}`);
        return STATUS.RUNNING; // keep tree alive while waiting for LLM
      }

      case 'log': {
        this.log('TREE', `${node._id}: ${node.message || ''}`);
        return STATUS.SUCCESS;
      }

      // --- Shorthand composites (sugar) ---

      case 'if': {
        // Shorthand: { type: 'if', condition: {...}, then: {...}, else: {...} }
        const condMet = this._evaluateCondition(node.condition);
        if (condMet && node.then) return this._execute(this._compile(node.then));
        if (!condMet && node.else) return this._execute(this._compile(node.else));
        return condMet ? STATUS.SUCCESS : STATUS.FAILURE;
      }

      default:
        this.log('WARN', `Unknown node type: ${node.type}`);
        return STATUS.FAILURE;
    }
  }

  // --- Condition evaluation (shared with reflex engine) ---

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

      case 'resourcePercent': {
        // Generic resource pool check — works for any game-defined resource
        // Usage: { type: "resourcePercent", resource: "endurance", op: "<=", value: 0.20 }
        const resName = condition.resource;
        if (!resName) return false;
        const current = wm.self[resName];
        // Find the max field name. Convention: maxHp for hp, maxMana for mana, etc.
        // Or use explicit maxField if provided in the condition.
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

      case 'noTarget':
        return !wm.self.currentTarget;

      case 'groupMemberHp': {
        const members = wm.party.members || [];
        return members.some(m => {
          if (condition.name && condition.name !== m.name) return false;
          if (!m.maxHp || m.maxHp === 0) return false;
          return this._compareOp(m.hp / m.maxHp, condition.op, condition.value);
        });
      }

      case 'partySize': {
        const size = (wm.party.members || []).length;
        return this._compareOp(size, condition.op, condition.value);
      }

      case 'and':
        return (condition.conditions || []).every(c => this._evaluateCondition(c));

      case 'or':
        return (condition.conditions || []).some(c => this._evaluateCondition(c));

      case 'not':
        return !this._evaluateCondition(condition.condition);

      case 'true': return true;
      case 'false': return false;

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
      default:   return actual <= value;
    }
  }

  // --- Summarize tree for snapshot ---

  _summarize(def, depth = 0) {
    if (!def) return null;
    const name = def.name || def.id || def.type;
    const summary = { type: def.type, name };
    if (def.command) summary.command = def.command;
    if (def.condition) summary.condition = def.condition.type;
    if (def.children) {
      summary.children = def.children.map(c => this._summarize(c, depth + 1));
    }
    if (def.child) {
      summary.child = this._summarize(def.child, depth + 1);
    }
    return summary;
  }
}

module.exports = { BehaviorTree, STATUS };
