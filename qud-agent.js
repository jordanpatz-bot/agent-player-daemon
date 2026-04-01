#!/usr/bin/env node
'use strict';
// qud-agent.js — Autonomous Caves of Qud agent.
// Communicates with the game via the typed harness protocol (request.json/response.json),
// with automatic fallback to legacy command.txt/result.json.
// Uses Claude CLI as the decision engine.
// Usage: node qud-agent.js [--turns N] [--model MODEL]

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { HarnessClient } = require('./harness-client');

// --- Config ---
const IPC_DIR = path.join(__dirname, 'mud-daemon', 'data', 'qud', 'ipc');
const JOURNAL_PATH = path.join(__dirname, 'qud-journal.json');
const REPORT_DIR = path.join(__dirname, 'reports');

const args = process.argv.slice(2);
const MAX_TURNS = parseInt(args.find((_, i, a) => a[i-1] === '--turns') || '50');
const ESCALATION_MODEL = args.find((_, i, a) => a[i-1] === '--model') || 'sonnet';
const BASE_MODEL = 'haiku';

fs.mkdirSync(REPORT_DIR, { recursive: true });

// --- Harness client (typed protocol with legacy fallback) ---
const harness = new HarnessClient(IPC_DIR);

/**
 * Execute a single game command. Accepts either:
 *   - A typed action object: {type: "movement.step", direction: "n"}
 *   - A raw command string: "move n" (sent via legacy path or converted to typed action)
 * @param {string|object} cmd
 * @param {number} [timeoutMs]
 * @returns {Promise<object>}
 */
async function executeStep(cmd, timeoutMs = 15000) {
  let result;
  if (typeof cmd === 'object' && cmd.type) {
    // Typed action — use harness performAction (tries typed protocol, falls back to legacy)
    result = await harness.performAction(cmd, { timeout: timeoutMs });
  } else {
    // Raw string command — use legacy command.txt path directly
    result = await harness.sendLegacyCommand(String(cmd), timeoutMs);
  }
  // Brief pause for game to settle
  await sleep(500);
  return result;
}

async function executePlan(steps) {
  const results = [];
  for (const step of steps) {
    const cmd = typeof step === 'string' ? step : step.command;
    if (!cmd) continue;

    log('CMD', cmd);
    const result = await executeStep(cmd, step.timeout || 15000);

    const failed = result.status === 'error' || result.status === 'timeout';
    let summary = '';
    if (result.npcText) summary = result.npcText.slice(0, 120);
    else if (result.message) summary = result.message;
    else if (result.status) summary = result.status;
    if (result.steps) summary += ` (${result.steps} steps)`;
    if (result.arrived !== undefined) summary += result.arrived ? ' [arrived]' : ' [not arrived]';

    log(failed ? 'FAIL' : ' OK ', summary.slice(0, 100));
    results.push({ command: cmd, result, failed, summary: summary.slice(0, 200) });

    if (result.choices) {
      const choiceList = result.choices.map(c => `  ${c.index}: "${c.text}" → ${c.target}`).join('\n');
      log('TALK', `Choices:\n${choiceList}`);
    }

    // Log quest actions from conversation choices (Change 4)
    if (result.questActions && result.questActions.length > 0) {
      for (const qa of result.questActions) {
        log('QUEST', `*** QUEST ACTION: ${qa.type || 'unknown'} — ${qa.questName || qa.questId || 'unnamed'} ***`);
        if (qa.description) log('QUEST', `  ${qa.description}`);
      }
    }

    // Brief pause between steps for the game to settle
    await sleep(800);
  }
  return results;
}

// --- Autonomous Behavior Modes ---
// These run without LLM calls, executing simple loops.

