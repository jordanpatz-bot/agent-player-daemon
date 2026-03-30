#!/usr/bin/env node
// Rhizo's Aardwolf Exploration Script
// Connect as Rhizome, look around, take notes, disconnect cleanly

const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: 'aardmud.org',
  port: 4000,
  name: 'Rhizome',
  pass: 'spore2rhizome',
  timeout: 60000,
  commandDelay: 2000,
  logDir: path.join(__dirname, 'data', 'rhizome', 'sessions'),
};

const state = {
  phase: 'connecting',
  buffer: '',
  commandQueue: [],
  commandIndex: 0,
  log: [],
  startTime: Date.now(),
};

function timestamp() { return new Date().toISOString().substring(11, 19); }
function log(type, msg) {
  const entry = `[${timestamp()}] [${type}] ${msg}`;
  state.log.push(entry);
  console.log(entry);
}

function clean(data) {
  return data
    .replace(/\xff[\xfb-\xfe]./gs, '')
    .replace(/\xff\xf[0-9a-f]/gs, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[2J/g, '')
    .replace(/\r/g, '');
}

function send(socket, text, label) {
  log('SEND', `${label || text}: "${text}"`);
  socket.write(text + '\r\n');
}

function saveSession() {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const logFile = path.join(CONFIG.logDir, `explore-${ts}.txt`);
  fs.writeFileSync(logFile, state.buffer);
  const structFile = path.join(CONFIG.logDir, `explore-${ts}.log`);
  fs.writeFileSync(structFile, state.log.join('\n'));
  log('INFO', `Session saved to ${logFile}`);
}

// Exploration commands — look around, check status, explore nearby
const EXPLORE_COMMANDS = [
  '', // press return at welcome
  'score',
  'look',
  'who',
  'channels',
  'inventory',
  'equipment',
  // Try going north into the academy
  'north',
  'look',
  // Check what lessons are available
  'list',
  'help academy',
  // Go back and explore surroundings
  'south',
  'look',
  // Check map
  'areas 1 10',
  // Recall and look around Aylor
  'recall',
  'look',
  // Check quest availability
  'quest request',
  // Final status
  'score',
  'quit',
];

state.commandQueue = EXPLORE_COMMANDS;

let debounceTimer = null;

const socket = net.createConnection({ host: CONFIG.host, port: CONFIG.port }, () => {
  log('CONN', 'Connected to Aardwolf');
});

socket.setEncoding('utf8');

socket.on('data', (raw) => {
  const data = clean(raw);
  state.buffer += data;

  const lower = data.toLowerCase();

  // Login flow
  if (state.phase === 'connecting' && lower.includes('what be thy name')) {
    state.phase = 'login';
    setTimeout(() => send(socket, CONFIG.name, 'name'), 500);
  }
  else if (state.phase === 'login' && lower.includes('password:')) {
    state.phase = 'password';
    setTimeout(() => send(socket, CONFIG.pass, 'password'), 500);
  }
  else if (state.phase === 'password' && (lower.includes('welcome to aardwolf') || lower.includes('press return'))) {
    state.phase = 'playing';
    log('INFO', 'Login successful — starting exploration');
    // Start commands after a brief delay
    setTimeout(() => runNextCommand(), 2000);
  }
  // Handle "already playing" reconnection
  else if (lower.includes('reconnecting to game')) {
    if (state.phase !== 'playing') {
      state.phase = 'playing';
      log('INFO', 'Reconnected — starting exploration');
      setTimeout(() => runNextCommand(), 2000);
    }
  }
});

function runNextCommand() {
  if (state.commandIndex >= state.commandQueue.length) {
    log('INFO', 'Exploration complete');
    saveSession();
    socket.end();
    setTimeout(() => process.exit(0), 2000);
    return;
  }

  const cmd = state.commandQueue[state.commandIndex];
  state.commandIndex++;
  send(socket, cmd, `cmd ${state.commandIndex}`);
  setTimeout(() => runNextCommand(), CONFIG.commandDelay);
}

socket.on('error', (err) => {
  log('ERROR', err.message);
  saveSession();
  process.exit(1);
});

socket.on('close', () => {
  log('CONN', 'Disconnected');
  saveSession();
});

// Safety timeout
setTimeout(() => {
  log('WARN', 'Session timeout — disconnecting');
  send(socket, 'quit', 'timeout-quit');
  saveSession();
  setTimeout(() => {
    socket.end();
    process.exit(0);
  }, 3000);
}, CONFIG.timeout);
