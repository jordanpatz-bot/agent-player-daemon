#!/usr/bin/env node
// create-alchemists.js — Create one character on Aardwolf with configurable class/race
// Usage: node create-alchemists.js <name> <password> <class> <subclass> [race]

const net = require('net');
const fs = require('fs');

const name = process.argv[2];
const pass = process.argv[3];
const charClass = process.argv[4] || 'warrior';
const subclass = process.argv[5] || '';
const race = process.argv[6] || 'human';

if (!name || !pass) {
  console.error('Usage: node create-alchemists.js <name> <password> <class> <subclass> [race]');
  process.exit(1);
}

console.error(`\n=== Creating ${name}: ${charClass}/${subclass || 'default'} (${race}) ===\n`);

const socket = net.createConnection({ host: 'aardmud.org', port: 4000 });
socket.setEncoding('utf8');

let buffer = '';
let phase = 'wait-name';
let outputLog = '';

function clean(data) {
  return data
    .replace(/\xff[\xfb-\xfe]./gs, '')
    .replace(/\xff\xf[0-9a-f]/gs, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\r/g, '');
}

function send(text, label) {
  console.error(`[SEND] ${label}: "${text}"`);
  socket.write(text + '\r\n');
}

socket.on('data', (raw) => {
  const data = clean(raw);
  buffer += data;
  outputLog += data;
  process.stdout.write(data);

  const lower = buffer.toLowerCase();

  if (phase === 'wait-name' && lower.includes('what be thy name')) {
    phase = 'sent-name';
    setTimeout(() => send(name, 'name'), 1000);
    buffer = '';
    return;
  }

  if (phase === 'sent-name' && (lower.includes('did i get that right') || lower.includes('create a new character'))) {
    phase = 'confirm-name';
    setTimeout(() => send('y', 'confirm new character'), 500);
    buffer = '';
    return;
  }

  // Name already taken
  if (phase === 'sent-name' && lower.includes('password')) {
    console.error(`[WARN] ${name} may already exist — got password prompt`);
    phase = 'sent-pass';
    setTimeout(() => send(pass, 'password'), 500);
    buffer = '';
    return;
  }

  if ((phase === 'confirm-name' || phase === 'sent-name') && (lower.includes('give me a password') || lower.includes('choose a password'))) {
    phase = 'sent-pass';
    setTimeout(() => send(pass, 'password'), 500);
    buffer = '';
    return;
  }

  if (phase === 'sent-pass' && (lower.includes('retype') || lower.includes('again') || lower.includes('verify') || lower.includes('re-enter') || lower.includes('confirm'))) {
    phase = 'confirm-pass';
    setTimeout(() => send(pass, 'confirm password'), 500);
    buffer = '';
    return;
  }

  // Press enter prompts
  if (lower.includes('[press enter') || lower.includes('press return')) {
    setTimeout(() => send('', 'enter'), 500);
    buffer = '';
    return;
  }

  // VI features — no
  if (lower.includes('visually impaired') && lower.includes('[y/n')) {
    phase = 'creating';
    setTimeout(() => send('n', 'VI features: no'), 500);
    buffer = '';
    return;
  }

  // Color — yes
  if (lower.includes('use color') && lower.includes('[y/n')) {
    setTimeout(() => send('y', 'color: yes'), 500);
    buffer = '';
    return;
  }

  // Generic [Y/N] during creation — default N
  if (phase === 'creating' && /\[y\/n/i.test(lower) && !lower.includes('visually') && !lower.includes('use color')) {
    setTimeout(() => send('n', 'generic Y/N: no'), 500);
    buffer = '';
    return;
  }

  if (phase === 'confirm-pass' || phase === 'creating') {
    phase = 'creating';

    // Class selection
    if (lower.includes('choose your primary class') || lower.includes('choose a class')) {
      setTimeout(() => send(charClass, `class: ${charClass}`), 1000);
      buffer = '';
      return;
    }

    // Race selection
    if (lower.includes('choose your race') || lower.includes('choose a race') || lower.includes('select a race')) {
      setTimeout(() => send(race, `race: ${race}`), 1000);
      buffer = '';
      return;
    }

    // Gender
    if (lower.includes('choose your gender') || lower.includes('male/female')) {
      setTimeout(() => send('androgyne', 'gender: androgyne'), 1000);
      buffer = '';
      return;
    }

    // Subclass
    if (lower.includes('choose your subclass') || lower.includes('subclass')) {
      const pick = subclass || '1'; // first option as fallback
      setTimeout(() => send(pick, `subclass: ${pick}`), 1000);
      buffer = '';
      return;
    }

    // Experience level
    if (lower.includes('experience level') || lower.includes('experience with muds')) {
      setTimeout(() => send('1', 'experience: newbie'), 1000);
      buffer = '';
      return;
    }

    // List/back prompts — pick first
    if (lower.includes("'?' to list") || lower.includes('to go back')) {
      setTimeout(() => send('1', 'generic pick: 1'), 1000);
      buffer = '';
      return;
    }

    // Numbered menu
    if (/\[\d+\].*\[\d+\]/s.test(buffer) && lower.includes('choice')) {
      setTimeout(() => send('1', 'menu choice: 1'), 500);
      buffer = '';
      return;
    }
  }

  // In-game detection — done!
  if (/\d+hp\s+\d+.*mn\s+\d+.*mv/i.test(data)) {
    console.error(`\n[DONE] ${name} created and in-game!`);
    setTimeout(() => {
      send('quit', 'quit');
      setTimeout(() => {
        send('y', 'confirm quit');
        setTimeout(() => {
          socket.end();
          process.exit(0);
        }, 2000);
      }, 1000);
    }, 3000);
  }
});

socket.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
});

socket.on('close', () => {
  console.error('[CLOSED]');
  const logDir = `${__dirname}/data`;
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(`${logDir}/creation-log-${name.toLowerCase()}.txt`, outputLog);
  process.exit(0);
});

// Timeout safety
setTimeout(() => {
  console.error(`[TIMEOUT] ${name} creation took too long.`);
  const logDir = `${__dirname}/data`;
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(`${logDir}/creation-log-${name.toLowerCase()}.txt`, outputLog);
  socket.end();
  process.exit(1);
}, 90000);
