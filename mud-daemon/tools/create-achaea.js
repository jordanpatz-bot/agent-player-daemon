#!/usr/bin/env node
// create-achaea.js — Interactive character creation for Achaea MUD.
// Usage: node create-achaea.js <name> <password>

const net = require('net');
const fs = require('fs');

const name = process.argv[2];
const pass = process.argv[3];

if (!name || !pass) {
  console.error('Usage: node create-achaea.js <name> <password>');
  process.exit(1);
}

console.error(`\n=== Creating ${name} on Achaea ===\n`);

const socket = net.createConnection({ host: 'achaea.com', port: 23 });
socket.setEncoding('utf8');

let buffer = '';
let phase = 'wait-menu';
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
  buffer = '';
}

socket.on('data', (raw) => {
  const data = clean(raw);
  buffer += data;
  outputLog += data;
  process.stdout.write(data);

  const lower = buffer.toLowerCase();

  // Menu — select "2. Create a new character"
  if (phase === 'wait-menu' && lower.includes('enter an option')) {
    phase = 'sent-option';
    setTimeout(() => send('2', 'create option'), 500);
    return;
  }

  // Name prompt
  if (phase === 'sent-option' && lower.includes('what is the name')) {
    phase = 'sent-name';
    setTimeout(() => send(name, 'name'), 500);
    return;
  }

  // Password prompt
  if (phase === 'sent-name' && lower.includes('enter a new password')) {
    phase = 'sent-pass';
    setTimeout(() => send(pass, 'password'), 500);
    return;
  }

  // Confirm password
  if (phase === 'sent-pass' && (lower.includes('confirm') || lower.includes('again') || lower.includes('retype') || lower.includes('re-enter'))) {
    phase = 'confirm-pass';
    setTimeout(() => send(pass, 'confirm password'), 500);
    return;
  }

  // Email — skip
  if (lower.includes('email') && lower.includes('enter') && !lower.includes('password')) {
    setTimeout(() => send('', 'skip email'), 500);
    buffer = '';
    return;
  }

  // Yes/No prompts during creation — default yes
  if (/\[yes\/no\]|\[y\/n\]/i.test(lower) && phase !== 'wait-menu') {
    setTimeout(() => send('yes', 'yes/no prompt'), 500);
    buffer = '';
    return;
  }

  // Race selection — Achaea uses "SELECT <racename>" or just the name at Race> prompt
  if (lower.includes('race>') && !lower.includes('invalid')) {
    setTimeout(() => send('SELECT Human', 'race: Human'), 1000);
    buffer = '';
    return;
  }

  // Gender/sex selection (Achaea uses numbers: 1=Male, 2=Female)
  if (lower.includes('what sex will you be')) {
    setTimeout(() => send('1', 'gender: 1 (male)'), 500);
    buffer = '';
    return;
  }

  // City selection — pick no city / none
  if (lower.includes('choose a city') || lower.includes('which city')) {
    setTimeout(() => send('none', 'city: none'), 1000);
    buffer = '';
    return;
  }

  // Class selection — Achaea uses "SELECT <classname>"
  if ((lower.includes('class>') || lower.includes('select a class') || lower.includes('what class')) && !lower.includes('invalid')) {
    phase = 'class-select';
    setTimeout(() => send('SELECT Monk', 'class: Monk'), 1000);
    buffer = '';
    return;
  }

  // Press enter/continue prompts
  if (lower.includes('press enter') || lower.includes('press return') || lower.includes('enter to continue')) {
    setTimeout(() => send('', 'enter'), 500);
    buffer = '';
    return;
  }

  // Numbered menu choices — pick 1 as default (but not for race/class which use SELECT)
  if (/your choice/i.test(lower) && /\d\)/i.test(lower) && !lower.includes('race>') && !lower.includes('class>')) {
    setTimeout(() => send('1', 'menu: 1'), 1000);
    buffer = '';
    return;
  }

  // Detect in-game (Achaea prompt format: XXXh, XXXm, ...)
  if (/\d+h, \d+m/.test(data)) {
    console.error(`\n[DONE] ${name} created and in-game!`);
    setTimeout(() => {
      send('QUIT YES', 'quit');
      setTimeout(() => { socket.end(); process.exit(0); }, 3000);
    }, 3000);
  }
});

socket.on('error', (err) => console.error(`[ERROR] ${err.message}`));

socket.on('close', () => {
  console.error('[CLOSED]');
  const logDir = `${__dirname}/data`;
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(`${logDir}/creation-log-achaea-${name.toLowerCase()}.txt`, outputLog);
  process.exit(0);
});

setTimeout(() => {
  console.error(`[TIMEOUT] ${name} creation took too long.`);
  const logDir = `${__dirname}/data`;
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(`${logDir}/creation-log-achaea-${name.toLowerCase()}.txt`, outputLog);
  socket.end();
  process.exit(1);
}, 120000);