async function modeHunt(maxSteps = 15) {
  log('MODE', `HUNT mode (${maxSteps} steps max)`);
  const events = [];
  let kills = 0;

  for (let i = 0; i < maxSteps; i++) {
    const state = readState();
    if (!state) break;

    // Emergency heal
    if (state.hp < state.maxHp * 0.3) {
      log('HUNT', `LOW HP (${state.hp}/${state.maxHp}) — eating and fleeing`);
      await harness.eat();
      events.push(`Healed at HP ${state.hp}/${state.maxHp}`);
      break;
    }

    // Find nearest hostile
    const hostiles = (state.entities || []).filter(e => e.hostile);
    if (hostiles.length === 0) {
      log('HUNT', 'No hostiles in zone. Trying autoexplore.');
      await harness.move('e');
      await sleep(300);
      continue;
    }

    // Pick weakest hostile
    hostiles.sort((a, b) => a.hp - b.hp);
    const target = hostiles[0];
    const dist = Math.abs(target.x - state.position.x) + Math.abs(target.y - state.position.y);
    log('HUNT', `Target: ${target.name} (${target.hp}hp) dist=${dist}`);

    if (dist > 1) {
      // Navigate to target
      const r = await harness.navigateTo({ x: target.x, y: target.y });
      if (r.status === 'error') {
        // Manual movement toward target
        const dx = target.x - state.position.x;
        const dy = target.y - state.position.y;
        let dir = '';
        if (dy < 0) dir += 'n';
        if (dy > 0) dir += 's';
        if (dx > 0) dir += 'e';
        if (dx < 0) dir += 'w';
        await harness.move(dir || 'n');
      }
    } else {
      // In Qud, you attack by moving INTO the hostile creature
      const dx = target.x - state.position.x;
      const dy = target.y - state.position.y;
      let dir = '';
      if (dy < 0) dir = 'n';
      else if (dy > 0) dir = 's';
      if (dx > 0) dir += 'e';
      else if (dx < 0) dir += 'w';
      if (!dir) dir = 'n';

      await harness.move(dir);
      events.push(`Attacked ${target.name} (move ${dir})`);

      // Check if target died
      await sleep(500);
      const newState = readState();
      const stillThere = (newState?.entities || []).find(e =>
        e.x === target.x && e.y === target.y && e.name === target.name);
      if (!stillThere) {
        kills++;
        events.push(`Killed ${target.name}!`);
        log('HUNT', `KILL: ${target.name}`);
        // Try to pick up loot
        await harness.navigateTo({ x: target.x, y: target.y });
        await sleep(300);
      }
    }
    await sleep(300);
  }

  const finalState = readState();
  log('HUNT', `Done. ${kills} kills. HP: ${finalState?.hp}/${finalState?.maxHp}`);
  return { mode: 'hunt', kills, events, hp: `${finalState?.hp}/${finalState?.maxHp}` };
}

async function modeExplore(maxSteps = 20) {
  log('MODE', `EXPLORE mode (${maxSteps} steps max)`);
  const events = [];
  const startZone = readState()?.zone;
  let tilesExplored = 0;

  for (let i = 0; i < maxSteps; i++) {
    const state = readState();
    if (!state) break;

    // Emergency check
    if (state.hp < state.maxHp * 0.3) {
      log('EXPL', `LOW HP — stopping exploration`);
      await harness.eat();
      events.push('Stopped: low HP');
      break;
    }

    // Check for hostiles
    const hostiles = (state.entities || []).filter(e => e.hostile);
    if (hostiles.length > 0) {
      const nearest = hostiles.sort((a, b) => {
        const da = Math.abs(a.x - state.position.x) + Math.abs(a.y - state.position.y);
        const db = Math.abs(b.x - state.position.x) + Math.abs(b.y - state.position.y);
        return da - db;
      })[0];
      const dist = Math.abs(nearest.x - state.position.x) + Math.abs(nearest.y - state.position.y);
      if (dist < 5) {
        events.push(`Hostile nearby: ${nearest.name} (dist ${dist})`);
        log('EXPL', `Hostile ${nearest.name} at dist ${dist} — switching to hunt`);
        const huntResult = await modeHunt(8);
        events.push(...huntResult.events);
        continue;
      }
    }

    // Zone transition check
    if (state.zone !== startZone) {
      events.push(`Entered new zone: ${state.zoneName}`);
      log('EXPL', `New zone: ${state.zoneName}`);
    }

    // Move in a pattern — explore edges then center
    const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const dir = dirs[i % dirs.length];
    const r = await harness.move(dir);
    if (r.status === 'ok' || r.moved) tilesExplored++;

    // Check for items on ground periodically
    if (i % 5 === 0) {
      await harness.examine('surroundings');
    }

    await sleep(300);
  }

  log('EXPL', `Done. ${tilesExplored} tiles moved.`);
  return { mode: 'explore', tilesExplored, events, zone: readState()?.zoneName };
}

async function modeHeal() {
  log('MODE', 'HEAL mode');
  const state = readState();
  if (!state) return { mode: 'heal', events: ['No state'] };

  const events = [];
  if (state.hp < state.maxHp) {
    await harness.eat();
    events.push('Ate food');
    await sleep(500);
    await harness.drink();
    events.push('Drank water');
    await sleep(500);
    await harness.rest();
    events.push('Resting...');
    await sleep(2000);
  }

  const newState = readState();
  events.push(`HP: ${newState?.hp}/${newState?.maxHp}`);
  log('HEAL', `HP: ${newState?.hp}/${newState?.maxHp}`);
  return { mode: 'heal', events };
}

async function modeShop(merchantName) {
  log('MODE', `SHOP mode — trading with ${merchantName}`);
  const events = [];

  // Navigate to merchant
  const navResult = await harness.navigateTo(merchantName);
  if (navResult.status === 'error') {
    events.push(`Could not reach ${merchantName}: ${navResult.message}`);
    return { mode: 'shop', events };
  }

  // View their inventory
  const tradeResult = await harness.trade(merchantName);
  if (tradeResult.items) {
    events.push(`${merchantName} has ${tradeResult.items.length} items`);
    log('SHOP', `${tradeResult.items.length} items available`);
    // Log interesting items
    for (const item of (tradeResult.items || []).slice(0, 10)) {
      log('SHOP', `  ${item.name} — ${item.value} drams`);
    }
  }

  return { mode: 'shop', events, items: (tradeResult.items || []).length };
}

