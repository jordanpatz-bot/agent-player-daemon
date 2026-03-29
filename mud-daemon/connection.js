'use strict';
// connection.js — TCP socket with reconnect, login FSM, telnet cleaning.
// Emits: 'data' (cleaned text), 'connected', 'loggedIn', 'disconnected', 'error'

const net = require('net');
const EventEmitter = require('events');

const TELNET_RE = /\xff[\xfb-\xfe]./gs;
const TELNET2_RE = /\xff\xf[0-9a-f]/gs;
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const CLEAR_RE = /\x1b\[2J/g;

class MudConnection extends EventEmitter {
  constructor(gameConfig, options = {}) {
    super();
    this.game = gameConfig;
    this.socket = null;
    this.state = 'disconnected'; // disconnected, connecting, login, password, extra-login, playing
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.baseReconnectDelay = options.baseReconnectDelay || 5000;
    this.maxReconnectDelay = options.maxReconnectDelay || 300000; // 5 min cap
    this.reconnectTimer = null;
    this.debounceTimer = null;
    this.pending = '';
    this.lockFile = options.lockFile || null;

    // Graceful shutdown
    this._shutdownRequested = false;
  }

  connect() {
    if (this.state !== 'disconnected') return;
    if (this._shutdownRequested) return;

    this.state = 'connecting';
    this.emit('stateChange', 'connecting');

    this.socket = net.createConnection({
      host: this.game.host,
      port: this.game.port,
    });

    this.socket.setEncoding('utf8');

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.state = 'connected';
      this.emit('connected');
      this.emit('stateChange', 'connected');
    });

    this.socket.on('data', (raw) => {
      const cleaned = this._clean(raw);
      this.pending += cleaned;

      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        const data = this.pending;
        this.pending = '';
        this._processLogin(data);
        this.emit('data', data);
      }, this.game.debounceMs || 800);
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      const wasPlaying = this.state === 'playing';
      this.state = 'disconnected';
      this.emit('disconnected', { wasPlaying });
      this.emit('stateChange', 'disconnected');

      if (!this._shutdownRequested) {
        this._scheduleReconnect();
      }
    });
  }

  send(text) {
    if (!this.socket || this.state === 'disconnected') {
      return false;
    }
    try {
      return this.socket.write(text + '\r\n');
    } catch (e) {
      this.emit('error', e);
      return false;
    }
  }

  disconnect() {
    this._shutdownRequested = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && this.state === 'playing') {
      // Graceful quit
      for (const cmd of this.game.quitCommands || ['quit']) {
        this.send(cmd);
      }
      // Force close after 5s if server doesn't disconnect us
      setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
          this.socket = null;
        }
      }, 5000);
    } else if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  isPlaying() {
    return this.state === 'playing';
  }

  getState() {
    return this.state;
  }

  // --- Internal ---

  _clean(data) {
    return data
      .replace(TELNET_RE, '')
      .replace(TELNET2_RE, '')
      .replace(ANSI_RE, '')
      .replace(CLEAR_RE, '')
      .replace(/\r/g, '');
  }

  _processLogin(data) {
    const lower = data.toLowerCase();

    if (this.state === 'connected' && lower.includes(this.game.loginDetect)) {
      this.state = 'login';
      this.emit('stateChange', 'login');
      setTimeout(() => this.send(this.game.name), 500);
      return;
    }

    if (this.state === 'login' && lower.includes(this.game.passwordDetect)) {
      this.state = 'password';
      this.emit('stateChange', 'password');
      setTimeout(() => this.send(this.game.pass), 500);
      return;
    }

    // Extra login steps (e.g. Discworld nationality selection)
    if (this.game.extraLogin && this.state !== 'playing') {
      for (const step of this.game.extraLogin) {
        if (new RegExp(step.detect, 'i').test(lower)) {
          this.state = 'extra-login';
          setTimeout(() => this.send(step.send), 1000);
          return;
        }
      }
    }

    // Press enter prompts during login
    if (this.state !== 'playing') {
      if (this.game.enterPrompts && this.game.enterPrompts.test(lower)) {
        setTimeout(() => this.send(''), 500);
        return;
      }
    }

    // Detect in-game
    if (this.state !== 'playing') {
      if (this.game.inGameDetect.test(data)) {
        this.state = 'playing';
        this.emit('loggedIn');
        this.emit('stateChange', 'playing');
      }
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnectFailed', {
        attempts: this.reconnectAttempts,
        message: `Gave up after ${this.reconnectAttempts} attempts`,
      });
      return;
    }

    // Exponential backoff with jitter
    const base = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    const jitter = Math.floor(Math.random() * base * 0.3);
    const delay = base + jitter;

    this.reconnectAttempts++;
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.maxReconnectAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

module.exports = { MudConnection };
