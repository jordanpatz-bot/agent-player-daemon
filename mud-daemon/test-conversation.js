#!/usr/bin/env node
'use strict';
// test-conversation.js — Evaluation test suite for conversation middleware.
// Runs without a MUD connection. Feeds scripted text and verifies behavior.

const { ConversationMiddleware, TAGS, OBLIGATION_THRESHOLD } = require('./conversation-middleware');
const { WorldModel } = require('./world-model');
const { loadServerProfile } = require('./server-profile');

let passed = 0;
let failed = 0;
let currentTest = '';

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${currentTest} — ${msg}`);
  }
}

function test(name, fn) {
  currentTest = name;
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`  ERROR: ${name} — ${e.message}`);
  }
}

function makeMiddleware(profileName = 'aardwolf', charName = 'Testchar') {
  const sp = loadServerProfile(profileName);
  const wm = new WorldModel({ name: charName, class: 'warrior', level: 5 });
  wm.updateSelf({ hp: 200, maxHp: 200, mana: 100, maxMana: 100 });
  return new ConversationMiddleware({
    worldModel: wm,
    serverProfile: sp,
    characterName: charName,
  });
}

// ============================================================
console.log('\n=== TEST 1: Classifier Accuracy (Aardwolf) ===');
// ============================================================

test('Tell is DIRECT_ADDRESS', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Kira tells you 'hey can you heal?'");
  assert(c.tag === TAGS.DIRECT_ADDRESS, `Expected DIRECT_ADDRESS, got ${c.tag}`);
  assert(c.speaker === 'Kira', `Expected speaker Kira, got ${c.speaker}`);
});

test('Say without name is GROUP_AMBIENT', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Wulfgar says 'nice fight everyone'");
  assert(c.tag === TAGS.GROUP_AMBIENT, `Expected GROUP_AMBIENT, got ${c.tag}`);
});

test('Say WITH our name is DIRECT_ADDRESS', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Kira says 'Testchar, can you tank?'");
  assert(c.tag === TAGS.DIRECT_ADDRESS, `Expected DIRECT_ADDRESS, got ${c.tag}`);
});

test('Gossip is CHANNEL_CHATTER', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("[Gossip] Someone: anyone seen the dragon?");
  assert(c.tag === TAGS.CHANNEL_CHATTER, `Expected CHANNEL_CHATTER, got ${c.tag}`);
});

test('Combat text is NON_SOCIAL', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Your slash DECIMATES a viper!");
  assert(c.tag === TAGS.NON_SOCIAL, `Expected NON_SOCIAL, got ${c.tag}`);
});

test('Player marker is SYSTEM_SOCIAL', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("(Player) Artephius the Barbarian.");
  assert(c.tag === TAGS.SYSTEM_SOCIAL, `Expected SYSTEM_SOCIAL, got ${c.tag}`);
});

test('Say during combat is COMBAT_CALLOUT', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.worldModel.updateSelf({ inCombat: true });
  const c = mw.classifyLine("Kira says 'focus the mage!'");
  assert(c.tag === TAGS.COMBAT_CALLOUT, `Expected COMBAT_CALLOUT, got ${c.tag}`);
});

test('Group say is GROUP_AMBIENT', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("(Group) Wulfgar: 'heading north'");
  assert(c.tag === TAGS.GROUP_AMBIENT, `Expected GROUP_AMBIENT, got ${c.tag}`);
});

// ============================================================
console.log('\n=== TEST 2: Obligation Scoring ===');
// ============================================================

test('Direct tell with question is HIGH', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Kira tells you 'where are you?'");
  const s = mw.scoreObligation(c);
  assert(s.score >= OBLIGATION_THRESHOLD, `Expected >= ${OBLIGATION_THRESHOLD}, got ${s.score} [${s.reasons}]`);
});

test('Random gossip is LOW', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("[Gossip] Someone: nice weather today");
  const s = mw.scoreObligation(c);
  assert(s.score < 40, `Expected < 40, got ${s.score}`);
});

test('Name in say is HIGH', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Kira says 'Testchar, can you tank?'");
  const s = mw.scoreObligation(c);
  assert(s.score >= OBLIGATION_THRESHOLD, `Expected >= ${OBLIGATION_THRESHOLD}, got ${s.score}`);
});

test('Ambient after speaking is LOW (recency modifier)', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.recordSpeech("yeah sure");
  const c = mw.classifyLine("Wulfgar says 'cool'");
  const s = mw.scoreObligation(c);
  assert(s.score < 50, `Expected < 50, got ${s.score} [${s.reasons}]`);
});

test('Non-social lines score 0', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Your slash hits the viper!");
  const s = mw.scoreObligation(c);
  assert(s.score === 0, `Expected 0, got ${s.score}`);
});

// ============================================================
console.log('\n=== TEST 3: Silence Verification ===');
// ============================================================

test('No prompt during pure combat output', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const combatLines = [
    "Your slash DECIMATES a viper!",
    "The viper claws you!",
    "Your kick MAULS the viper!",
    "[200/200hp 100/100mn 500/500mv]",
    "The viper is DEAD!",
  ];
  combatLines.forEach(l => mw.processText(l));
  assert(mw.assemblePrompt() === null, 'Should be no prompt for combat output');
});

test('No prompt for ambient chat (no name mention)', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const chat = [
    "Wulfgar says 'nice loot'",
    "Artou says 'thanks for the group'",
    "Wulfgar says 'any time'",
  ];
  chat.forEach(l => mw.processText(l));
  assert(mw.assemblePrompt() === null, 'Should be no prompt for ambient chat');
});

test('Direct tell DOES trigger prompt', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.processText("Kira tells you 'hey are you there?'");
  const prompt = mw.assemblePrompt();
  assert(prompt !== null, 'Direct tell should trigger a prompt');
  assert(prompt.trigger.speaker === 'Kira', `Trigger speaker should be Kira, got ${prompt.trigger.speaker}`);
});

test('Name mention in say triggers prompt', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.processText("Wulfgar says 'Testchar you ready?'");
  const prompt = mw.assemblePrompt();
  assert(prompt !== null, 'Name mention should trigger a prompt');
});

// ============================================================
console.log('\n=== TEST 4: Turn Management ===');
// ============================================================

test('Cannot double-tap', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.recordSpeech("hello everyone");
  assert(!mw.canSpeak(), 'Should not be able to speak right after speaking');
});

test('Can speak after someone else speaks', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.recordSpeech("hello");
  // Simulate someone else speaking
  mw._addToWindow('otherperson');
  mw._lastSpeakerWasUs = false;
  assert(mw.canSpeak(), 'Should be able to speak after someone else');
});

test('Suppressed when over talk ratio', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  // Simulate us dominating the conversation (16 of 20 messages)
  for (let i = 0; i < 16; i++) {
    mw._addToWindow('testchar');
  }
  for (let i = 0; i < 4; i++) {
    mw._addToWindow('other');
  }
  mw._lastSpeakerWasUs = false; // don't block on double-tap
  // talk ratio = 16/20 = 0.80, target for 2 speakers = 0.5, threshold = 0.75
  assert(!mw.canSpeak(), 'Should be suppressed when talk ratio is too high');
});

// ============================================================
console.log('\n=== TEST 5: Social Frame ===');
// ============================================================

test('Post-victory mood after kill', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw._lastKillAt = Date.now();
  const frame = mw.getSocialFrame();
  assert(frame.mood === 'post-victory', `Expected post-victory, got ${frame.mood}`);
});

test('Tense mood during combat', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.worldModel.updateSelf({ inCombat: true });
  const frame = mw.getSocialFrame();
  assert(frame.mood === 'tense', `Expected tense, got ${frame.mood}`);
});

test('Idle mood when nothing happening', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw._lastEventAt = Date.now() - 60000; // 60s ago
  mw._lastKillAt = 0;
  mw._lastCombatEndAt = 0;
  const frame = mw.getSocialFrame();
  assert(frame.mood === 'idle', `Expected idle, got ${frame.mood}`);
});

test('Frame includes setting', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.worldModel.updateRoom({ id: '1234', name: 'Town Square', zone: 'aylor' });
  const frame = mw.getSocialFrame();
  assert(frame.setting.includes('Town Square'), `Setting should mention room: ${frame.setting}`);
});

// ============================================================
console.log('\n=== TEST 6: Response Delay Jitter ===');
// ============================================================

test('Delays are in expected range with jitter', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const delays = [];
  for (let i = 0; i < 100; i++) {
    delays.push(mw.getResponseDelay(20));
  }
  const min = Math.min(...delays);
  const max = Math.max(...delays);
  assert(min >= 1000, `Min delay should be >= 1000ms, got ${min}`);
  assert(max <= 6000, `Max delay should be <= 6000ms, got ${max}`);
  assert(max - min > 300, `Should have meaningful jitter, range was ${max - min}`);
});

test('Longer messages get longer delays', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const shortDelays = Array.from({ length: 50 }, () => mw.getResponseDelay(5));
  const longDelays = Array.from({ length: 50 }, () => mw.getResponseDelay(80));
  const avgShort = shortDelays.reduce((a, b) => a + b) / shortDelays.length;
  const avgLong = longDelays.reduce((a, b) => a + b) / longDelays.length;
  assert(avgLong > avgShort, `Long messages should have longer delays: short=${Math.round(avgShort)}ms, long=${Math.round(avgLong)}ms`);
});

// ============================================================
console.log('\n=== TEST 7: Cross-Game Portability ===');
// ============================================================

test('Aardwolf tell classified correctly', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  const c = mw.classifyLine("Kira tells you 'hey'");
  assert(c.tag === TAGS.DIRECT_ADDRESS, `Expected DIRECT_ADDRESS, got ${c.tag}`);
});

test('Achaea tell classified correctly', () => {
  const sp = loadServerProfile('achaea');
  if (!sp) { console.log('  SKIP: achaea.json not found'); return; }
  const wm = new WorldModel({ name: 'Testchar' });
  wm.updateSelf({ hp: 350, maxHp: 350 });
  const mw = new ConversationMiddleware({ worldModel: wm, serverProfile: sp, characterName: 'Testchar' });
  const c = mw.classifyLine('Kira tells you, "can you heal?"');
  assert(c.tag === TAGS.DIRECT_ADDRESS, `Expected DIRECT_ADDRESS, got ${c.tag}`);
});

test('Both games produce valid social frames', () => {
  const mw1 = makeMiddleware('aardwolf', 'A');
  const mw2 = makeMiddleware('achaea', 'B');
  const f1 = mw1.getSocialFrame();
  const f2 = mw2.getSocialFrame();
  assert(f1.setting !== undefined, 'Aardwolf frame should have setting');
  assert(f2.setting !== undefined, 'Achaea frame should have setting');
  assert(f1.mood !== undefined, 'Aardwolf frame should have mood');
  assert(f2.mood !== undefined, 'Achaea frame should have mood');
});

// ============================================================
console.log('\n=== TEST 8: Integration (Full Pipeline) ===');
// ============================================================

test('Full pipeline: combat → ambient → tell triggers prompt', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');

  // Phase 1: Combat (no prompt)
  mw.processText("Your slash hits the viper!\nThe viper claws you!\nThe viper is DEAD!");
  assert(mw.assemblePrompt() === null, 'No prompt during combat');

  // Phase 2: Ambient chat (no prompt)
  mw.processText("Wulfgar says 'nice kill'\nArtou says 'good job team'");
  assert(mw.assemblePrompt() === null, 'No prompt for ambient');

  // Phase 3: Direct tell (prompt!)
  mw.processText("Kira tells you 'hey Testchar, want to group?'");
  const prompt = mw.assemblePrompt();
  assert(prompt !== null, 'Tell should trigger prompt');
  assert(prompt.trigger.speaker === 'Kira', 'Trigger should be from Kira');
  assert(prompt.constraint === 'social', `Constraint should be social, got ${prompt.constraint}`);
  assert(prompt.contextBuffer.length > 0, 'Context buffer should have ambient lines');
});

test('Obligation clears after responding', () => {
  const mw = makeMiddleware('aardwolf', 'Testchar');
  mw.processText("Kira tells you 'hey'");
  assert(mw.assemblePrompt() !== null, 'Should have prompt before responding');
  mw.recordSpeech("hey Kira!");
  // After a non-us speaker, prompt should be clear
  mw._lastSpeakerWasUs = false;
  assert(mw.assemblePrompt() === null, 'Should have no prompt after responding');
});

// ============================================================
// Summary
// ============================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);