// Execute a behavior mode
async function executeMode(mode, params = {}) {
  switch (mode) {
    case 'hunt': return modeHunt(params.maxSteps || 15);
    case 'explore': return modeExplore(params.maxSteps || 20);
    case 'heal': return modeHeal();
    case 'shop': return modeShop(params.merchant || 'merchant');
    default: return { mode, events: ['Unknown mode'] };
  }
}

// --- State reading (via harness client) ---
function readState() {
  return harness.readState();
}

// --- Journal ---
function readJournal() {
  try {
    return JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8'));
  } catch {
    return {
      turns: [],
      objectives: ['Explore Joppa and talk to NPCs to get quests'],
      discoveries: [],
      deaths: 0,
      startTime: new Date().toISOString(),
      zoneMap: {},
      positionHistory: [],
      navFailStreak: 0,
    };
  }
}

function writeJournal(journal) {
  if (journal.turns.length > 100) journal.turns = journal.turns.slice(-100);
  // Cap position history at 20 entries
  if (journal.positionHistory && journal.positionHistory.length > 20) {
    journal.positionHistory = journal.positionHistory.slice(-20);
  }
  // Cap zone map — keep all entries (they're keyed by zone ID, won't grow unboundedly in practice)
  const tmp = JOURNAL_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(journal, null, 2));
  fs.renameSync(tmp, JOURNAL_PATH);
}

// --- Zone Map Memory ---
// Tracks every zone visited, what's in it, and connections between zones.
function updateZoneMap(journal, state, prevState) {
  if (!state || !state.zone) return;
  if (!journal.zoneMap) journal.zoneMap = {};

  const zoneId = state.zone;
  const hostiles = (state.entities || []).filter(e => e.hostile);
  const notableNPCs = (state.entities || []).filter(e =>
    !e.hostile && e.name && !['wall', 'door'].includes(e.name.toLowerCase())
  ).map(e => e.name);
  // Deduplicate NPC names
  const uniqueNPCs = [...new Set(notableNPCs)];

  if (!journal.zoneMap[zoneId]) {
    // First visit — record entry info
    let entryDir = null;
    let entryPos = null;
    if (prevState && prevState.zone !== zoneId) {
      // We transitioned from prevState's zone
      entryPos = { x: state.position?.x, y: state.position?.y };
      // Infer entry direction from position on zone edge
      const px = state.position?.x || 0;
      const py = state.position?.y || 0;
      if (py <= 1) entryDir = 'from_south'; // appeared at top = came from south
      else if (py >= 23) entryDir = 'from_north';
      if (px <= 1) entryDir = (entryDir ? entryDir + '_and_' : '') + 'from_east';
      else if (px >= 78) entryDir = (entryDir ? entryDir + '_and_' : '') + 'from_west';
      if (!entryDir) entryDir = 'unknown';
    }
    journal.zoneMap[zoneId] = {
      zoneName: state.zoneName,
      firstVisited: new Date().toISOString(),
      entryPos,
      entryDir,
      connections: [],
      notableNPCs: uniqueNPCs,
      hostileCount: hostiles.length,
      visitCount: 1,
    };
  } else {
    // Revisit — update info
    const entry = journal.zoneMap[zoneId];
    entry.visitCount = (entry.visitCount || 0) + 1;
    entry.hostileCount = hostiles.length;
    // Merge in any new NPCs
    const existingNPCs = new Set(entry.notableNPCs || []);
    for (const npc of uniqueNPCs) existingNPCs.add(npc);
    entry.notableNPCs = [...existingNPCs];
  }

  // Record zone connection if we transitioned
  if (prevState && prevState.zone && prevState.zone !== zoneId) {
    const fromId = prevState.zone;
    const toId = zoneId;
    // Add connection on the source zone
    if (journal.zoneMap[fromId]) {
      const conns = journal.zoneMap[fromId].connections;
      if (!conns.find(c => c.toZone === toId)) {
        conns.push({ toZone: toId, toName: state.zoneName });
      }
    }
    // Add reverse connection on current zone
    const conns = journal.zoneMap[toId].connections;
    if (!conns.find(c => c.toZone === fromId)) {
      conns.push({ toZone: fromId, toName: prevState.zoneName || fromId });
    }
  }
}

function summarizeZoneMap(journal) {
  if (!journal.zoneMap || Object.keys(journal.zoneMap).length === 0) return '';
  const lines = ['ZONE MAP (visited zones):'];
  for (const [zoneId, info] of Object.entries(journal.zoneMap)) {
    const connStr = (info.connections || []).map(c => c.toName || c.toZone).join(', ');
    const npcStr = (info.notableNPCs || []).slice(0, 5).join(', ');
    lines.push(`  ${info.zoneName} [${zoneId}] visits:${info.visitCount} hostiles:${info.hostileCount} NPCs:[${npcStr}] connects:[${connStr}]${info.entryDir ? ' entry:' + info.entryDir : ''}`);
  }
  return lines.join('\n');
}

