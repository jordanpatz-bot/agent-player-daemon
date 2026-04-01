'use strict';
// state-audit.js — Self-awareness system for LLM agents.
// Scans world model state and surfaces gaps, opportunities, and questions.
//
// Audit rules are data, not code. The LLM can:
//   - Suppress findings it's already aware of (with reason + optional expiry)
//   - Add custom audit rules based on discovered game systems
//   - Remove default rules that don't apply
//
// IPC commands: getAudit, suppressAudit, addAuditRule, removeAuditRule

const fs = require('fs');
const path = require('path');
const { atomicWriteJSON } = require('./atomic-write');

// Built-in audit checks. Each returns null (no finding) or a finding object.
// These are universal across games — they check structural patterns, not game-specific knowledge.
const BUILTIN_CHECKS = {

  'equipment-slots': (wm, ctx) => {
    // Count empty equipment slots from last equipment check
    const inv = ctx.lastEquipmentOutput;
    const cmd = ctx.serverProfile ? (ctx.serverProfile._commands.checkEquipment || 'equipment') : 'equipment';
    if (!inv) return { id: 'equipment-slots', severity: 'info', message: `Equipment status unknown — try running "${cmd}" to see your gear.` };
    const emptyCount = (inv.match(/< empty >/g) || []).length;
    const totalSlots = (inv.match(/\[.*\]/g) || []).length;
    if (emptyCount === 0) return null;
    if (emptyCount <= 3) return null; // a few empty is normal
    return {
      id: 'equipment-slots',
      severity: emptyCount > 8 ? 'warning' : 'info',
      message: `${emptyCount} of ${totalSlots} equipment slots are empty. Investigate shops, NPC vendors, or drops to fill them.`,
      data: { emptyCount, totalSlots },
    };
  },

  'unspent-trains': (wm, ctx) => {
    if (ctx.serverProfile && ctx.serverProfile.capabilities.hasTrains === false) return null;
    const trains = wm.self._trains;
    if (trains == null) return null;
    if (trains < 5) return null;
    return {
      id: 'unspent-trains',
      severity: trains > 20 ? 'warning' : 'info',
      message: `${trains} unspent training sessions. Visit a trainer and experiment with stat improvements. Test damage before/after to see what helps your role.`,
      data: { trains },
    };
  },

  'unspent-practices': (wm, ctx) => {
    if (ctx.serverProfile && ctx.serverProfile.capabilities.hasPractices === false) return null;
    const pracs = wm.self._practices;
    if (pracs == null) return null;
    if (pracs < 5) return null;
    return {
      id: 'unspent-practices',
      severity: pracs > 15 ? 'warning' : 'info',
      message: `${pracs} unspent practices. Check "practice" at a trainer to see unpracticed skills. Prioritize combat-relevant abilities.`,
      data: { pracs },
    };
  },

  'hunger-thirst': (wm) => {
    const hunger = wm.self._hunger;
    const thirst = wm.self._thirst;
    if (hunger == null && thirst == null) return null;
    const starving = hunger !== null && hunger <= 5;
    const dehydrated = thirst !== null && thirst <= 5;
    if (!starving && !dehydrated) return null;
    const issues = [];
    if (starving) issues.push('starving');
    if (dehydrated) issues.push('dehydrated');
    return {
      id: 'hunger-thirst',
      severity: 'warning',
      message: `You are ${issues.join(' and ')}. This reduces healing and regen. Find food and water — check shops, fountains, or ask an NPC.`,
    };
  },

  'low-hp-idle': (wm) => {
    if (wm.self.inCombat) return null;
    if (!wm.self.maxHp || wm.self.maxHp === 0) return null;
    const pct = wm.self.hp / wm.self.maxHp;
    if (pct > 0.5) return null;
    return {
      id: 'low-hp-idle',
      severity: 'info',
      message: `HP at ${Math.round(pct * 100)}% while idle. Rest, use a potion, or find a healer before engaging combat.`,
    };
  },

  'no-party': (wm) => {
    if (wm.party.members.length > 0) return null;
    return {
      id: 'no-party',
      severity: 'info',
      message: 'Not in a group. If teammates are available, forming a party shares XP and enables group tactics.',
    };
  },

  'npcs-in-room': (wm) => {
    // This check is a hint — "there are things here worth interacting with"
    // The entity list from room parsing would feed this.
    // For now, we can't directly detect NPCs without parsing room text.
    return null;
  },

  'combat-too-easy': (wm) => {
    const kills = wm.getEvents({ type: 'kill', limit: 10 });
    if (kills.length < 5) return null;
    // If we have kill data, check if mobs are dying too fast
    // (This is a placeholder — would need damage/round tracking to be meaningful)
    return null;
  },

  'quest-available': (wm) => {
    const questEvents = wm.getEvents({ type: 'quest', limit: 5 });
    const lastReady = questEvents.filter(e => e.detail.includes('ready'));
    if (lastReady.length === 0) return null;
    // If last quest event was "ready" and no "start" followed, suggest questing
    const last = questEvents[questEvents.length - 1];
    if (last && last.detail.includes('ready')) {
      return {
        id: 'quest-available',
        severity: 'info',
        message: 'A quest is available. Use "quest request" to get an assignment for bonus XP and quest points.',
      };
    }
    return null;
  },

  'unmapped-exits': (wm) => {
    const room = wm.getCurrentRoom();
    if (!room || !room.exits) return null;
    let unmapped = 0;
    for (const [dir, targetId] of Object.entries(room.exits)) {
      if (!wm.getRoom(targetId)) unmapped++;
    }
    if (unmapped === 0) return null;
    return {
      id: 'unmapped-exits',
      severity: 'info',
      message: `${unmapped} unexplored exit(s) from this room. Exploration builds your map for navigation.`,
      data: { unmapped },
    };
  },
};

