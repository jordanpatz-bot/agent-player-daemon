'use strict';
// atomic-write.js — Atomic file write: write to .tmp, rename into place.
// Prevents partial reads when another process is watching the file.

const fs = require('fs');

function atomicWriteJSON(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

module.exports = { atomicWrite, atomicWriteJSON };