// --- Stuck Detection ---
// Track position history and detect when the agent is stuck.
function updatePositionHistory(journal, state) {
  if (!state || !state.position) return;
  if (!journal.positionHistory) journal.positionHistory = [];
  journal.positionHistory.push({
    x: state.position.x,
    y: state.position.y,
    zone: state.zone,
    turn: state.turn,
  });
  // Keep last 20
  if (journal.positionHistory.length > 20) {
    journal.positionHistory = journal.positionHistory.slice(-20);
  }
}

function detectStuck(journal) {
  if (!journal.positionHistory || journal.positionHistory.length < 5) return null;
  const last5 = journal.positionHistory.slice(-5);

  // Check if all in the same zone
  const sameZone = last5.every(p => p.zone === last5[0].zone);
  if (!sameZone) return null; // zone transitions = not stuck

  // Check if position hasn't changed significantly (within 3 tiles of mean) for 3+ turns
  const xs = last5.map(p => p.x);
  const ys = last5.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spread = Math.max(maxX - minX, maxY - minY);

  if (spread <= 3 && last5.length >= 3) {
    return {
      stuck: true,
      reason: 'position_unchanged',
      positions: last5.map(p => `(${p.x},${p.y})`),
      spread,
    };
  }
  return null;
}

function trackNavigateFailures(journal, lastPlanResults) {
  if (!lastPlanResults) return;
  if (!journal.navFailStreak) journal.navFailStreak = 0;

  const navResults = lastPlanResults.filter(r =>
    r.command && r.command.startsWith('navigate') && r.failed
  );
  if (navResults.length > 0) {
    journal.navFailStreak += navResults.length;
  } else {
    // Reset if we had a successful navigate or no navigate commands
    const anyNav = lastPlanResults.some(r => r.command && r.command.startsWith('navigate'));
    if (anyNav) journal.navFailStreak = 0;
  }
}

function isNavStuck(journal) {
  return (journal.navFailStreak || 0) >= 3;
}

// --- Model Selection (Haiku default, Sonnet escalation) ---
function pickModel(state, lastPlanResults, journal) {
  // Check for conversation choices (>2 choices)
  if (lastPlanResults) {
    for (const r of lastPlanResults) {
      if (r.result?.choices && r.result.choices.length > 2) {
        log('MODEL', `Escalating to ${ESCALATION_MODEL}: conversation with ${r.result.choices.length} choices`);
        return ESCALATION_MODEL;
      }
    }
  }

  // Check for zone change
  if (journal.positionHistory && journal.positionHistory.length >= 2) {
    const hist = journal.positionHistory;
    const curr = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    if (curr && prev && curr.zone !== prev.zone) {
      log('MODEL', `Escalating to ${ESCALATION_MODEL}: new zone entered`);
      return ESCALATION_MODEL;
    }
  }

  // Check for stuck detection
  const stuckInfo = detectStuck(journal);
  if (stuckInfo || isNavStuck(journal)) {
    log('MODEL', `Escalating to ${ESCALATION_MODEL}: stuck detected`);
    return ESCALATION_MODEL;
  }

  // Check HP below 50%
  if (state && state.hp && state.maxHp && state.hp < state.maxHp * 0.5) {
    log('MODEL', `Escalating to ${ESCALATION_MODEL}: HP below 50% (${state.hp}/${state.maxHp})`);
    return ESCALATION_MODEL;
  }

  return BASE_MODEL;
}

