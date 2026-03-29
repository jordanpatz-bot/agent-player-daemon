'use strict';
// state-machine.js — Connection state machine (Phase 1).
// Tracks connection lifecycle only. Behavioral states (hunting, combat, social)
// are deferred to Phase 2 as pluggable modules.
//
// States: disconnected, connecting, login, playing, reconnecting
// Behavior modules will register as event listeners, not state nodes.

const EventEmitter = require('events');

const STATES = {
  disconnected: {
    transitions: ['connecting'],
  },
  connecting: {
    transitions: ['login', 'disconnected', 'reconnecting'],
  },
  login: {
    transitions: ['playing', 'disconnected', 'reconnecting'],
  },
  playing: {
    transitions: ['disconnected', 'reconnecting'],
  },
  reconnecting: {
    transitions: ['connecting', 'disconnected'],
  },
};

class ConnectionStateMachine extends EventEmitter {
  constructor() {
    super();
    this.currentState = 'disconnected';
    this.stateHistory = [];
    this.enteredAt = Date.now();
  }

  transition(newState) {
    if (!STATES[newState]) return false;

    const current = STATES[this.currentState];
    if (!current.transitions.includes(newState)) return false;

    const oldState = this.currentState;
    this.currentState = newState;
    this.enteredAt = Date.now();

    this.stateHistory.push({
      from: oldState,
      to: newState,
      at: Date.now(),
    });
    if (this.stateHistory.length > 20) this.stateHistory.shift();

    this.emit('transition', { from: oldState, to: newState });
    return true;
  }

  getState() { return this.currentState; }
  isPlaying() { return this.currentState === 'playing'; }
  getUptime() { return this.currentState === 'playing' ? Date.now() - this.enteredAt : 0; }
  getHistory() { return [...this.stateHistory]; }
}

module.exports = { ConnectionStateMachine, STATES };
