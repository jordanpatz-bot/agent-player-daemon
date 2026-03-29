'use strict';
// output-buffer.js — Ring buffer for MUD output. Prevents unbounded growth.
// Keeps the last N characters, writes periodic snapshots to disk.

const fs = require('fs');
const path = require('path');

class OutputBuffer {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100000; // 100KB default
    this.buffer = '';
    this.filePath = options.filePath || path.join(process.cwd(), 'output-buffer.txt');
    this.snapshotIntervalMs = options.snapshotIntervalMs || 30000; // 30s
    this._snapshotTimer = null;
  }

  append(text) {
    this.buffer += text;
    if (this.buffer.length > this.maxSize) {
      // Keep the last maxSize chars, cut at a newline boundary if possible
      const cutPoint = this.buffer.length - this.maxSize;
      const newlineAfterCut = this.buffer.indexOf('\n', cutPoint);
      this.buffer = this.buffer.slice(newlineAfterCut >= 0 ? newlineAfterCut + 1 : cutPoint);
    }
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
    try {
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, this.buffer);
      fs.renameSync(tmp, this.filePath);
    } catch {
      // Non-fatal
    }
  }
}

module.exports = { OutputBuffer };