// --- State summary (compact) ---
function summarizeState(state) {
  if (!state) return 'NO GAME STATE. Is Caves of Qud running with AgentBridge mod?';

  const adj = (state.adjacent || []).map(a => {
    let tags = [];
    if (a.hostile) tags.push('HOSTILE');
    if (a.hasTrade) tags.push('trade');
    if (a.hasConversation) tags.push('talk');
    return `${a.name} [${a.direction}] (${tags.join(',')})`;
  }).join('; ');

  const entities = (state.entities || []).map(e =>
    `${e.name}@(${e.x},${e.y})${e.hostile ? ' HOSTILE' : ''} ${e.hp}/${e.maxHp}hp`
  ).join('; ');

  const inv = (state.inventory || []).join('; ');
  const equip = Object.entries(state.equipment || {}).map(([k,v]) => `${k}:${v}`).join('; ');
  const quests = (state.quests || []).map(q => q.name || q).join('; ');

  // Separate hostile and non-hostile entities
  const hostiles = (state.entities || []).filter(e => e.hostile);
  const friendlies = (state.entities || []).filter(e => !e.hostile);
  const hostileStr = hostiles.length > 0
    ? hostiles.map(e => {
        const idTag = e.id ? ` [${e.id}]` : '';
        return `${e.name}${idTag} @(${e.x},${e.y}) ${e.hp}/${e.maxHp}hp`;
      }).join('; ')
    : 'none';
  const friendlyStr = friendlies.slice(0, 10).map(e => {
    const idTag = e.id ? ` [${e.id}]` : '';
    return `${e.name}${idTag} @(${e.x},${e.y})`;
  }).join('; ');

  // Interaction state (gracefully handle missing fields)
  const interaction = state.interaction || {};
  let interactionStr = 'INTERACTION: ';
  if (interaction.conversationActive) {
    interactionStr += `conversation active${interaction.currentConversationNode ? ' (node: ' + interaction.currentConversationNode + ')' : ''}`;
  } else {
    interactionStr += 'no conversation';
  }
  interactionStr += interaction.popupActive ? ' | POPUP ACTIVE' : ' | no popup';
  if (interaction.blocking) interactionStr += ' [BLOCKING]';

  // Events (gracefully handle missing field)
  let eventsStr = '';
  if (state.events && state.events.length > 0) {
    const eventDescriptions = state.events.map(ev => {
      if (ev.type === 'quest.started') return `quest.started(${ev.questId || '?'})`;
      if (ev.type === 'zone.entered') return `zone.entered(${ev.zone || ev.zoneName || '?'})`;
      if (ev.type === 'damage.taken') return `damage.taken(${ev.amount || '?'}hp)`;
      if (ev.type === 'damage.dealt') return `damage.dealt(${ev.amount || '?'}hp to ${ev.target || '?'})`;
      if (ev.type === 'item.picked_up') return `item.picked_up(${ev.item || '?'})`;
      if (ev.type === 'entity.killed') return `entity.killed(${ev.target || '?'})`;
      if (ev.type === 'level.up') return `level.up(${ev.level || '?'})`;
      // Generic fallback: type + any extra key
      const extraKeys = Object.keys(ev).filter(k => k !== 'type' && k !== 'turn');
      const extras = extraKeys.map(k => `${k}=${ev[k]}`).join(',');
      return `${ev.type}(${extras || ''})`;
    });
    eventsStr = `EVENTS: ${eventDescriptions.join(' | ')}`;
  }

  return `NAME: ${state.name} LVL${state.level} HP:${state.hp}/${state.maxHp} XP:${state.xp}
POS: (${state.position?.x},${state.position?.y}) ${state.zoneName} [${state.zone}] Turn:${state.turn}
AV:${state.av} DV:${state.dv}
EQUIP: ${equip}
INV: ${inv}
EFFECTS: ${(state.effects || []).join(', ') || 'none'}
QUESTS: ${quests || 'none tracked by game'}
${interactionStr}
HOSTILE ENTITIES: ${hostileStr}
ADJACENT: ${adj || 'nobody adjacent'}
NEARBY NPCS: ${friendlyStr || 'none'}${eventsStr ? '\n' + eventsStr : ''}${summarizeKnownLocations(state)}`;
}

function summarizeKnownLocations(state) {
  const locs = state.knownLocations || [];
  if (locs.length === 0) return '';
  const locStrs = locs.slice(0, 15).map(l => `${l.name} [${l.zoneId}]`).join('; ');
  return `\nKNOWN LOCATIONS: ${locStrs}`;
}

