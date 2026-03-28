#!/usr/bin/env node
// =============================================================================
// MUD Session Runner — Plan-Based Batched Execution
// =============================================================================
// Executes an entire play session from a plan file in ONE node call.
// Designed to reduce Mico's turn consumption: write plan → run → read report.
//
// Usage:
//   node session-runner.js plan.json              — Run a plan file
//   node session-runner.js --game aardwolf "cmd1" "cmd2" "cmd3" ...
//   node session-runner.js --game discworld --plan-stdin < plan.json
//
// Plan file format (JSON):
//   {
//     "game": "aardwolf" | "discworld",
//     "phases": [
//       {
//         "name": "explore",
//         "commands": ["look", "north", "look", "south"],
//         "delay": 2000
//       },
//       {
//         "name": "combat",
//         "commands": [
//           "kill viper",
//           { "wait": "is slain|aren.t here", "send": "kill hare", "timeout": 12000 }
//         ]
//       }
//     ],
//     "timeout": 300000,
//     "reportDir": "/path/to/sessions"
//   }
//
// Output: Writes a structured report (JSON + text) to reportDir.
// The report is compact enough for Mico to read in one tool turn.
// =============================================================================

const net = require('net');
const fs = require('fs');
const path = require('path');

// --- Game Configs ---
const GAMES = {
  aardwolf: {
    host: 'aardmud.org',
    port: 4000,
    name: 'Mycelico',
    pass: 'spore2network',
    loginDetect: 'what be thy name',
    passwordDetect: 'password',
    inGameDetect: /\d+hp\s+\d+mn\s+\d+mv/i,
    enterPrompts: /\[press enter|press return/i,
    promptPattern: /\[(\d+)\/(\d+)hp\s+(\d+)\/(\d+)mn\s+(\d+)\/(\d+)mv\s+(\d+)qt\s+(\d+)tnl\]/,
    quitCommands: ['quit', 'y'],
    debounceMs: 800,
    defaultDelay: 1500,
  },
  discworld: {
    host: 'discworld.starturtle.net',
    port: 4242,
    name: 'Rhizomi',
    pass: 'spore2flatworld',
    loginDetect: 'your choice',
    passwordDetect: 'password',
    inGameDetect: /obvious exits|inventory regeneration|> /i,
    enterPrompts: /\[press enter|press return|hit return|--more--/i,
    promptPattern: null, // Discworld doesn't have a standard HP prompt
    quitCommands: ['quit'],
    debounceMs: 1500,
    defaultDelay: 3000,
    extraLogin: [
      { detect: 'throw the other copy out|already playing', send: 'y' },
      { detect: 'nationality|morporkian.*choose', send: 'morporkian' },
    ],
  },
};

// --- Parse Arguments ---
function parseArgs() {
  const args = process.argv.slice(2);

  // Plan file mode
  if (args.length === 1 && args[0].endsWith('.json')) {
    const plan = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    return plan;
  }

  // CLI mode
  let game = 'aardwolf';
  const commands = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--game' && args[i + 1]) {
      game = args[i + 1];
      i += 2;
    } else if (args[i].startsWith('--')) {
      i++; // skip unknown flags
    } else {
      commands.push(args[i]);
      i++;
    }
  }

  return {
    game,
    phases: [{ name: 'commands', commands }],
  };
}

