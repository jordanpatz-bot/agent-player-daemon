'use strict';
// output-buffer.js — Ring buffer for MUD output. Prevents unbounded growth.
// Keeps the last N characters, writes periodic snapshots to disk.

const fs = require('fs');
const { atomicWrite } = require('./atomic-write');
const path = require('path');

class OutputBuffer {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100000; // 100KB default
    this.buffer = '';
    this.filePath = options.filePath || path.join(process.cwd(), 'output-buffer.txt');
    this.snapshotIntervalMs = options.snapshotIntervalMs || 30000; // 30s
    this._snapshotTimer = null;
    this._totalAppended = 0; // monotonic counter — total chars ever appended
    this._trimmed = 0;       // total chars trimmed from front
  }

  append(text) {
    this._totalAppended += text.length;
    this.buffer += text;
    if (this.buffer.length > this.maxSize) {
      // Keep the last maxSize chars, cut at a newline boundary if possible
      const cutPoint = this.buffer.length - this.maxSize;
      const newlineAfterCut = this.buffer.indexOf('\n', cutPoint);
      const actualCut = newlineAfterCut >= 0 ? newlineAfterCut + 1 : cutPoint;
      this._trimmed += actualCut;
      this.buffer = this.buffer.slice(actualCut);
    }
  }

  // Get a stable cursor position that survives ring buffer wrapping.
  // Use with getOutputSince(cursor) to reliably capture new output.
  getCursor() {
    return this._totalAppended;
  }

  // Get all output appended since the given cursor.
  // Returns '' if cursor is too old (data already trimmed).
  getOutputSince(cursor) {
    const available = this._totalAppended - cursor;
    if (available <= 0) return '';
    if (available > this.buffer.length) {
      // Some output was lost to ring buffer trimming — return what we have
      return this.buffer;
    }
    return this.buffer.slice(this.buffer.length - available);
  }

  // Get recent output (last N chars)
  getRecent(chars = 3000) {
    return this.buffer.slice(-chars);
  }

  // Get full buffer
  getAll() {
    return this.buffer;
  }

  // Search buffer for a pattern
  search(pattern) {
    const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    return re.test(this.buffer);
  }

  // Start periodic disk snapshots
  startSnapshots() {
    if (this._snapshotTimer) return;
    this._snapshotTimer = setInterval(() => {
      this._writeSnapshot();
    }, this.snapshotIntervalMs);
  }

  stopSnapshots() {
    if (this._snapshotTimer) {
      clearInterval(this._snapshotTimer);
      this._snapshotTimer = null;
    }
    // Final snapshot
    this._writeSnapshot();
  }

  _writeSnapshot() {
    try { atomicWrite(this.filePath, this.buffer); }
    catch { /* Non-fatal */ }
  }
}

module.exports = { OutputBuffer };