// --- LLM prompt ---
const SYSTEM_PROMPT = `You are an autonomous agent playing Caves of Qud, a post-apocalyptic science-fantasy roguelike.

COMMANDS:
- navigate <name|x y> — A* pathfind to NPC/coords. May fail if NPCs block path.
- talkto <name> — walk to NPC + start conversation. Returns text + numbered choices.
- choose <N> — pick dialog choice N. CRITICAL: N must be an index from the CHOICES list. 0-indexed.
- move <dir> — move 1 tile (n/s/e/w/ne/nw/se/sw). Use when navigate fails.
- attack <name|dir> — melee attack target or direction
- trade <name> — view merchant inventory (must be adjacent)
- examine <name> — inspect entity/item
- Commands that take a target name can also use entity IDs (e.g., "navigate ent_abc123", "attack ent_abc123"). Entity IDs appear in brackets in the state like [ent_abc123].
- eat / drink — consume food/water
- equip <item> — equip from inventory
- pickup <item> — grab from ground
- activate <ability> — use mutation/ability
- worldnav <location> — look up a known world location from journal. Returns zone ID and direction/distance. Use "worldnav list" to see all known locations. Then use move commands to travel in that direction across zone boundaries.
- worldnav is for PLANNING — it tells you where to go, then you move there manually via zone transitions.
- status — full character dump
- rest — heal to full (safe areas)
- save — save game

CRITICAL RULES FOR CONVERSATIONS:
1. After 'talkto', you get CHOICES with indices [0], [1], [2], etc. ONLY use those exact indices.
2. If you see 1 choice, the only valid command is 'choose 0'. Do NOT try choose 1, 2, etc.
3. If choices are empty (0 choices), the conversation ended. Do NOT send choose at all.
4. COMPLETE full conversations — keep choosing until conversation ends.
5. QUEST PRIORITY: When you see choices like "I'm looking for work" or "fetch" — ALWAYS pick those.
   When Irudad shows 9 choices, pick index 3 or 4 ("I'm looking for work"), NOT index 1 ("What is this place?").
6. Quest tracking: The game's quest log doesn't update from conversations. Track quests yourself based on NPC text.

NAVIGATION:
- North=Y decreases, South=Y increases, East=X increases, West=X decreases. Diagonals work.
- When navigate fails: calculate direction manually and use 'move' commands.
- Zone edges: moving off-screen (x<0 or x>79 or y<0 or y>24) transitions to adjacent zone.
- To find caves: explore zone edges, go underground via staircases (> symbol), check entity list for cave entrances.

EXPLORATION:
- After entering a new zone, check the ENTITIES list for interesting things (creatures, NPCs, items).
- Hostile creatures appear in ENTITIES with hostile=true. Engage weak ones, flee strong ones.
- Use 'examine' on unfamiliar things. Use 'pickup' for items on ground.
- Caves contain knickknacks (quest items) and monsters. Be prepared before entering.

STARTING VILLAGE:
You may start in Joppa (most common) or another village (Issachari camps, etc).
In ANY village: find the village elder/leader, tinker, merchant. Talk to them for quests.
If Joppa: Elder Irudad (work quest), Argyve (knickknack→main story), Tam (merchant), Mehmet (vermin)
If elsewhere: explore, talk to all named NPCs (not generic "raider"), find the tinker and elder.
Quest flow: village quests → explore nearby → caves for items → return → advance main story → Grit Gate

RESPOND WITH ONLY JSON. Two response formats:

1. MANUAL ACTIONS (conversations, specific navigation, etc):
{"reasoning":"what and why","objectives":["goals"],"mode":"manual","steps":[{"command":"cmd"}]}

2. AUTONOMOUS MODE (let the daemon handle it):
{"reasoning":"what and why","objectives":["goals"],"mode":"hunt|explore|heal|shop","params":{"maxSteps":15,"merchant":"name"}}

Modes: "hunt" scans for hostiles, attacks weakest, flees if HP<30%. "explore" wanders zone, picks up items, auto-fights. "heal" eats/drinks/rests. "shop" navigates to merchant and views inventory.
Use modes for grinding/traveling. Use manual for conversations, quest-specific actions, and decisions.`;

function buildPrompt(state, journal, lastPlanResults) {
  const stateSummary = summarizeState(state);
  const recent = journal.turns.slice(-12).map(t =>
    `[T${t.turn}] ${t.action} → ${t.outcome}`
  ).join('\n');

  let lastResults = '';
  if (lastPlanResults) {
    lastResults = 'LAST PLAN RESULTS:\n' + lastPlanResults.map(r => {
      let line = `  ${r.command}: ${r.failed ? 'FAIL' : 'OK'} — ${r.summary}`;
      // Include choices so LLM knows valid indices
      if (r.result?.choices?.length > 0) {
        line += '\n    CHOICES: ' + r.result.choices.map(c =>
          `[${c.index}] "${c.text.slice(0, 60)}" → ${c.target}`
        ).join('; ');
      } else if (r.result?.choices?.length === 0) {
        line += '\n    (conversation ended — no more choices)';
      }
      return line;
    }).join('\n');
  }

  // Zone map summary
  const zoneMapStr = summarizeZoneMap(journal);

  // Stuck detection warning
  let stuckWarning = '';
  const stuckInfo = detectStuck(journal);
  if (stuckInfo) {
    stuckWarning = `\n*** WARNING: You appear STUCK. Your last 5 positions were: ${stuckInfo.positions.join(', ')}. Spread: ${stuckInfo.spread} tiles. Consider backtracking the way you came or trying a completely different direction. ***\n`;
  }
  if (isNavStuck(journal)) {
    stuckWarning += `\n*** WARNING: Navigation has failed ${journal.navFailStreak} times in a row. Stop using 'navigate' and use manual 'move' commands instead. Try a completely different direction. ***\n`;
  }

  // Popup blocking warning
  let popupWarning = '';
  const interaction = state?.interaction || {};
  if (interaction.popupActive) {
    popupWarning = `\n*** WARNING: A POPUP is blocking the game. You must dismiss it before other commands will work. Try 'choose 0' or an appropriate dismiss action. ***\n`;
  }

  return `${stateSummary}

OBJECTIVES: ${journal.objectives.join('; ')}

${zoneMapStr}

RECENT HISTORY:
${recent || '(first turn)'}

${lastResults}
${stuckWarning}${popupWarning}
What's your next action?`;
}

