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
    // Optional raw data preprocessor — receives Buffer, returns Buffer.
    // Used by daemon.js to pipe raw bytes through GMCP handler before text cleaning.
    this._rawPreprocessor = options.rawPreprocessor || null;

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

    // Do NOT set encoding — we need raw Buffers for GMCP binary processing.
    // The rawPreprocessor (if provided) handles GMCP subnegotiation extraction
    // before we convert to string for text cleaning.

    this.socket.on('connect', () => {
      // Don't reset reconnectAttempts here — only reset after stable play
      // (see _processLogin 'playing' transition)
      this.state = 'connected';
      this.emit('connected');
      this.emit('stateChange', 'connected');
    });

    this.socket.on('data', (rawBuf) => {
      // rawBuf is a Buffer (no encoding set on socket).
      // 1. Run raw bytes through preprocessor (GMCP extraction) if wired
      let textBuf = rawBuf;
      if (this._rawPreprocessor) {
        textBuf = this._rawPreprocessor(rawBuf);
      }
      // 2. Convert to string using latin1 (preserves byte values 0x00-0xFF)
      //    then apply regex-based telnet/ANSI cleaning
      const cleaned = this._clean(textBuf.toString('latin1'));
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
      // Cancel pending debounce to prevent state transition on dead socket
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        this.pending = '';
      }
      // Cancel stable play timer
      if (this._stableTimer) {
        clearTimeout(this._stableTimer);
        this._stableTimer = null;
      }

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

    // Detect in-game — only if socket is still alive
    if (this.state !== 'playing' && this.state !== 'disconnected') {
      if (this.game.inGameDetect.test(data)) {
        this.state = 'playing';
        this.emit('loggedIn');
        this.emit('stateChange', 'playing');
        // Reset reconnect counter only after reaching stable play
        // (30s grace period set in _stablePlayTimer)
        this._startStableTimer();
      }
    }
  }

  _startStableTimer() {
    // Only reset reconnect counter after staying connected for 30s
    // This prevents the counter from resetting on flash connections
    if (this._stableTimer) clearTimeout(this._stableTimer);
    this._stableTimer = setTimeout(() => {
      if (this.state === 'playing') {
        this.reconnectAttempts = 0;
      }
      this._stableTimer = null;
    }, 30000);
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
