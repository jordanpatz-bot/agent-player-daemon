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
const { QudConnection } = require('./qud-connection');
const { BlackboardStore } = require('./blackboard-store');
const { IpcServer } = require('./ipc');
const { ConnectionStateMachine } = require('./state-machine');
const { OutputBuffer } = require('./output-buffer');
const { GmcpHandler } = require('./gmcp');
const { GameStateEngine } = require('./game-state');
const { loadServerProfile } = require('./server-profile');
const { WorldModel } = require('./world-model');
const { WorldModelBridge } = require('./world-model-bridge');
const { ReflexEngine } = require('./reflex-engine');
const { SharedState } = require('./shared-state');
const { TacticsEngine } = require('./tactics');
const { StateAudit } = require('./state-audit');
const { BehaviorTree } = require('./behavior-tree');
const { ConversationMiddleware } = require('./conversation-middleware');
const { atomicWriteJSON } = require('./atomic-write');
const { createIpcHandler } = require('./ipc-handler');

// --- Minimal inline fallbacks (used only when server JSON is missing) ---
const FALLBACK_SERVERS = {
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
  if (!fs.existsSync(profilePath)) {
    console.error('[WARN] profiles.json not found — no profiles available');
    return {};
  }
  const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  // Merge server profile with profile credentials
  const merged = {};
  for (const [key, profile] of Object.entries(raw)) {
    const serverProfile = loadServerProfile(profile.server);
    if (serverProfile) {
      merged[key] = { ...serverProfile.toGameConfig(profile), _serverProfile: serverProfile };
    } else {
      // Fallback: server JSON missing, use inline defaults with warning
      const fallback = FALLBACK_SERVERS[profile.server];
      if (!fallback) {
        console.error(`[WARN] No server profile or fallback for "${profile.server}" — skipping profile "${key}"`);
        continue;
      }
      console.error(`[WARN] Server JSON missing for "${profile.server}" — using inline fallback`);
      merged[key] = { ...fallback, ...profile, _serverProfile: null };
    }
  }
  return merged;
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

  const serverProfile = gameConfig._serverProfile || null;

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
    serverDefaults: serverProfile ? serverProfile.defaults : {},
    fieldTTLs: serverProfile ? serverProfile.fieldTTLs : {},
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

  // --- World Model (Phase 2) ---
  // Structured entity/room/timeline model. Perception-agnostic.
  const worldModel = new WorldModel({
    persistPath: path.join(dataDir, 'world-model.json'),
    name: gameConfig.name || profileKey,
    level: gameConfig.level || 1,
    class: gameConfig.class || 'unknown',
    subclass: gameConfig.subclass || '',
    race: gameConfig.race || 'unknown',
  });

  const bridge = new WorldModelBridge({
    worldModel,
    serverProfile,
    log,
  });

  // Wire GMCP events through the bridge into the world model.
  // This handles: char.vitals, char.status, char.maxstats, char.base,
  // char.worth, room.info, group, comm.channel, comm.quest
  bridge.wireGmcp(gmcp);

  // --- Game State Engine (Phase 2) ---
  // Layers on connection state machine: tracks idle/combat/exploring/resting,
  // runs reflexes (auto-heal, auto-flee), logs events to blackboard.
  const gameState = new GameStateEngine({
    blackboard,
    serverProfile,
    characterClass: gameConfig.class,
    log,
  });

  // --- Reflex Engine (Phase 3) ---
  // JSON-driven, hot-reloadable rule engine. Replaces hardcoded reflexes.
  const reflexEngine = new ReflexEngine({
    worldModel,
    log,
  });

  // Load class-specific reflex rules
  const reflexPath = path.join(__dirname, 'reflexes',
    `${gameConfig.server || 'aardwolf'}-${(gameConfig.class || 'warrior').toLowerCase()}.json`);
  if (fs.existsSync(reflexPath)) {
    reflexEngine.watchRules(reflexPath);
  } else {
    log('SYS', `No reflex rules found at ${reflexPath} — reflexes disabled`);
  }

  // Wire reflex actions — when a rule fires, send the command to the MUD.
  reflexEngine.on('action', (cmd, rule) => {
    if (connection.isPlaying()) {
      connection.send(cmd);
      log('REFLEX', `Rule "${rule.id}": ${cmd}`);
    }
  });

  // --- Behavior Tree (tactical brain) ---
  // Replaces reflex engine as the primary reactive system.
  // LLM authors trees in JSON; daemon ticks them on every world model update.
  const behaviorTree = new BehaviorTree({
    worldModel,
    sharedState: null, // set after sharedState is created
    log,
  });

  // Load class-specific behavior tree
  const treePath = path.join(__dirname, 'trees',
    `${gameConfig.server || 'aardwolf'}-${(gameConfig.class || 'warrior').toLowerCase()}.json`);
  if (fs.existsSync(treePath)) {
    behaviorTree.watchFile(treePath);
  } else {
    log('SYS', `No behavior tree at ${treePath} — using reflex engine only`);
  }

  // Wire behavior tree actions — same as reflex engine, send commands to MUD
  behaviorTree.on('action', (cmd, node) => {
    if (connection.isPlaying()) {
      connection.send(cmd);
      log('BT', `${node._id || node.name}: ${cmd}`);
    }
  });

  // Wire escalation — behavior tree signals LLM needs to decide something
  behaviorTree.on('escalate', (info) => {
    log('BT-ESCALATE', `${info.reason}`);
    worldModel.recordEvent({
      type: 'escalation',
      detail: info.reason,
    });
  });

  // Tick both systems on world model changes.
  // Behavior tree is primary; reflex engine is fallback for simple rules.
  worldModel.on('self:changed', () => {
    const btResult = behaviorTree.tick();
    // Only run reflex engine if behavior tree didn't act
    if (btResult !== 'SUCCESS') {
      reflexEngine.evaluate('vitals');
    }
  });

  gameState.on('transition', ({ from, to, reason }) => {
    log('GAME', `State: ${from} → ${to} (${reason})`);
    // When combat ends, unsuppress reflex rules (player may have bought new potions)
    if (from === 'combat' && to !== 'combat') {
      reflexEngine.unsuppressAll();
    }
  });

  // Wire game state transitions into world model
  bridge.wireGameState(gameState);

  // --- Shared State & Tactics (Phase 4) ---
  const sharedState = new SharedState({
    profileKey,
    serverName: gameConfig.server || 'aardwolf',
    log,
  });

  const tactics = new TacticsEngine({
    worldModel,
    sharedState,
    reflexEngine,
    serverProfile,
    log,
  });

  // Pass shared state to reflex engine and behavior tree for group-aware conditions
  reflexEngine.sharedState = sharedState;
  behaviorTree.sharedState = sharedState;

  // --- State Audit (self-awareness system) ---
  const audit = new StateAudit({
    worldModel,
    serverProfile,
    persistPath: path.join(dataDir, 'audit-state.json'),
    log,
  });

  // --- Conversation Middleware (social metabolism) ---
  const conversation = new ConversationMiddleware({
    worldModel,
    serverProfile,
    characterName: gameConfig.name,
    log,
  });

  // Wire conversation responses — delayed send to MUD
  conversation.on('speak', ({ command }) => {
    if (connection.isPlaying()) {
      connection.send(command);
      log('SOCIAL', `Sent: "${command}"`);
    }
  });

  // Wire obligation escalation to behavior tree
  conversation.on('obligation:high', (obligation) => {
    worldModel.recordEvent({
      type: 'social_obligation',
      detail: `${obligation.speaker}: ${(obligation.content || '').substring(0, 50)}`,
    });
  });

  // Create connection based on type — TCP for MUDs, file-IPC for Qud
  const isFileIpc = serverProfile && serverProfile.connectionType === 'file-ipc';
  const connection = isFileIpc
    ? new QudConnection(gameConfig, { dataDir: path.join(dataDir, 'ipc') })
    : new MudConnection(gameConfig, {
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
      character: {
        hp: worldModel.self.hp,
        maxHp: worldModel.self.maxHp,
        killCount: worldModel.self.killCount,
        location: worldModel.self.locationId,
        room: worldModel.getCurrentRoom(),
      },
      recentEvents: digestEvents.slice(-20),
      timestamp: new Date().toISOString(),
    };
    try { atomicWriteJSON(path.join(dataDir, 'digest.json'), digest); }
    catch { /* non-fatal */ }
  }

  // --- Wire connection events ---
  connection.on('connected', () => {
    log('SYS', `Connected to ${gameConfig.host}:${gameConfig.port}`);
    stateMachine.transition('connecting');
    // Send GMCP negotiation (TCP only — file-IPC has no socket)
    if (!isFileIpc && connection.socket) {
      connection.socket.write(gmcp.negotiateOn());
    }
  });

  connection.on('loggedIn', () => {
    log('SYS', '*** IN GAME ***');
    stateMachine.transition('login');   // connecting → login (required intermediate)
    stateMachine.transition('playing'); // login → playing
    recordDigestEvent('login', 'Connected and in game');

    // Start shared state publishing for multi-agent coordination
    sharedState.start(2000);
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
    if (isFileIpc) return; // No GMCP for file-IPC connections
    log('GMCP', 'Server supports GMCP — registering packages');
    for (const msg of gmcp.supportMessages(serverProfile ? serverProfile.gmcpPackages : undefined)) {
      connection.socket.write(msg);
    }
  });

  gmcp.on('char.vitals', (data) => {
    // Vitals go to world model via bridge.wireGmcp(). Feed to game state for reflexes.
    const hp = parseInt(data.hp) || worldModel.self.hp;
    const maxHp = parseInt(data.maxhp) || worldModel.self.maxHp;
    const mana = parseInt(data.mana) || worldModel.self.mana;
    const maxMana = parseInt(data.maxmana) || worldModel.self.maxMana;
    gameState.processVitals(hp, maxHp, mana, maxMana);
  });

  gmcp.on('room.info', (data) => {
    // Room data goes to world model via bridge.wireGmcp().
    log('GMCP', `Room: ${data.name || 'unknown'} [${data.zone || 'unknown'}]`);
  });

  // Log all GMCP messages for visibility (can be removed once stable)
  gmcp.on('message', (pkg, data) => {
    log('GMCP', `${pkg}: ${JSON.stringify(data).substring(0, 200)}`);
  });

  gmcp.on('comm.channel', (data) => {
    // Channel format varies by game — use config to determine parsing
    const format = serverProfile ? serverProfile.gmcpChannelFormat : 'auto';
    let parsed = data;
    if (format === 'double-encoded' || (format === 'auto' && typeof data === 'string')) {
      try { parsed = JSON.parse(data); } catch { return; }
    }
    const channel = parsed && (parsed.chan || parsed.channel);
    const player = parsed && (parsed.player || parsed.talker);
    if (channel && player) {
      const msg = (parsed.msg || parsed.text || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      recordDigestEvent('channel', `[${channel}] ${player}: ${msg.substring(0, 100)}`);
    }
  });

  // --- Wire file-IPC perception (visual games) ---
  if (isFileIpc) {
    bridge.wireFileIpc(connection);
  }

  // --- Wire data pipeline ---
  connection.on('data', (data) => {
    // File-IPC data is handled by bridge.wireFileIpc() — skip text pipeline
    if (isFileIpc) return;

    // MUD text pipeline (existing behavior)
    const text = data;
    outputBuffer.append(text);

    // Feed text to game state engine for state detection + reflexes
    gameState.processText(text);

    // Feed text to world model bridge for kill/level tracking
    bridge.processText(text);

    // Feed text to reflex engine for failure detection (e.g., "You don't have that potion")
    reflexEngine.processText(text);

    // Feed text to state audit for context capture (equipment, score, train output)
    audit.processText(text);

    // Feed text to conversation middleware for social classification + obligation scoring
    conversation.processText(text);

    // Fallback: regex HP prompt parsing (when GMCP not available)
    const pattern = serverProfile ? serverProfile.connection.promptPattern : gameConfig.promptPattern;
    if (pattern) {
      const m = text.match(pattern);
      if (m && serverProfile) {
        const fields = serverProfile.connection.promptFields;
        const values = {};
        fields.forEach((field, i) => {
          values[field] = parseInt(m[i + 1]) || 0;
        });
        worldModel.updateSelf(values);
        if (values.hp !== undefined && values.maxHp !== undefined) {
          gameState.processVitals(values.hp, values.maxHp, values.mana, values.maxMana);
        }
      } else if (m) {
        // Legacy fallback: positional groups (hp, maxHp, mana, maxMana)
        const hp = parseInt(m[1]);
        const maxHp = parseInt(m[2]);
        const mana = parseInt(m[3]);
        const maxMana = parseInt(m[4]);
        worldModel.updateSelf({ hp, maxHp, mana, maxMana });
        gameState.processVitals(hp, maxHp, mana, maxMana);
      }
    }

    // Track kills for digest
    if (/is slain|is DEAD/i.test(text)) {
      worldModel.self.killCount = (worldModel.self.killCount || 0) + 1;
      recordDigestEvent('kill', `Kill #${worldModel.self.killCount}`);
    }
  });

  // --- Wire IPC ---
  ipc.onCommand(createIpcHandler({
    connection, isFileIpc, dataDir, log,
    reflexEngine, worldModel, tactics, behaviorTree,
    conversation, audit, gameState, stateMachine,
    blackboard, outputBuffer,
  }));

  // --- Status endpoint (write periodic status file) ---
  function writeStatus() {
    const status = {
      game: profileKey,
      pid: process.pid,
      uptime: process.uptime(),
      connectionState: connection.getState(),
      gameState: stateMachine.getState(),
      reconnectAttempts: connection.reconnectAttempts,
      character: {
        hp: worldModel.self.hp,
        maxHp: worldModel.self.maxHp,
        mana: worldModel.self.mana,
        maxMana: worldModel.self.maxMana,
        inCombat: worldModel.self.inCombat,
        killCount: worldModel.self.killCount,
        location: worldModel.self.locationId,
        room: worldModel.getCurrentRoom(),
      },
      stateHistory: stateMachine.getHistory().slice(-5),
      timestamp: new Date().toISOString(),
    };

    atomicWriteJSON(path.join(dataDir, 'status.json'), status);
  }

  const statusTimer = setInterval(writeStatus, 15000);
  const digestTimer = setInterval(writeDigest, 900000); // 15 min digest

  // Publish shared state for multi-agent coordination (Phase 4)
  const sharedStateTimer = setInterval(() => {
    if (connection.isPlaying()) {
      sharedState.publishState({
        name: worldModel.self.name,
        class: worldModel.self.class,
        role: tactics.getRole(),
        location: worldModel.getCurrentRoom() ? {
          id: worldModel.self.locationId,
          name: worldModel.getCurrentRoom().name,
          zone: worldModel.getCurrentRoom().zone,
        } : null,
        hp: worldModel.self.hp,
        maxHp: worldModel.self.maxHp,
        mana: worldModel.self.mana,
        maxMana: worldModel.self.maxMana,
        moves: worldModel.self.moves,
        inCombat: worldModel.self.inCombat,
        target: worldModel.self.currentTarget,
        gameState: worldModel.self.state,
      });
    }
  }, 2000);

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
    reflexEngine.stopWatching();
    behaviorTree.stopWatching();
    sharedState.stop();
    clearInterval(sharedStateTimer);
    blackboard.saveNow();
    worldModel.saveNow();
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

  // Keepalive — send a no-op command periodically to prevent idle timeout.
  // File-IPC connections don't need keepalive (no TCP idle disconnect).
  if (!isFileIpc) {
    const KEEPALIVE_MS = serverProfile ? serverProfile.connection.keepalive.intervalMs : 10 * 60 * 1000;
    const KEEPALIVE_CMD = serverProfile ? serverProfile.connection.keepalive.command : 'time';
    setInterval(() => {
      if (connection.isPlaying()) {
        connection.send(KEEPALIVE_CMD);
        log('SYS', `Keepalive sent: ${KEEPALIVE_CMD}`);
      }
    }, KEEPALIVE_MS);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