class StateAudit {
  constructor(options = {}) {
    this.worldModel = options.worldModel;
    this.log = options.log || ((type, msg) => console.log(`[Audit:${type}] ${msg}`));
    this.persistPath = options.persistPath || null;
    this.serverProfile = options.serverProfile || null;

    // Suppressed findings: id → { reason, suppressedAt, expiresAt? }
    this._suppressed = new Map();

    // Custom rules added by the LLM: id → { description, check: string (condition expression) }
    this._customRules = new Map();

    // Context data that builtin checks can reference (populated by processText or IPC)
    this._context = {
      lastEquipmentOutput: null,
      lastScoreOutput: null,
      lastTrainOutput: null,
      lastPracticeOutput: null,
      serverProfile: this.serverProfile,
    };

    this._load();
  }

  // --- Run audit ---

  run() {
    this._context.serverProfile = this.serverProfile;
    this._context.capabilities = this.serverProfile ? this.serverProfile.capabilities : {};
    const findings = [];

    // Run built-in checks
    for (const [id, checkFn] of Object.entries(BUILTIN_CHECKS)) {
      if (this._suppressed.has(id)) {
        // Check if suppression expired
        const sup = this._suppressed.get(id);
        if (sup.expiresAt && Date.now() > sup.expiresAt) {
          this._suppressed.delete(id);
        } else {
          continue; // Still suppressed
        }
      }
      try {
        const finding = checkFn(this.worldModel, this._context);
        if (finding) findings.push(finding);
      } catch { /* non-fatal */ }
    }

    // Run custom rules
    for (const [id, rule] of this._customRules) {
      if (this._suppressed.has(id)) {
        const sup = this._suppressed.get(id);
        if (sup.expiresAt && Date.now() > sup.expiresAt) {
          this._suppressed.delete(id);
        } else {
          continue;
        }
      }
      try {
        const finding = this._evaluateCustomRule(rule);
        if (finding) findings.push(finding);
      } catch { /* non-fatal */ }
    }

    return {
      findings,
      suppressedCount: this._suppressed.size,
      customRuleCount: this._customRules.size,
    };
  }

  // --- Context updates (call from daemon data pipeline) ---

  processText(text) {
    // Capture equipment output for slot analysis
    const eqPattern = (this.serverProfile && this.serverProfile.capabilities.equipmentOutputPattern) || 'You are using:';
    if (text.includes('You are using:') || text.includes(eqPattern) || text.includes('[ Used as light')) {
      this._context.lastEquipmentOutput = text;
    }
    // Capture score output for stat analysis
    if (text.includes('Practices') && text.includes('Trains')) {
      // Parse trains/practices from score output
      const trainMatch = text.match(/Trains\s*:\s*\[\s*(\d+)\]/);
      const pracMatch = text.match(/Practices?\s*:\s*\[\s*(\d+)\]/);
      if (trainMatch) this.worldModel.self._trains = parseInt(trainMatch[1]);
      if (pracMatch) this.worldModel.self._practices = parseInt(pracMatch[1]);
      // Parse hunger/thirst
      const hungerMatch = text.match(/Hunger\s*:\s*(\d+)/);
      const thirstMatch = text.match(/Thirst\s*:\s*(\d+)/);
      if (hungerMatch) this.worldModel.self._hunger = parseInt(hungerMatch[1]);
      if (thirstMatch) this.worldModel.self._thirst = parseInt(thirstMatch[1]);
      this._context.lastScoreOutput = text;
    }
    // Capture train output
    if (text.includes('training sessions available')) {
      const match = text.match(/(\d+) training sessions/);
      if (match) this.worldModel.self._trains = parseInt(match[1]);
      this._context.lastTrainOutput = text;
    }
    // Capture practice output
    if (text.includes('practice sessions available')) {
      const match = text.match(/(\d+) practice sessions/);
      if (match) this.worldModel.self._practices = parseInt(match[1]);
      this._context.lastPracticeOutput = text;
    }
    // Capture hunger/thirst from prompt (Starving/Dehydrated)
    if (/Starving/i.test(text)) this.worldModel.self._hunger = 0;
    if (/Dehydrated/i.test(text)) this.worldModel.self._thirst = 0;
  }

