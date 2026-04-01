'use strict';
// sge-auth.js — SGE (Simutronics Game Entry) protocol authentication.
// Handles the two-phase login for GemStone IV / DragonRealms / play.net games.
//
// Phase 1: Connect to eaccess.play.net:7900, authenticate, get session key
// Phase 2: Returns { host, port, key } for the game server connection
//
// Usage:
//   const { sgeAuthenticate } = require('./sge-auth');
//   const session = await sgeAuthenticate({
//     account: 'username', password: 'password',
//     gameCode: 'GS3', characterName: 'Charname'
//   });
//   // session = { host: 'storm.gs4.game.play.net', port: 10024, key: '...' }

const net = require('net');

function hashPassword(password, hashKey) {
  const result = [];
  for (let i = 0; i < password.length && i < hashKey.length; i++) {
    const ch = ((password.charCodeAt(i) - 0x20) ^ hashKey.charCodeAt(i)) + 0x20;
    result.push(String.fromCharCode(ch));
  }
  return result.join('');
}

function sgeAuthenticate(options = {}) {
  const {
    authHost = 'eaccess.play.net',
    authPort = 7900,
    account,
    password,
    gameCode = 'GS3',
    characterName = null,
    timeout = 30000,
    log = (msg) => console.error(`[SGE] ${msg}`),
  } = options;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: authHost, port: authPort });
    // Do NOT set encoding — hash key needs raw bytes
    // We'll handle encoding manually per-phase

    let rawBuffer = Buffer.alloc(0);
    let phase = 'wait-hashkey';
    let hashKeyBuf = null;
    let characters = []; // [{ id, name }]
    let timer = null;
    let useText = false; // switch to text mode after hash key received

    timer = setTimeout(() => {
      log('Timeout during SGE auth');
      socket.destroy();
      reject(new Error('SGE authentication timed out'));
    }, timeout);

    function send(msg) {
      log(`Send: ${msg.substring(0, 60)}`);
      socket.write(msg + '\n');
    }

    function hashPasswordBuf(pw, keyBuf) {
      const result = [];
      for (let i = 0; i < pw.length && i < keyBuf.length; i++) {
        const ch = ((pw.charCodeAt(i) - 0x20) ^ keyBuf[i]) + 0x20;
        result.push(String.fromCharCode(ch));
      }
      return result.join('');
    }

    function processLine(line) {
      line = line.trim();
      if (!line) return;

      log(`Recv: ${line.substring(0, 80)}`);

      switch (phase) {
        case 'wait-hashkey': {
          // Hash key is raw bytes — already captured as hashKeyBuf
          // This branch shouldn't fire since we handle it in the data handler
          break;
        }

        case 'wait-auth': {
          if (line.includes('KEY')) {
            // Auth successful — might contain key directly or need more steps
            log('Auth successful');
            phase = 'get-games';
            send('M');
            phase = 'wait-games';
          } else if (line.startsWith('A\t') && line.includes('NORECORD')) {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error('Account not found'));
          } else if (line.startsWith('A\t') && line.includes('PASSWORD')) {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error('Invalid password'));
          } else if (line.startsWith('A\t') && line.includes('REJECT')) {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error(`Auth rejected: ${line}`));
          } else {
            // Might be success without KEY — try proceeding
            log(`Auth response: ${line}`);
            phase = 'get-games';
            send('M');
            phase = 'wait-games';
          }
          break;
        }

        case 'wait-games': {
          // M\tGS3\tGemStone IV\tGS3T\tGemStone IV (Test)...
          if (line.startsWith('M\t')) {
            const parts = line.split('\t');
            log(`Games available: ${parts.slice(1).filter((_, i) => i % 2 === 1).join(', ')}`);
          }
          // Select our game
          phase = 'select-game';
          send(`F\t${gameCode}`);
          send(`G\t${gameCode}`);
          send(`P\t${gameCode}`);
          send('C');
          phase = 'wait-characters';
          break;
        }

        case 'wait-characters': {
          if (line.startsWith('C\t')) {
            // C\tnumChars\tnumSlots\tx\tx\tcharId\tcharName\tcharId\tcharName...
            const parts = line.split('\t');
            const numChars = parseInt(parts[1]) || 0;
            characters = [];
            for (let i = 5; i + 1 < parts.length; i += 2) {
              characters.push({ id: parts[i], name: parts[i + 1] });
            }
            log(`Characters: ${characters.map(c => `${c.name}(${c.id})`).join(', ') || 'none'}`);

            if (characters.length === 0) {
              // No characters — need to create one in-game
              // Launch without character (the game will prompt for creation)
              log('No characters found — launching for character creation');
              send(`L\t\tSTORM`);
              phase = 'wait-launch';
            } else {
              // Select character
              let char;
              if (characterName) {
                char = characters.find(c => c.name.toLowerCase() === characterName.toLowerCase());
              }
              if (!char) char = characters[0]; // default to first
              log(`Selecting character: ${char.name} (${char.id})`);
              send(`L\t${char.id}\tSTORM`);
              phase = 'wait-launch';
            }
          } else if (line.startsWith('P\t') || line.startsWith('F\t') || line.startsWith('G\t')) {
            // Subscription/game info responses — check for issues
            if (line.includes('EXPIRED')) {
              log('Warning: subscription expired (F2P may still work)');
            }
            // Continue waiting for C response
          }
          break;
        }

        case 'wait-launch': {
          // Should contain GAMEHOST, GAMEPORT, KEY fields
          if (line.includes('GAMEHOST') || line.includes('GAMEPORT') || line.includes('KEY')) {
            const fields = {};
            const parts = line.split('\t');
            for (let i = 0; i < parts.length - 1; i++) {
              if (parts[i] === 'GAMEHOST') fields.host = parts[i + 1];
              if (parts[i] === 'GAMEPORT') fields.port = parseInt(parts[i + 1]);
              if (parts[i] === 'KEY') fields.key = parts[i + 1];
            }

            if (fields.host && fields.port && fields.key) {
              clearTimeout(timer);
              socket.destroy();
              log(`Game server: ${fields.host}:${fields.port} (key: ${fields.key.substring(0, 20)}...)`);
              resolve({
                host: fields.host,
                port: fields.port,
                key: fields.key,
                characters,
              });
            } else {
              log(`Partial launch data: ${JSON.stringify(fields)}`);
              // Keep waiting for more data
            }
          } else if (line.startsWith('L\t') && line.includes('PROBLEM')) {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error(`Launch failed: ${line}`));
          }
          break;
        }
      }
    }

    socket.on('data', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

      if (phase === 'wait-hashkey') {
        // Accumulate raw bytes for the hash key
        rawBuffer = Buffer.concat([rawBuffer, buf]);
        // Hash key ends with \n
        const nlIdx = rawBuffer.indexOf(0x0A);
        if (nlIdx >= 0) {
          hashKeyBuf = rawBuffer.slice(0, nlIdx);
          log(`Hash key received (${hashKeyBuf.length} bytes)`);

          // Hash the password using raw bytes
          const hashed = hashPasswordBuf(password, hashKeyBuf);
          phase = 'wait-auth';
          send(`A\t${account}\t${hashed}`);

          // Process any remaining data as text
          const rest = rawBuffer.slice(nlIdx + 1).toString('utf8');
          rawBuffer = Buffer.alloc(0);
          useText = true;
          if (rest.trim()) {
            const lines = rest.split('\n');
            for (const line of lines) {
              if (line.trim()) processLine(line);
            }
          }
        }
        return;
      }

      // Text mode for all subsequent communication
      const text = buf.toString('utf8');
      rawBuffer = Buffer.concat([rawBuffer, Buffer.from(text)]);
      const str = rawBuffer.toString('utf8');
      const lines = str.split('\n');
      rawBuffer = Buffer.from(lines.pop()); // keep incomplete line
      for (const line of lines) {
        if (line.trim()) processLine(line);
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`SGE connection error: ${err.message}`));
    });

    socket.on('close', () => {
      clearTimeout(timer);
      // If we haven't resolved/rejected yet, it's an unexpected close
    });

    socket.on('connect', () => {
      log(`Connected to ${authHost}:${authPort}`);
      // Send initial key request
      send('K');
    });
  });
}

module.exports = { sgeAuthenticate, hashPassword };
