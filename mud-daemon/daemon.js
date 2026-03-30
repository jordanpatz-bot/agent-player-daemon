#!/usr/bin/env node
'use strict';
// daemon.js — Persistent MUD daemon. Long-running process under PM2.
// Manages connection lifecycle, IPC, state machine, and persistent blackboard.
//
// Usage:
//   node daemon.js --profile mycelico        (Mico on Aardwolf)
//   node daemon.js --profile rhizomi         (Rhizo on Discworld)
//   node daemon.js --profile ectorhi         (Ecto on Aardwolf)
//   pm2 start daemon.js --name mud-mycelico -- --profile mycelico

const fs = require('fs');
const path = require('path');
const { MudConnection } = require('./connection');
const { BlackboardStore } = require('./blackboard-store');
const { IpcServer } = require('./ipc');
const { ConnectionStateMachine } = require('./state-machine');
const { OutputBuffer } = require('./output-buffer');
const { GmcpHandler } = require('./gmcp');

// --- Game server templates ---
const SERVERS = {
  aardwolf: {
    host: 'aardmud.org',
    port: 4000,
    loginDetect: 'what be thy name',
    passwordDetect: 'password',
    inGameDetect: /\d+hp\s+\d+.*mn\s+\d+.*mv/i,
    enterPrompts: /\[press enter|press return/i,
    promptPattern: /\[(\d+)\/(\d+)hp\s+(\d+)\/(\d+)mn\s+(\d+)\/(\d+)mv\s+(\d+)qt\s+(\d+)tnl\]/,
    quitCommands: ['quit quit', 'y'],
    debounceMs: 800,
    extraLogin: [
      { detect: 'already playing|do you wish to reconnect', send: 'y' },
    ],
  },
  discworld: {
    host: 'discworld.starturtle.net',
    port: 4242,
    loginDetect: 'your choice',
    passwordDetect: 'password',
    inGameDetect: /obvious exits|inventory regeneration|> /i,
    enterPrompts: /\[press enter|press return|hit return|--more--/i,
    promptPattern: null,
    quitCommands: ['quit'],
    debounceMs: 1500,
    extraLogin: [
      { detect: 'throw the other copy out|already playing', send: 'y' },
      { detect: 'nationality|morporkian.*choose', send: 'morporkian' },
    ],
  },
};

// --- Character profiles (character + server + owner) ---
// Credentials loaded from profiles.json if it exists, otherwise defaults here.
function loadProfiles() {
  const profilePath = path.join(__dirname, 'profiles.json');
  if (fs.existsSync(profilePath)) {
    const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    // Merge server templates with profile credentials
    const merged = {};
    for (const [key, profile] of Object.entries(raw)) {
      const server = SERVERS[profile.server];
      if (!server) continue;
      merged[key] = { ...server, ...profile };
    }
    return merged;
  }
  // Fallback defaults
  return {
    mycelico: { ...SERVERS.aardwolf, name: 'Mycelico', pass: 'spore2network', owner: 'mico', server: 'aardwolf' },
    rhizomi: { ...SERVERS.discworld, name: 'Rhizomi', pass: 'spore2flatworld', owner: 'rhizo', server: 'discworld' },
  };
}

// --- Parse args ---
function parseArgs() {
  const args = process.argv.slice(2);
  let profile = null;
  let game = null; // legacy compat
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1];
      i++;
    } else if (args[i] === '--game' && args[i + 1]) {
      game = args[i + 1]; // legacy: treat as profile name
      i++;
    }
  }
  return { profile: profile || game || 'mycelico' };
}

// --- Lockfile guard ---
function acquireLock(lockPath) {
  try {
    // O_EXCL: fail if file exists
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') {
      // Check if owning process is still alive
      try {
        const existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        process.kill(existing.pid, 0); // throws if process doesn't exist
        return false; // Process is alive — lock is held
      } catch {
        // Stale lock — remove and retry
        fs.unlinkSync(lockPath);
        return acquireLock(lockPath);
      }
    }
    throw e;
  }
}

function releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* fine */ }
}

