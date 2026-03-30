#!/usr/bin/env node
// ipc-send.js — Send commands to a running MUD daemon via file IPC.
// Usage: node ipc-send.js <profile> <cmd1> [cmd2] [cmd3] ...
// Or with wait-for: node ipc-send.js <profile> "look" "wait:is slain:kill rat"
//   wait syntax: "wait:<pattern>:<send-after>" or "wait:<pattern>"

const fs = require('fs');
const path = require('path');

const profile = process.argv[2];
const rawCmds = process.argv.slice(3);

if (!profile || rawCmds.length === 0) {
  console.error('Usage: node ipc-send.js <profile> <cmd1> [cmd2] ...');
  console.error('  Wait syntax: "wait:<pattern>:<send-after>"');
  process.exit(1);
}

const ipcDir = path.join(__dirname, 'data', profile, 'ipc');
const commandsDir = path.join(ipcDir, 'commands');
const resultsDir = path.join(ipcDir, 'results');

// Parse commands
const commands = rawCmds.map(c => {
  if (c.startsWith('wait:')) {
    const parts = c.split(':');
    const obj = { wait: parts[1], timeout: 15000 };
    if (parts[2]) obj.send = parts[2];
    return obj;
  }
  return c;
});

// Generate command ID
const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Write command file (atomic: write tmp, rename)
const cmdFile = path.join(commandsDir, `${id}.json`);
const tmpFile = cmdFile + '.tmp';
const payload = JSON.stringify({ id, commands }, null, 2);
fs.writeFileSync(tmpFile, payload);
fs.renameSync(tmpFile, cmdFile);
console.log(`Sent ${commands.length} commands as ${id}`);

// Poll for result
const resultFile = path.join(resultsDir, `${id}.json`);
const deadline = Date.now() + 120000; // 2 min max

const poll = setInterval(() => {
  if (fs.existsSync(resultFile)) {
    clearInterval(poll);
    try {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      console.log('\n=== RESULT ===');
      console.log('Status:', result.status);
      if (result.error) console.log('Error:', result.error);
      if (result.state) console.log('State:', result.state);
      if (result.blackboard) {
        const bb = result.blackboard;
        console.log('Blackboard:', JSON.stringify(bb.data || bb, null, 2));
      }
      if (result.output) {
        console.log('\n--- Output ---');
        // Strip ANSI/telnet control chars for readability
        const clean = result.output.replace(/[\x00-\x09\x0b-\x1f]|\x1b\[[0-9;]*m/g, '').trim();
        console.log(clean);
      }
    } catch (e) {
      console.error('Failed to parse result:', e.message);
    }
    // Cleanup
    try { fs.unlinkSync(resultFile); } catch {}
    process.exit(0);
  }
  if (Date.now() > deadline) {
    clearInterval(poll);
    console.error('Timed out waiting for result');
    process.exit(1);
  }
}, 500);
