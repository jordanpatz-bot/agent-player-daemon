#!/usr/bin/env node
// Rhizo's Aardwolf Exploration — v2 with better login handling
// Waits for prompt before sending commands

const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: 'aardmud.org',
  port: 4000,
  name: 'Rhizome',
  pass: 'spore2rhizome',
  timeout: 60000,
  commandDelay: 2500,
  logDir: path.join(__dirname, 'data', 'rhizome', 'sessions'),
};

let phase = 'connecting';
let buffer = '';
let log = [];
let cmdQueue = [];
let cmdIndex = 0;
let promptSeen = false;

function ts() { return new Date().toISOString().substring(11, 19); }
function logMsg(t, m) { const e = `[${ts()}] [${t}] ${m}`; log.push(e); console.log(e); }

function clean(data) {
  return data
    .replace(/\xff[\xfb-\xfe]./gs, '')
    .replace(/\xff\xf[0-9a-f]/gs, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[2J/g, '')
    .replace(/\r/g, '');
}

function send(s, text, label) {
  logMsg('SEND', `${label}: "${text}"`);
  s.write(text + '\r\n');
}

function save() {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
  const t = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  fs.writeFileSync(path.join(CONFIG.logDir, `explore2-${t}.txt`), buffer);
  fs.writeFileSync(path.join(CONFIG.logDir, `explore2-${t}.log`), log.join('\n'));
  logMsg('INFO', `Session saved`);
}

// Commands to run once logged in
cmdQueue = [
  'replay',       // check that tell
  'score',
  'look',
  'areas 1 15',
  'north',        // enter academy
  'look',
  'south',
  'recall',
  'look',
  'quest request',
  'score',
  'quit',
];

const socket = net.createConnection({ host: CONFIG.host, port: CONFIG.port }, () => {
  logMsg('CONN', 'Connected');
});

socket.setEncoding('utf8');

socket.on('data', (raw) => {
  const data = clean(raw);
  buffer += data;

  const lower = data.toLowerCase();

  // Login sequence
  if (phase === 'connecting' && lower.includes('what be thy name')) {
    phase = 'login';
    setTimeout(() => send(socket, CONFIG.name, 'name'), 1000);
    return;
  }
  if (phase === 'login' && lower.includes('password:')) {
    phase = 'password';
    setTimeout(() => send(socket, CONFIG.pass, 'pass'), 1000);
    return;
  }

  // Wait for the game prompt (hp/mn/mv pattern) before starting commands
  if ((phase === 'password' || phase === 'login') && /\d+\/\d+hp/.test(data)) {
    if (!promptSeen) {
      promptSeen = true;
      phase = 'playing';
      logMsg('INFO', 'Game prompt detected — starting exploration in 3s');
      setTimeout(() => runNext(), 3000);
    }
    return;
  }
});

function runNext() {
  if (cmdIndex >= cmdQueue.length) {
    logMsg('INFO', 'Done');
    save();
    socket.end();
    setTimeout(() => process.exit(0), 2000);
    return;
  }
  const cmd = cmdQueue[cmdIndex++];
  send(socket, cmd, `cmd${cmdIndex}`);
  setTimeout(runNext, CONFIG.commandDelay);
}

socket.on('error', (err) => { logMsg('ERR', err.message); save(); process.exit(1); });
socket.on('close', () => { logMsg('CONN', 'Disconnected'); save(); });

setTimeout(() => {
  logMsg('WARN', 'Timeout');
  send(socket, 'quit', 'timeout');
  save();
  setTimeout(() => { socket.end(); process.exit(0); }, 3000);
}, CONFIG.timeout);
