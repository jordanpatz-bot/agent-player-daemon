#!/usr/bin/env node
'use strict';
// raw-session.js — Lightweight raw telnet session with file-based IPC.
// For interactive use by LLM agents during character creation or exploration
// on games where the daemon's login FSM doesn't apply.
//
// Usage: node raw-session.js <host> <port> <session-name>
//
// IPC:
//   Write commands to: data/<session>/raw-ipc/command.txt (one command per line)
//   Read output from:  data/<session>/raw-ipc/output.txt (latest chunk)
//   Read full log:     data/<session>/raw-ipc/log.txt
//   Status:            data/<session>/raw-ipc/status.json

const net = require('net');
const fs = require('fs');
const path = require('path');

const host = process.argv[2] || 'bat.org';
const port = parseInt(process.argv[3]) || 23;
const sessionName = process.argv[4] || 'raw-session';

const dataDir = path.join(__dirname, 'data', sessionName, 'raw-ipc');
fs.mkdirSync(dataDir, { recursive: true });

const cmdFile = path.join(dataDir, 'command.txt');
const outFile = path.join(dataDir, 'output.txt');
const logFile = path.join(dataDir, 'log.txt');
const statusFile = path.join(dataDir, 'status.json');

// Clean startup
try { fs.unlinkSync(cmdFile); } catch {}
fs.writeFileSync(outFile, '');
fs.writeFileSync(logFile, '');
fs.writeFileSync(statusFile, JSON.stringify({ state: 'connecting', host, port }));

function clean(d) {
  return d
    .replace(/\xff[\xfb-\xfe]./gs, '')
    .replace(/\xff\xf[0-9a-f]/gs, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\r/g, '');
}

const socket = net.createConnection({ host, port });
socket.setEncoding('utf8');

let connected = false;

socket.on('connect', () => {
  connected = true;
  console.error(`[RAW] Connected to ${host}:${port}`);
  fs.writeFileSync(statusFile, JSON.stringify({ state: 'connected', host, port, pid: process.pid }));
});

socket.on('data', (raw) => {
  const cleaned = clean(raw);
  if (!cleaned.trim()) return;

  // Write to output file (latest chunk — overwritten each time)
  fs.writeFileSync(outFile, cleaned);

  // Append to full log
  fs.appendFileSync(logFile, cleaned);
});

socket.on('error', (err) => {
  console.error(`[RAW] Error: ${err.message}`);
  fs.writeFileSync(statusFile, JSON.stringify({ state: 'error', error: err.message }));
});

socket.on('close', () => {
  console.error('[RAW] Disconnected');
  fs.writeFileSync(statusFile, JSON.stringify({ state: 'disconnected' }));
  process.exit(0);
});

// Watch for command file
fs.watchFile(cmdFile, { interval: 300 }, () => {
  try {
    const cmd = fs.readFileSync(cmdFile, 'utf8').trim();
    if (!cmd && cmd !== '') return;
    fs.unlinkSync(cmdFile); // consume

    // Send each line as a separate command
    const lines = cmd.split('\n');
    for (const line of lines) {
      console.error(`[RAW] Send: "${line}"`);
      socket.write(line + '\r\n');
    }
  } catch {}
});

// Also poll for command file (backup for systems where watchFile doesn't work)
setInterval(() => {
  try {
    if (fs.existsSync(cmdFile)) {
      const cmd = fs.readFileSync(cmdFile, 'utf8').trim();
      fs.unlinkSync(cmdFile);
      const lines = cmd.split('\n');
      for (const line of lines) {
        console.error(`[RAW] Send: "${line}"`);
        socket.write(line + '\r\n');
      }
    }
  } catch {}
}, 500);

// Keepalive
setInterval(() => {
  if (connected) {
    fs.writeFileSync(statusFile, JSON.stringify({
      state: 'connected', host, port, pid: process.pid,
      uptime: process.uptime(),
    }));
  }
}, 10000);

console.error(`[RAW] Session "${sessionName}" — IPC at ${dataDir}`);
console.error(`[RAW] Write commands to: ${cmdFile}`);
console.error(`[RAW] Read output from: ${outFile}`);