// --- Main ---
async function main() {
  const { profile: profileKey } = parseArgs();
  const profiles = loadProfiles();
  const gameConfig = profiles[profileKey];
  if (!gameConfig) {
    console.error(`Unknown profile: ${profileKey}. Available: ${Object.keys(profiles).join(', ')}`);
    process.exit(1);
  }

  const dataDir = path.join(__dirname, 'data', profileKey);
  fs.mkdirSync(dataDir, { recursive: true });

  // --- Lockfile ---
  const lockPath = path.join(dataDir, 'daemon.lock');
  if (!acquireLock(lockPath)) {
    console.error(`Another daemon is already running for ${profileKey}. Lock: ${lockPath}`);
    process.exit(1);
  }

  // --- Components ---
  // Pass profile-specific defaults so TTL-expired fields return THIS character's
  // identity, not the hardcoded Mycelico defaults from blackboard-store.js.
  const blackboard = new BlackboardStore({
    filePath: path.join(dataDir, 'blackboard.json'),
    defaults: {
      name: gameConfig.name || profileKey,
      level: gameConfig.level || 1,
      class: gameConfig.class || 'unknown',
    },
  });

  // Seed blackboard identity from profile config on first run or after reset.
  const currentName = blackboard.get('name');
  if (!currentName || currentName === 'Mycelico') {
    blackboard.update({
      name: gameConfig.name || profileKey,
      level: gameConfig.level || 1,
      class: gameConfig.class || 'unknown',
    });
    log('SYS', `Blackboard identity seeded: ${gameConfig.name}, level ${gameConfig.level || 1}`);
  }

  const outputBuffer = new OutputBuffer({
    filePath: path.join(dataDir, 'output-buffer.txt'),
    maxSize: 100000,
  });

  const stateMachine = new ConnectionStateMachine();

  const ipc = new IpcServer({
    baseDir: path.join(dataDir, 'ipc'),
    getState: () => stateMachine.getState(),
  });

  const gmcp = new GmcpHandler();
  const connection = new MudConnection(gameConfig, {
    // Pipe raw socket bytes through GMCP handler before text cleaning.
    // gmcp.processRaw extracts GMCP subnegotiations, emits events,
    // and returns remaining bytes for normal text processing.
    rawPreprocessor: (buf) => gmcp.processRaw(buf),
  });

  function log(type, msg) {
    const ts = new Date().toISOString().substring(11, 19);
    const line = `[${ts}] [${type}] ${msg}`;
    console.error(line);
    // Append to log file (rotate later if needed)
    try {
      fs.appendFileSync(path.join(dataDir, 'daemon.log'), line + '\n');
    } catch { /* non-fatal */ }
  }

  // --- Activity digest ---
  const digestEvents = []; // significant events for periodic digest

  function recordDigestEvent(type, detail) {
    digestEvents.push({ type, detail, at: new Date().toISOString() });
    if (digestEvents.length > 100) digestEvents.shift();
  }

  function writeDigest() {
    const digest = {
      profile: profileKey,
      connectionState: stateMachine.getState(),
      playingUptime: stateMachine.getUptime(),
      blackboard: {
        hp: blackboard.get('hp'),
        maxHp: blackboard.get('maxHp'),
        killCount: blackboard.get('killCount'),
        currentRoom: blackboard.get('currentRoom'),
      },
      recentEvents: digestEvents.slice(-20),
      timestamp: new Date().toISOString(),
    };
    const tmp = path.join(dataDir, 'digest.json.tmp');
    const dest = path.join(dataDir, 'digest.json');
    try {
      fs.writeFileSync(tmp, JSON.stringify(digest, null, 2));
      fs.renameSync(tmp, dest);
    } catch { /* non-fatal */ }
  }

  // --- Wire connection events ---
  connection.on('connected', () => {
    log('SYS', `Connected to ${gameConfig.host}:${gameConfig.port}`);
    stateMachine.transition('connecting');
    // Send GMCP negotiation
    connection.socket.write(gmcp.negotiateOn());
  });

  connection.on('loggedIn', () => {
    log('SYS', '*** IN GAME ***');
    stateMachine.transition('login');   // connecting → login (required intermediate)
    stateMachine.transition('playing'); // login → playing
    recordDigestEvent('login', 'Connected and in game');
  });

  connection.on('disconnected', ({ wasPlaying }) => {
    log('SYS', `Disconnected (wasPlaying: ${wasPlaying})`);
    stateMachine.transition('disconnected');
    recordDigestEvent('disconnect', `wasPlaying: ${wasPlaying}`);
  });

  connection.on('reconnecting', ({ attempt, delay, maxAttempts }) => {
    log('SYS', `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${attempt}/${maxAttempts})`);
    stateMachine.transition('reconnecting');
  });

  connection.on('reconnectFailed', ({ message }) => {
    log('ERR', `Reconnect failed: ${message}. Daemon stays alive for IPC reconnect.`);
    recordDigestEvent('reconnect-failed', message);
  });

  connection.on('error', (err) => {
    log('ERR', `Connection error: ${err.message}`);
  });

  // --- GMCP events ---
  gmcp.on('gmcp-ready', () => {
    log('GMCP', 'Server supports GMCP — registering packages');
    for (const msg of gmcp.supportMessages()) {
      connection.socket.write(msg);
    }
  });

  gmcp.on('char.vitals', (data) => {
    blackboard.update({
      hp: parseInt(data.hp) || blackboard.get('hp'),
      maxHp: parseInt(data.maxhp) || blackboard.get('maxHp'),
      mana: parseInt(data.mana) || blackboard.get('mana'),
      maxMana: parseInt(data.maxmana) || blackboard.get('maxMana'),
    });
  });

  gmcp.on('room.info', (data) => {
    log('GMCP', `Room: ${data.name || 'unknown'} [${data.zone || 'unknown'}]`);
    blackboard.set('currentRoom', {
      name: data.name || 'unknown',
      zone: data.zone || 'unknown',
      exits: data.exits ? Object.keys(data.exits) : [],
    });
  });

  // Log all GMCP messages for visibility (can be removed once stable)
  gmcp.on('message', (pkg, data) => {
    log('GMCP', `${pkg}: ${JSON.stringify(data).substring(0, 200)}`);
  });

  gmcp.on('comm.channel', (data) => {
    recordDigestEvent('channel', `[${data.chan}] ${data.player}: ${(data.msg || '').substring(0, 100)}`);
  });

  // --- Wire data pipeline ---
  connection.on('data', (text) => {
    outputBuffer.append(text);

    // Fallback: regex HP prompt parsing (when GMCP not available)
    if (gameConfig.promptPattern) {
      const m = text.match(gameConfig.promptPattern);
      if (m) {
        blackboard.update({
          hp: parseInt(m[1]),
          maxHp: parseInt(m[2]),
          mana: parseInt(m[3]),
          maxMana: parseInt(m[4]),
        });
      }
    }

    // Track kills for digest
    if (/is slain|is DEAD/i.test(text)) {
      const count = (blackboard.get('killCount') || 0) + 1;
      blackboard.set('killCount', count);
      recordDigestEvent('kill', `Kill #${count}`);
    }
  });

  // --- Wire IPC ---
  ipc.onCommand(async (command) => {
    log('IPC', `Received command: ${command.id} (${command.commands.length} cmds)`);

    if (!connection.isPlaying()) {
      return {
        output: '',
        error: 'Not connected to game',
        connectionState: connection.getState(),
      };
    }

    // Use cursor-based tracking that survives ring buffer wrapping.
    // Old approach used getAll().length which broke when the ring buffer
    // trimmed old content between start and end measurements.
    const startCursor = outputBuffer.getCursor();
    const events = [];

    // Send each command with delay
    for (let i = 0; i < command.commands.length; i++) {
      const cmd = command.commands[i];

      if (typeof cmd === 'string') {
        connection.send(cmd);
        log('IPC', `Sent: "${cmd}"`);
        // Wait between commands
        await new Promise(r => setTimeout(r, 1500));
      } else if (typeof cmd === 'object' && cmd.wait) {
        // Wait-for pattern
        const matched = await waitForPattern(cmd.wait, cmd.timeout || 15000);
        log('IPC', matched ? `Wait matched: ${cmd.wait}` : `Wait timed out: ${cmd.wait}`);
        if (cmd.send) {
          connection.send(cmd.send);
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    // Collect output since command started
    await new Promise(r => setTimeout(r, 2000)); // settle time
    const newOutput = outputBuffer.getOutputSince(startCursor);

    return {
      output: newOutput.slice(-5000), // cap at 5KB
      events,
      state: stateMachine.getState(),
      blackboard: blackboard.snapshot(),
    };
  });

  // Wait-for helper (used by IPC commands)
  function waitForPattern(pattern, timeoutMs) {
    return new Promise((resolve) => {
      const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      const startLen = outputBuffer.getAll().length;
      const deadline = Date.now() + timeoutMs;

      const check = setInterval(() => {
        const newText = outputBuffer.getAll().slice(startLen);
        if (re.test(newText)) {
          clearInterval(check);
          resolve(true);
        } else if (Date.now() > deadline) {
          clearInterval(check);
          resolve(false);
        }
      }, 200);
    });
  }

  // --- Status endpoint (write periodic status file) ---
  function writeStatus() {
    const status = {
      game: profileKey,
      pid: process.pid,
      uptime: process.uptime(),
      connectionState: connection.getState(),
      gameState: stateMachine.getState(),
      reconnectAttempts: connection.reconnectAttempts,
      blackboard: {
        hp: blackboard.get('hp'),
        maxHp: blackboard.get('maxHp'),
        mana: blackboard.get('mana'),
        maxMana: blackboard.get('maxMana'),
        inCombat: blackboard.get('inCombat'),
        killCount: blackboard.get('killCount'),
        currentRoom: blackboard.get('currentRoom'),
      },
      stateHistory: stateMachine.getHistory().slice(-5),
      timestamp: new Date().toISOString(),
    };

    const tmp = path.join(dataDir, 'status.json.tmp');
    const dest = path.join(dataDir, 'status.json');
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2));
    fs.renameSync(tmp, dest);
  }

  const statusTimer = setInterval(writeStatus, 15000);
  const digestTimer = setInterval(writeDigest, 900000); // 15 min digest

  // --- Graceful shutdown ---
  function shutdown(signal) {
    log('SYS', `Shutdown requested (${signal})`);
    // Release lock IMMEDIATELY so new process doesn't race against our
    // graceful shutdown window. PM2 kill_timeout (1.6s default) is shorter
    // than a 6s grace period — if we wait, SIGKILL drops us with lock held.
    releaseLock(lockPath);
    ipc.stop();
    outputBuffer.stopSnapshots();
    clearInterval(statusTimer);
    clearInterval(digestTimer);
    blackboard.saveNow();
    writeStatus();
    writeDigest();

    connection.disconnect();

    // Give connection time to quit gracefully
    setTimeout(() => {
      log('SYS', 'Daemon stopped.');
      process.exit(0);
    }, 6000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // --- Start ---
  log('SYS', `=== MUD Daemon starting for ${profileKey} ===`);
  log('SYS', `Data dir: ${dataDir}`);
  log('SYS', `PID: ${process.pid}`);

  outputBuffer.startSnapshots();
  ipc.start();

  // Brief delay before connecting — if a previous instance just released its lock,
  // the old Aardwolf session may still be alive server-side. 3s lets it expire
  // before we trigger "already playing" / extraLogin dance.
  log('SYS', 'Waiting 3s for stale sessions to clear...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  connection.connect();

  // Keepalive — send a no-op command every 10 minutes to prevent idle timeout.
  // Aardwolf kicks idle connections after ~35 minutes; this keeps us under that.
  // Only fires when connected and playing. The command 'time' is silent and harmless.
  const KEEPALIVE_MS = 10 * 60 * 1000; // 10 minutes
  const KEEPALIVE_CMD = gameConfig.server === 'discworld' ? 'date' : 'time';
  setInterval(() => {
    if (connection.isPlaying()) {
      connection.send(KEEPALIVE_CMD);
      log('SYS', `Keepalive sent: ${KEEPALIVE_CMD}`);
    }
  }, KEEPALIVE_MS);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
