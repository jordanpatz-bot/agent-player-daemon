'use strict';
// tactics.js — Role definitions and tactical coordination helpers.
// Provides role management, group status helpers, and reflex rule
// generation for coordinated group play.

const ROLES = {
  tank:   { priority: 'aggro',  healSelf: true, healOthers: false, description: 'Draw aggro, absorb damage' },
  healer: { priority: 'heals',  healSelf: true, healOthers: true,  description: 'Keep party alive' },
  dps:    { priority: 'damage', healSelf: true, healOthers: false, description: 'Deal maximum damage' },
  scout:  { priority: 'recon',  healSelf: true, healOthers: false, description: 'Explore ahead, report threats' },
};

class TacticsEngine {
  constructor(options = {}) {
    this.worldModel = options.worldModel;
    this.sharedState = options.sharedState;
    this.reflexEngine = options.reflexEngine;
    this.serverProfile = options.serverProfile;
    this.log = options.log || ((type, msg) => console.log(`[Tactics:${type}] ${msg}`));

    this._role = null;
    this._currentPlan = null;
  }

  // --- Role management ---

  setRole(role) {
    if (!ROLES[role]) {
      this.log('WARN', `Unknown role: ${role}. Valid: ${Object.keys(ROLES).join(', ')}`);
      return false;
    }
    this._role = role;
    this.log('ROLE', `Role set to: ${role} — ${ROLES[role].description}`);
    return true;
  }

  getRole() {
    return this._role;
  }

  getRoleInfo() {
    return this._role ? { role: this._role, ...ROLES[this._role] } : null;
  }

  // --- Group status ---

  getGroupStatus() {
    if (!this.sharedState) return { agents: [], plan: null };
    const states = this.sharedState.readAllStates();
    const agents = [];
    for (const [profile, state] of states) {
      agents.push({
        profile,
        name: state.name,
        role: state.role,
        class: state.class,
        hp: state.hp,
        maxHp: state.maxHp,
        mana: state.mana,
        maxMana: state.maxMana,
        inCombat: state.inCombat,
        target: state.target,
        location: state.location,
        stale: state._stale,
        ageMs: state._ageMs,
      });
    }
    return {
      agents,
      plan: this.sharedState.readPlan(),
    };
  }

  isGroupReady(hpThreshold = 0.5) {
    const status = this.getGroupStatus();
    return status.agents.every(a => {
      if (a.stale) return false;
      if (!a.maxHp || a.maxHp === 0) return true;
      return (a.hp / a.maxHp) >= hpThreshold;
    });
  }

  // --- Tactical plan ---

  setPlan(plan) {
    this._currentPlan = plan;
    if (this.sharedState) {
      this.sharedState.publishPlan(plan);
    }

    // If this agent has reflex overrides in the plan, apply them
    const myProfile = this.sharedState ? this.sharedState.profileKey : null;
    if (plan.reflexOverrides && myProfile && plan.reflexOverrides[myProfile]) {
      const rules = plan.reflexOverrides[myProfile];
      // Add TTL to plan rules so they auto-expire
      const rulesWithTTL = rules.map(r => ({
        ...r,
        ttl: r.ttl || plan.ttl || 300000, // default 5 min
        _createdAt: Date.now(),
      }));
      // Merge with existing rules (plan rules get higher priority)
      for (const rule of rulesWithTTL) {
        this.reflexEngine.addRule(rule);
      }
      this.log('PLAN', `Applied ${rulesWithTTL.length} reflex overrides from plan`);
    }

    this.log('PLAN', `Plan set: ${plan.encounter || 'unnamed'} (leader: ${plan.leader || 'none'})`);
    return true;
  }

  clearPlan() {
    this._currentPlan = null;
    if (this.sharedState) {
      this.sharedState.clearPlan();
    }
  }

  getPlan() {
    if (this._currentPlan) return this._currentPlan;
    if (this.sharedState) return this.sharedState.readPlan();
    return null;
  }

  // --- Reflex rule generators for roles ---

  generateHealerReflexes(tankName, healCommand = "cast 'cure serious'") {
    return [
      {
        id: 'group-heal-tank',
        priority: 1,
        conditions: [
          { type: 'groupMemberHp', name: tankName, op: '<=', value: 0.40 },
        ],
        action: { command: `${healCommand} ${tankName}` },
        cooldown: 3000,
        description: `Heal ${tankName} when below 40% HP`,
      },
      {
        id: 'group-heal-any',
        priority: 2,
        conditions: [
          { type: 'groupMemberHp', op: '<=', value: 0.30 },
        ],
        action: { command: healCommand },
        cooldown: 4000,
        description: 'Heal any party member below 30% HP',
      },
    ];
  }

  generateDPSReflexes(leaderName) {
    return [
      {
        id: 'assist-leader',
        priority: 3,
        conditions: [
          { type: 'inCombat' },
        ],
        action: { command: `assist ${leaderName}` },
        cooldown: 10000,
        description: `Assist ${leaderName}'s target`,
      },
    ];
  }

  generateTankReflexes() {
    return [
      {
        id: 'tank-rescue',
        priority: 1,
        conditions: [
          { type: 'groupMemberHp', op: '<=', value: 0.25 },
          { type: 'inCombat' },
        ],
        action: { command: 'rescue' },
        cooldown: 8000,
        description: 'Rescue low-HP party member',
      },
    ];
  }
}

module.exports = { TacticsEngine, ROLES };