// --- Main Runner ---
async function run() {
  const plan = parseArgs();
  const gameKey = plan.game || 'aardwolf';
  const game = GAMES[gameKey];
  if (!game) {
    console.error(`Unknown game: ${gameKey}. Available: ${Object.keys(GAMES).join(', ')}`);
    process.exit(1);
  }

  const sessionTimeout = plan.timeout || 300000; // 5 min default
  const reportDir = plan.reportDir || path.join(process.cwd(), 'sessions');
  fs.mkdirSync(reportDir, { recursive: true });

  // --- State ---
  const state = {
    phase: 'connecting',
    buffer: '',
    log: [],
    events: [],      // Key events for report
    rooms: [],       // Room descriptions seen
    channels: [],    // Channel/social messages
    errors: [],
    startTime: Date.now(),
    currentPhase: 0,
    commandIndex: 0,
    lastPrompt: null,
  };

  function timestamp() {
    return new Date().toISOString().substring(11, 19);
  }

  function log(type, msg) {
    const entry = `[${timestamp()}] [${type}] ${msg}`;
    state.log.push(entry);
    // Only print SYS and ERR to keep stdout manageable
    if (type === 'SYS' || type === 'ERR' || type === 'EVENT') {
      console.error(entry); // stderr so stdout stays clean for report
    }
  }

  function clean(data) {
    return data
      .replace(/\xff[\xfb-\xfe]./gs, '')
      .replace(/\xff\xf[0-9a-f]/gs, '')
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1b\[2J/g, '')
      .replace(/\r/g, '');
  }

  function send(text, label) {
    log('SEND', `${label}: "${text}"`);
    socket.write(text + '\r\n');
  }

  // --- Wait-for system ---
  let waitingFor = null;

  function setWaitFor(pattern, timeoutMs) {
    return new Promise((resolve) => {
      const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      const timer = setTimeout(() => {
        log('WAIT', `Timeout waiting for: ${pattern}`);
        waitingFor = null;
        resolve(false);
      }, timeoutMs || 15000);
      waitingFor = { re, resolve, timer };
    });
  }

  function checkWaitFor(text) {
    if (!waitingFor) return;
    if (waitingFor.re.test(text)) {
      clearTimeout(waitingFor.timer);
      const { resolve } = waitingFor;
      waitingFor = null;
      resolve(true);
    }
  }

  // --- Extract interesting events from text ---
  function extractEvents(text) {
    const lower = text.toLowerCase();

    // Room descriptions (lines with "obvious exits" or compass dirs)
    if (lower.includes('obvious exit') || /exits?:.*(?:north|south|east|west)/i.test(text)) {
      // Grab the room — first non-empty line before "obvious exits"
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/obvious exit/i.test(lines[i]) || /exits?:/i.test(lines[i])) {
          const roomName = lines.slice(Math.max(0, i - 5), i).filter(l => l.trim()).join(' | ');
          if (roomName && !state.rooms.includes(roomName.substring(0, 200))) {
            state.rooms.push(roomName.substring(0, 200));
          }
          break;
        }
      }
    }

    // HP prompt (Aardwolf)
    if (game.promptPattern) {
      const m = text.match(game.promptPattern);
      if (m) {
        state.lastPrompt = {
          hp: `${m[1]}/${m[2]}`,
          mana: `${m[3]}/${m[4]}`,
          mv: `${m[5]}/${m[6]}`,
        };
      }
    }

    // Kill events
    if (/is slain|is DEAD/i.test(text)) {
      const killMatch = text.match(/([\w\s]+?)(?:\s+is\s+(?:slain|DEAD))/i);
      if (killMatch) {
        state.events.push({ type: 'kill', target: killMatch[1].trim(), time: timestamp() });
      }
    }

    // Level up
    if (/congratulations.*level|you have gained a level/i.test(text)) {
      state.events.push({ type: 'level-up', time: timestamp() });
    }

    // Channel/social messages
    const channelMatch = text.match(/\[(\w+)\]\s+(\w+):\s+(.+)/);
    if (channelMatch) {
      state.channels.push({ channel: channelMatch[1], speaker: channelMatch[2], msg: channelMatch[3].substring(0, 200) });
    }

    // Tells
    const tellMatch = text.match(/(\w+) tells you[,:]\s*(.+)/i);
    if (tellMatch) {
      state.channels.push({ channel: 'tell', speaker: tellMatch[1], msg: tellMatch[2].substring(0, 200) });
    }
  }

  // --- Phase execution ---
  async function executePhases() {
    for (let pi = 0; pi < plan.phases.length; pi++) {
      const phase = plan.phases[pi];
      state.currentPhase = pi;
      log('SYS', `--- Phase ${pi + 1}/${plan.phases.length}: ${phase.name || 'unnamed'} ---`);

      const delay = phase.delay || game.defaultDelay;
      const commands = phase.commands || [];

      for (let ci = 0; ci < commands.length; ci++) {
        const entry = commands[ci];

        if (typeof entry === 'string') {
          // Simple command
          send(entry, `${phase.name || 'phase'}[${ci + 1}/${commands.length}]`);
          // Wait for delay and collect output
          await sleep(delay);
        } else if (typeof entry === 'object') {
          // Wait-and-send command
          if (entry.wait) {
            const matched = await setWaitFor(entry.wait, entry.timeout || 15000);
            log('SYS', matched ? `Wait matched for: ${entry.wait}` : `Wait timed out for: ${entry.wait}`);
          }
          if (entry.send) {
            send(entry.send, `${phase.name || 'phase'}[${ci + 1}/${commands.length}]`);
          }
          await sleep(entry.delay || delay);
        }
      }

      // Inter-phase pause
      if (pi < plan.phases.length - 1) {
        await sleep(1000);
      }
    }
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // --- Generate Report ---
  function generateReport() {
    const duration = ((Date.now() - state.startTime) / 1000).toFixed(1);
    const totalCommands = plan.phases.reduce((sum, p) => sum + (p.commands || []).length, 0);

    const report = {
      game: gameKey,
      duration: `${duration}s`,
      phases: plan.phases.map(p => p.name || 'unnamed'),
      commandsExecuted: totalCommands,
      lastPrompt: state.lastPrompt,
      events: state.events.slice(-50),
      rooms: state.rooms.slice(-30),
      channels: state.channels.slice(-20),
      errors: state.errors,
    };

    // Write JSON report
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const reportFile = path.join(reportDir, `session-${ts}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Write text summary (compact, for Mico to read)
    const summaryLines = [
      `=== SESSION REPORT: ${gameKey} ===`,
      `Duration: ${duration}s | Commands: ${totalCommands} | Phases: ${report.phases.join(', ')}`,
    ];

    if (state.lastPrompt) {
      summaryLines.push(`Status: HP ${state.lastPrompt.hp} | Mana ${state.lastPrompt.mana} | MV ${state.lastPrompt.mv}`);
    }

    if (state.events.length > 0) {
      summaryLines.push('', '--- Events ---');
      state.events.slice(-20).forEach(e => summaryLines.push(`  [${e.time}] ${e.type}: ${e.target || ''}`));
    }

    if (state.rooms.length > 0) {
      summaryLines.push('', '--- Rooms Visited ---');
      state.rooms.slice(-15).forEach(r => summaryLines.push(`  ${r.substring(0, 120)}`));
    }

    if (state.channels.length > 0) {
      summaryLines.push('', '--- Chat ---');
      state.channels.slice(-10).forEach(c => summaryLines.push(`  [${c.channel}] ${c.speaker}: ${c.msg}`));
    }

    // Last 1500 chars of raw output for context
    summaryLines.push('', '--- Recent Output (last 1500 chars) ---');
    const meaningful = state.buffer.replace(/\n{3,}/g, '\n\n');
    summaryLines.push(meaningful.slice(-1500));
    summaryLines.push('=== END ===');

    const summaryFile = path.join(reportDir, `session-${ts}.txt`);
    fs.writeFileSync(summaryFile, summaryLines.join('\n'));

    // Also write latest copies
    fs.writeFileSync(path.join(reportDir, 'latest-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(reportDir, 'latest-report.txt'), summaryLines.join('\n'));

    // Print summary to stdout — this is what Mico sees
    console.log(summaryLines.join('\n'));

    log('SYS', `Report saved: ${reportFile}`);
    return reportFile;
  }

  // --- Connect and run ---
  log('SYS', `Connecting to ${game.host}:${game.port}...`);

  const socket = net.createConnection({ host: game.host, port: game.port }, () => {
    log('SYS', 'Connected!');
  });

  socket.setEncoding('utf8');

  let pending = '';
  let debounceTimer = null;
  let loginResolve = null;
  const loginPromise = new Promise(r => { loginResolve = r; });

  function processData() {
    const data = pending;
    pending = '';
    const lower = data.toLowerCase();

    // Always extract events
    extractEvents(data);

    // Check wait-for patterns
    checkWaitFor(data);

    // --- Login state machine ---
    if (state.phase === 'connecting' && lower.includes(game.loginDetect)) {
      state.phase = 'login';
      setTimeout(() => send(game.name, 'name'), 500);
      return;
    }

    if (state.phase === 'login' && lower.includes(game.passwordDetect)) {
      state.phase = 'password';
      setTimeout(() => send(game.pass, 'password'), 500);
      return;
    }

    // Extra login steps (Discworld-specific)
    if (game.extraLogin && state.phase !== 'playing' && state.phase !== 'done') {
      for (const step of game.extraLogin) {
        if (new RegExp(step.detect, 'i').test(lower)) {
          setTimeout(() => send(step.send, 'extra-login'), 1000);
          return;
        }
      }
    }

    // Enter/more prompts
    if (state.phase !== 'playing' && state.phase !== 'done') {
      if (game.enterPrompts.test(lower)) {
        setTimeout(() => send('', 'enter'), 500);
        return;
      }
    }

    // Detect in-game
    if (state.phase !== 'playing' && state.phase !== 'done') {
      if (game.inGameDetect.test(data)) {
        state.phase = 'playing';
        log('SYS', '*** IN GAME ***');
        if (loginResolve) {
          loginResolve();
          loginResolve = null;
        }
        return;
      }
    }
  }

  socket.on('data', (raw) => {
    const data = clean(raw);
    state.buffer += data;
    pending += data;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processData, game.debounceMs);
  });

  socket.on('error', (err) => {
    log('ERR', `Connection error: ${err.message}`);
    state.errors.push(err.message);
  });

  socket.on('close', () => {
    log('SYS', 'Connection closed.');
    if (state.phase !== 'done') {
      generateReport();
    }
  });

  // Safety timeout
  const safetyTimer = setTimeout(() => {
    log('SYS', 'Session timeout.');
    state.phase = 'done';
    generateReport();
    socket.end();
    process.exit(0);
  }, sessionTimeout);

  // Wait for login, then execute phases
  await loginPromise;
  await sleep(1000);

  try {
    await executePhases();
  } catch (err) {
    log('ERR', `Phase execution error: ${err.message}`);
    state.errors.push(err.message);
  }

  // Clean quit
  state.phase = 'done';
  clearTimeout(safetyTimer);

  for (const cmd of game.quitCommands) {
    send(cmd, 'quit');
    await sleep(1000);
  }

  await sleep(2000);
  generateReport();
  socket.end();
  process.exit(0);
}

run().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