  // --- Suppress a finding ---

  suppress(findingId, reason, durationMs) {
    const entry = {
      reason: reason || 'Acknowledged by agent',
      suppressedAt: Date.now(),
      expiresAt: durationMs ? Date.now() + durationMs : null,
    };
    this._suppressed.set(findingId, entry);
    this.log('SUPPRESS', `"${findingId}": ${reason}${durationMs ? ` (expires in ${durationMs / 1000}s)` : ' (permanent)'}`);
    this._save();
  }

  unsuppress(findingId) {
    this._suppressed.delete(findingId);
    this._save();
  }

  getSuppressed() {
    return Object.fromEntries(this._suppressed);
  }

  // --- Custom rules (LLM-defined) ---

  addCustomRule(rule) {
    if (!rule.id || !rule.description) return false;
    this._customRules.set(rule.id, rule);
    this.log('CUSTOM', `Added rule: "${rule.id}" — ${rule.description}`);
    this._save();
    return true;
  }

  removeCustomRule(id) {
    const removed = this._customRules.delete(id);
    if (removed) this._save();
    return removed;
  }

  getCustomRules() {
    return Object.fromEntries(this._customRules);
  }

  // --- Custom rule evaluation ---

  _evaluateCustomRule(rule) {
    // Custom rules use a simple declarative format:
    // { id, description, severity, field, op, value, message }
    // where field is a dot-path into worldModel.self (e.g., "self.gold", "party.members.length")
    if (!rule.field) {
      // Static message rule — always fires
      return {
        id: rule.id,
        severity: rule.severity || 'info',
        message: rule.message || rule.description,
      };
    }

    const actual = this._resolvePath(rule.field);
    if (actual == null) return null;

    const threshold = rule.value;
    let triggered = false;

    switch (rule.op || '!=') {
      case '<':  triggered = actual < threshold; break;
      case '<=': triggered = actual <= threshold; break;
      case '>':  triggered = actual > threshold; break;
      case '>=': triggered = actual >= threshold; break;
      case '==': triggered = actual === threshold; break;
      case '!=': triggered = actual !== threshold; break;
      case 'exists': triggered = actual != null; break;
      case 'missing': triggered = actual == null; break;
      default: triggered = false;
    }

    if (!triggered) return null;
    return {
      id: rule.id,
      severity: rule.severity || 'info',
      message: (rule.message || rule.description).replace('{value}', actual),
      data: { field: rule.field, actual, threshold },
    };
  }

  _resolvePath(fieldPath) {
    const parts = fieldPath.split('.');
    let obj = this.worldModel;
    for (const part of parts) {
      if (obj == null) return null;
      if (part === 'length' && Array.isArray(obj)) return obj.length;
      obj = obj[part];
    }
    return obj;
  }

  // --- Persistence ---

  _save() {
    if (!this.persistPath) return;
    const data = {
      suppressed: Object.fromEntries(this._suppressed),
      customRules: Object.fromEntries(this._customRules),
      savedAt: new Date().toISOString(),
    };
    try { atomicWriteJSON(this.persistPath, data); }
    catch { /* non-fatal */ }
  }

  _load() {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf8'));
      if (raw.suppressed) {
        for (const [id, entry] of Object.entries(raw.suppressed)) {
          this._suppressed.set(id, entry);
        }
      }
      if (raw.customRules) {
        for (const [id, rule] of Object.entries(raw.customRules)) {
          this._customRules.set(id, rule);
        }
      }
    } catch { /* corrupted — start fresh */ }
  }
}

module.exports = { StateAudit };
