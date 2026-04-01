#!/usr/bin/env node
// create-character.js — Interactive-ish character creation for Aardwolf
// Sends responses to prompts in sequence. Run once, then add to profiles.json.
//
// Usage: node create-character.js <name> <password>

const net = require('net');

const name = process.argv[2] || 'Rhizome';
const pass = process.argv[3] || 'spore2network2';

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

  // Generic [Y/N] during creation — default N unless we know better
  if (phase === 'creating' && /\[y\/n/i.test(lower) && !lower.includes('visually') && !lower.includes('use color')) {
    setTimeout(() => send('n', 'generic Y/N: no'), 500);
    buffer = '';
    return;
  }

  // Generic Y/N prompts during creation (after password phase)
  if (phase === 'confirm-pass' || phase === 'creating') {
    phase = 'creating';

    // Class selection — pick ranger
    if (lower.includes('choose your primary class') || lower.includes('choose a class')) {
      setTimeout(() => send('ranger', 'class: ranger'), 1000);
      buffer = '';
      return;
    }

    // Race selection — pick human as safe default
    if (lower.includes('choose your race') || lower.includes('choose a race') || lower.includes('select a race')) {
      setTimeout(() => send('human', 'race: human'), 1000);
      buffer = '';
      return;
    }

    // Gender
    if (lower.includes('choose your gender') || lower.includes('male/female')) {
      setTimeout(() => send('androgyne', 'gender: androgyne'), 1000);
      buffer = '';
      return;
    }

    // Subclass — pick shaman (nature magic)
    if (lower.includes('choose your subclass') || lower.includes('subclass')) {
      setTimeout(() => send('shaman', 'subclass: shaman'), 1000);
      buffer = '';
      return;
    }

    // Experience level
    if (lower.includes('experience level') || lower.includes('experience with muds')) {
      setTimeout(() => send('1', 'experience: newbie'), 1000);
      buffer = '';
      return;
    }

    // Any "back to go back" prompt we don't specifically handle — just pick first option
    if (lower.includes("'?' to list") || lower.includes('to go back')) {
      // Try to grab the first option name
      setTimeout(() => send('1', 'generic pick: 1'), 1000);
      buffer = '';
      return;
    }

    // Any numbered menu — pick 1 as default
    if (/\[\d+\].*\[\d+\]/s.test(buffer) && lower.includes('choice')) {
      setTimeout(() => send('1', 'menu choice: 1'), 500);
      buffer = '';
      return;
    }
  }

  // After creation, we'll get the HP prompt when in-game
  if (/\d+hp\s+\d+.*mn\s+\d+.*mv/i.test(data)) {
    console.error('\n[DONE] Character created and in-game!');
    console.error(`Name: ${name}`);
    console.error(`Password: ${pass}`);
    // Send quit
    setTimeout(() => {
      send('quit quit', 'quit');
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
  // Write full output for review
  const fs = require('fs');
  fs.writeFileSync('/Users/player1/forge/mud-daemon/data/creation-log.txt', outputLog);
  process.exit(0);
});

// Timeout safety
setTimeout(() => {
  console.error('[TIMEOUT] Creation took too long. Check creation-log.txt');
  const fs = require('fs');
  fs.writeFileSync('/Users/player1/forge/mud-daemon/data/creation-log.txt', outputLog);
  socket.end();
  process.exit(1);
}, 60000);
