'use strict';
// state-machine.js — Game state machine. Phase 2 skeleton.
// States: idle, hunting, combat, looting, socializing, fleeing, disconnected
// Each state defines: enter/exit hooks, allowed transitions, event handlers.

const EventEmitter = require('events');

const STATES = {
  disconnected: {
    transitions: ['idle'],
    onEnter: (ctx) => {
      ctx.log('STATE', 'Disconnected from game');
    },
  },

  idle: {
    transitions: ['hunting', 'socializing', 'disconnected'],
    onEnter: (ctx) => {
      ctx.log('STATE', 'Idle — awaiting commands or goals');
    },
    onEvent: (event, ctx) => {
      if (event.type === 'player_entered') return null; // stay idle, social bridge handles it
      if (event.type === 'tell_received') return null;  // social bridge handles it
      return null;
    },
  },

  hunting: {
    transitions: ['combat', 'idle', 'socializing', 'fleeing', 'disconnected'],
    onEnter: (ctx) => {
      ctx.blackboard.set('momentum', { activity: 'hunt', since: Date.now(), strength: 0.6 });
      ctx.log('STATE', 'Hunting — executing kill circuit');
    },
    onEvent: (event, ctx) => {
      if (event.type === 'combat_start') return 'combat';
      if (event.type === 'tell_received') return null; // queued by social bridge
      return null;
    },
  },

  combat: {
    transitions: ['looting', 'fleeing', 'hunting', 'disconnected'],
    onEnter: (ctx) => {
      ctx.blackboard.set('inCombat', true);
      ctx.log('STATE', `Combat — target: ${ctx.blackboard.get('currentTarget') || 'unknown'}`);
    },
    onExit: (ctx) => {
      ctx.blackboard.set('inCombat', false);
    },
    onEvent: (event, ctx) => {
      if (event.type === 'mob_killed') return 'looting';
      if (event.type === 'flee_triggered') return 'fleeing';
      // HP check
      const hp = ctx.blackboard.get('hp');
      const maxHp = ctx.blackboard.get('maxHp');
      if (hp && maxHp && hp / maxHp < 0.3) return 'fleeing';
      return null;
    },
  },

  looting: {
    transitions: ['hunting', 'idle', 'socializing', 'disconnected'],
    onEnter: (ctx) => {
      ctx.log('STATE', 'Looting — getting corpse drops');
    },
    onEvent: (event, ctx) => {
      // After loot commands execute, return to hunting or idle
      if (event.type === 'loot_complete') {
        return ctx.blackboard.get('sessionGoal') === 'hunt' ? 'hunting' : 'idle';
      }
      return null;
    },
  },

  fleeing: {
    transitions: ['idle', 'hunting', 'disconnected'],
    onEnter: (ctx) => {
      ctx.log('STATE', 'Fleeing — HP critical or danger detected');
    },
    onEvent: (event, ctx) => {
      if (event.type === 'flee_success') return 'idle';
      return null;
    },
  },

  socializing: {
    transitions: ['idle', 'hunting', 'disconnected'],
    onEnter: (ctx) => {
      ctx.blackboard.set('momentum', { activity: 'social', since: Date.now(), strength: 0.4 });
      ctx.log('STATE', 'Socializing — handling player interaction');
    },
    onEvent: (event, ctx) => {
      // Return to previous activity after social cooldown
      if (event.type === 'social_complete') {
        return ctx.blackboard.get('sessionGoal') === 'hunt' ? 'hunting' : 'idle';
      }
      return null;
    },
  },
};

class GameStateMachine extends EventEmitter {
  constructor(ctx) {
    super();
    this.ctx = ctx; // { blackboard, connection, log }
    this.currentState = 'disconnected';
    this.stateHistory = []; // last 20 transitions
  }

  transition(newState) {
    if (!STATES[newState]) {
      this.ctx.log('STATE', `Invalid state: ${newState}`);
      return false;
    }

    const current = STATES[this.currentState];
    if (current && current.transitions && !current.transitions.includes(newState)) {
      this.ctx.log('STATE', `Invalid transition: ${this.currentState} → ${newState}`);
      return false;
    }

    const oldState = this.currentState;

    // Exit hook
    if (current && current.onExit) {
      current.onExit(this.ctx);
    }

    this.currentState = newState;

    // Track history
    this.stateHistory.push({
      from: oldState,
      to: newState,
      at: Date.now(),
    });
    if (this.stateHistory.length > 20) this.stateHistory.shift();

    // Enter hook
    const next = STATES[newState];
    if (next && next.onEnter) {
      next.onEnter(this.ctx);
    }

    this.emit('transition', { from: oldState, to: newState });
    return true;
  }

  // Process a game event through the current state
  processEvent(event) {
    const state = STATES[this.currentState];
    if (!state || !state.onEvent) return;

    const nextState = state.onEvent(event, this.ctx);
    if (nextState && nextState !== this.currentState) {
      this.transition(nextState);
    }
  }

  getState() {
    return this.currentState;
  }

  getHistory() {
    return [...this.stateHistory];
  }
}

module.exports = { GameStateMachine, STATES };