// --- LLM call ---
async function callLLM(userPrompt, model) {
  const useModel = model || BASE_MODEL;
  const fullPrompt = SYSTEM_PROMPT + '\n\n---\n\n' + userPrompt;

  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', useModel, '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${stderr}`));
      resolve(stdout.trim());
    });
    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

function parseLLMResponse(raw) {
  // Extract JSON, handling markdown code blocks
  let text = raw;
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) text = codeBlock[1].trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];
  try { return JSON.parse(text); }
  catch (e) {
    log('PARSE', `Failed: ${e.message} — raw: ${raw.slice(0, 300)}`);
    return null;
  }
}

// --- Logging ---
function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] [${tag.padEnd(5)}] ${msg}`;
  console.log(line);
  // Also append to log file
  try {
    fs.appendFileSync(path.join(__dirname, 'qud-agent.log'), line + '\n');
  } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Typed Action Schema (internal, for logging and future use) ---
function buildTypedAction(cmd) {
  const parts = cmd.split(/\s+/);
  const action = parts[0];
  const args = parts.slice(1).join(' ');

  const schema = {
    'navigate': { type: 'movement.navigate', target: args },
    'talkto': { type: 'interact.talk', target: args },
    'choose': { type: 'interact.choose_dialogue', choice: parseInt(args) },
    'move': { type: 'movement.step', direction: args },
    'attack': { type: 'combat.melee', target: args },
    'trade': { type: 'interact.trade', target: args },
    'examine': { type: 'observe.examine', target: args },
    'eat': { type: 'survival.eat' },
    'drink': { type: 'survival.drink' },
    'rest': { type: 'survival.rest' },
    'save': { type: 'system.save' },
    'equip': { type: 'inventory.equip', item: args },
    'pickup': { type: 'inventory.pickup', item: args },
    'activate': { type: 'ability.activate', ability: args },
    'status': { type: 'observe.status' },
    'look': { type: 'observe.look' },
  };

  return schema[action] || { type: 'raw', command: cmd };
}

// --- Main loop ---
async function main() {
  log('AGENT', `Qud autonomous agent starting (${MAX_TURNS} turns, base: ${BASE_MODEL}, escalation: ${ESCALATION_MODEL})`);
  log('AGENT', `IPC dir: ${IPC_DIR}`);

  // Check game state
  const initState = readState();
  if (!initState) {
    log('AGENT', 'No state.json found. Is Caves of Qud running with the AgentBridge mod?');
    log('AGENT', 'Waiting for game to start...');
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      if (readState()) { log('AGENT', 'Game detected!'); break; }
    }
    if (!readState()) {
      log('AGENT', 'Timed out waiting for game. Exiting.');
      return;
    }
  }

  const journal = readJournal();
  // Initialize new journal fields if missing
  if (!journal.zoneMap) journal.zoneMap = {};
  if (!journal.positionHistory) journal.positionHistory = [];
  if (!journal.navFailStreak) journal.navFailStreak = 0;

  let lastPlanResults = null;
  let consecutiveErrors = 0;
  let prevState = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    log('AGENT', `════ TURN ${turn + 1}/${MAX_TURNS} ════`);

    const state = readState();
    if (!state) {
      log('AGENT', 'Lost game state. Waiting...');
      await sleep(5000);
      continue;
    }

    log('STATE', `${state.name} HP:${state.hp}/${state.maxHp} (${state.position?.x},${state.position?.y}) ${state.zoneName} T${state.turn}`);

    // Update zone map and position history
    updateZoneMap(journal, state, prevState);
    updatePositionHistory(journal, state);
    trackNavigateFailures(journal, lastPlanResults);

    // Check HP - emergency heal
    if (state.hp < state.maxHp * 0.5 && state.hp > 0) {
      log('AGENT', 'LOW HP — auto-healing');
      await harness.eat();
      await sleep(500);
      await harness.rest();
      await sleep(1000);
    }

    // Stuck detection logging
    const stuckInfo = detectStuck(journal);
    if (stuckInfo) {
      log('STUCK', `Position stuck! Last 5 positions: ${stuckInfo.positions.join(', ')} (spread: ${stuckInfo.spread})`);
    }
    if (isNavStuck(journal)) {
      log('STUCK', `Navigate failed ${journal.navFailStreak} times in a row`);
    }

    // Pick model based on current conditions
    const model = pickModel(state, lastPlanResults, journal);
    log('MODEL', `Using: ${model}`);

    // Call LLM
    const prompt = buildPrompt(state, journal, lastPlanResults);
    log('LLM  ', 'Thinking...');

    let response;
    try {
      response = await callLLM(prompt, model);
      consecutiveErrors = 0;
    } catch (e) {
      consecutiveErrors++;
      log('ERROR', `LLM call failed (${consecutiveErrors}/3): ${e.message}`);
      if (consecutiveErrors >= 3) { log('AGENT', 'Too many LLM errors. Stopping.'); break; }
      await sleep(5000);
      continue;
    }

    const decision = parseLLMResponse(response);
    if (!decision) {
      consecutiveErrors++;
      log('ERROR', `Bad LLM response (${consecutiveErrors}/3). Raw: ${response.slice(0, 200)}`);
      if (consecutiveErrors >= 3) break;
      continue;
    }

    // Validate response has either steps or a mode
    if (!decision.steps && !decision.mode) {
      consecutiveErrors++;
      log('ERROR', `LLM response has neither steps nor mode (${consecutiveErrors}/3)`);
      if (consecutiveErrors >= 3) break;
      continue;
    }

    log('THINK', decision.reasoning || '(no reasoning)');
    if (decision.objectives) journal.objectives = decision.objectives;

    let outcomeStr, details;
    let typedActions = [];
    let questActions = [];

    if (decision.mode && decision.mode !== 'manual') {
      // Autonomous behavior mode
      log('MODE ', `Entering ${decision.mode} mode`);
      const modeResult = await executeMode(decision.mode, decision.params || {});
      lastPlanResults = [{ command: `mode:${decision.mode}`, result: modeResult, failed: false, summary: (modeResult.events || []).join('; ') }];
      outcomeStr = `${decision.mode}: ${(modeResult.events || []).join('; ')}`;
      details = JSON.stringify(modeResult).slice(0, 300);
      typedActions.push(buildTypedAction(`mode:${decision.mode}`));
    } else {
      // Manual plan execution
      if (!decision.steps || !Array.isArray(decision.steps)) {
        log('ERROR', 'Manual mode but no steps array');
        continue;
      }
      const steps = decision.steps.map(s => typeof s === 'string' ? s : s.command || s);
      log('PLAN ', steps.join(' → '));

      // Build typed actions for logging
      for (const s of steps) {
        const typed = buildTypedAction(s);
        typedActions.push(typed);
        log('TYPED', `${s} → ${JSON.stringify(typed)}`);
      }

      const results = await executePlan(decision.steps);
      lastPlanResults = results;
      outcomeStr = results.map(r => `${r.command}:${r.failed?'FAIL':'OK'}`).join('; ');
      details = results.map(r => r.summary).join(' | ');

      // Collect quest actions from results (Change 4 — add to journal)
      for (const r of results) {
        if (r.result?.questActions && r.result.questActions.length > 0) {
          questActions.push(...r.result.questActions);
        }
      }
    }

    // Record in journal (with typed actions and quest actions)
    const journalEntry = {
      turn: turn + 1,
      gameTurn: state.turn,
      action: decision.reasoning || outcomeStr,
      outcome: outcomeStr,
      details,
      typedActions,
      timestamp: new Date().toISOString(),
    };
    if (questActions.length > 0) {
      journalEntry.questActions = questActions;
      // Also add quest discoveries
      for (const qa of questActions) {
        const desc = `Quest: ${qa.type || 'action'} — ${qa.questName || qa.questId || 'unknown'}`;
        if (!journal.discoveries) journal.discoveries = [];
        if (!journal.discoveries.includes(desc)) {
          journal.discoveries.push(desc);
          log('JRNL', `New discovery: ${desc}`);
        }
      }
    }
    journal.turns.push(journalEntry);

    // Save prevState for next turn's zone transition detection
    prevState = state;

    writeJournal(journal);

    // Check for death
    await sleep(500);
    const newState = readState();
    if (newState && newState.hp <= 0) {
      log('AGENT', 'CHARACTER DIED!');
      journal.deaths++;
      writeJournal(journal);
      break;
    }

    await sleep(1500);
  }

  // Final report
  const finalState = readState();
  const report = generateReport(journal, finalState);
  const reportFile = path.join(REPORT_DIR, `qud-agent-${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.md`);
  fs.writeFileSync(reportFile, report);
  log('AGENT', `Session report: ${reportFile}`);
  log('AGENT', 'Done.');
}

function generateReport(journal, state) {
  return `# Qud Agent Session Report
**Date:** ${new Date().toISOString()}
**Character:** ${state?.name || '?'} | Level ${state?.level || '?'} | HP ${state?.hp || '?'}/${state?.maxHp || '?'}
**Location:** ${state?.zoneName || '?'} (${state?.position?.x || '?'},${state?.position?.y || '?'})
**Turns Played:** ${journal.turns.length} | Deaths: ${journal.deaths}
**Model:** base=${BASE_MODEL}, escalation=${ESCALATION_MODEL}

## Final Objectives
${journal.objectives.map(o => '- ' + o).join('\n')}

## Turn Log
${journal.turns.map(t => `- **T${t.turn}** [game ${t.gameTurn}]: ${t.action}
  Result: ${t.outcome}
  ${t.details ? 'Detail: ' + t.details : ''}`).join('\n')}
`;
}

main().catch(e => {
  log('FATAL', e.stack || e.message);
  process.exit(1);
});
