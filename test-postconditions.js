#!/usr/bin/env node
'use strict';
// test-postconditions.js — Tests for postcondition support in harness-client.js
// Run: node test-postconditions.js          (unit tests only)
// Run: node test-postconditions.js --live   (requires Qud running with updated mod)

const { HarnessClient } = require('./harness-client');

// ============================================================================
// Unit tests — no Qud required
// ============================================================================

function unitTests() {
  console.log('=== Unit Tests ===\n');
  let passed = 0;
  let failed = 0;

  function assert(name, condition) {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}`);
      failed++;
    }
  }

  // Test postconditionsMet — vacuously true when no postconditions
  assert('postconditionsMet: null response', HarnessClient.postconditionsMet(null) === true);
  assert('postconditionsMet: no postconditions key', HarnessClient.postconditionsMet({ status: 'ok' }) === true);
  assert('postconditionsMet: evaluated=false', HarnessClient.postconditionsMet({ postconditions: { evaluated: false } }) === false);
  assert('postconditionsMet: allMet=true', HarnessClient.postconditionsMet({ postconditions: { evaluated: true, allMet: true } }) === true);
  assert('postconditionsMet: allMet=false', HarnessClient.postconditionsMet({ postconditions: { evaluated: true, allMet: false } }) === false);

  // Test postconditionDetails
  assert('postconditionDetails: null response', HarnessClient.postconditionDetails(null) === null);
  assert('postconditionDetails: no results', HarnessClient.postconditionDetails({ postconditions: {} }) === null);
  const fakeResults = [{ path: 'hp', condition: 'decreased', passed: true }];
  assert('postconditionDetails: returns results',
    HarnessClient.postconditionDetails({ postconditions: { results: fakeResults } }) === fakeResults);

  // Test that performAction builds the right request shape
  const client = new HarnessClient();
  // We can't actually send without Qud, but we can verify the client loads
  assert('HarnessClient instantiates', client !== null);
  assert('HarnessClient has performAction', typeof client.performAction === 'function');
  assert('HarnessClient has move', typeof client.move === 'function');
  assert('HarnessClient reads stateVersion', typeof client.getStateVersion() === 'number');

  const sv = client.getStateVersion();
  assert(`stateVersion from state.json: ${sv}`, sv > 0);

  // Test that state.json has expected fields for postcondition paths
  const state = client.readState();
  if (state) {
    assert('state has position.x', state.position && typeof state.position.x === 'number');
    assert('state has position.y', state.position && typeof state.position.y === 'number');
    assert('state has zone', typeof state.zone === 'string');
    assert('state has hp', typeof state.hp === 'number');
    assert('state has stateVersion', typeof state.stateVersion === 'number');
    console.log(`\n  Current state: ${state.name} at (${state.position.x}, ${state.position.y}) in ${state.zoneName}, HP ${state.hp}/${state.maxHp}, v${state.stateVersion}`);
  } else {
    assert('state.json readable', false);
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// ============================================================================
// Live tests — requires Qud running with updated AgentBridge mod
// ============================================================================

async function liveTests() {
  console.log('=== Live Tests (Qud must be running) ===\n');
  const client = new HarnessClient();

  const state = client.readState();
  if (!state) {
    console.log('  ERROR: Cannot read state.json — is Qud running?');
    return;
  }
  console.log(`  Starting: ${state.name} at (${state.position.x}, ${state.position.y}), v${state.stateVersion}\n`);

  // Test 1: Move with position.changed postcondition
  console.log('  Test 1: Move south with postcondition {position.y: changed}');
  const moveResp = await client.performAction(
    { type: 'movement.step', direction: 's' },
    {
      postconditions: [
        { path: 'position.y', condition: 'changed' }
      ]
    }
  );

  if (moveResp.status === 'timeout') {
    console.log('  TIMEOUT — is the updated AgentBridge mod loaded? Restart Qud with the new mod.');
    return;
  }

  console.log('  Response status:', moveResp.status);
  console.log('  Postconditions:', JSON.stringify(moveResp.postconditions, null, 4));
  console.log('  postconditionsMet:', HarnessClient.postconditionsMet(moveResp));
  console.log();

  // Test 2: Move into a wall with position.changed postcondition (should fail)
  console.log('  Test 2: Move into blocked direction with postcondition (expect allMet=false)');
  // Find a blocked exit
  const postState = client.readState();
  const exits = postState?.exits || {};
  const blockedDir = Object.entries(exits).find(([_, open]) => !open);

  if (blockedDir) {
    const dir = blockedDir[0].toLowerCase();
    console.log(`  Attempting blocked move: ${dir}`);
    const blockedResp = await client.performAction(
      { type: 'movement.step', direction: dir },
      {
        postconditions: [
          { path: 'position.x', condition: 'changed' },
        ]
      }
    );
    console.log('  Response status:', blockedResp.status);
    console.log('  Postconditions:', JSON.stringify(blockedResp.postconditions, null, 4));
    console.log('  postconditionsMet:', HarnessClient.postconditionsMet(blockedResp));
  } else {
    console.log('  SKIP — no blocked exits found to test against');
  }
  console.log();

  // Test 3: Static postcondition — check HP > 0 after waiting
  console.log('  Test 3: Wait with static postcondition {hp greaterThan 0}');
  const waitResp = await client.performAction(
    { type: 'survival.rest' },
    {
      postconditions: [
        { path: 'hp', condition: 'greaterThan', expected: 0 }
      ]
    }
  );
  console.log('  Response status:', waitResp.status);
  console.log('  Postconditions:', JSON.stringify(waitResp.postconditions, null, 4));
  console.log('  postconditionsMet:', HarnessClient.postconditionsMet(waitResp));
  console.log();

  // Summary
  const finalState = client.readState();
  console.log(`  Final: ${finalState.name} at (${finalState.position.x}, ${finalState.position.y}), v${finalState.stateVersion}`);
}

// ============================================================================
// Main
// ============================================================================

const allPassed = unitTests();

if (process.argv.includes('--live')) {
  liveTests().catch(err => {
    console.error('Live test error:', err.message);
    process.exit(1);
  });
} else if (allPassed) {
  console.log('Unit tests passed. Run with --live to test against a running Qud instance.');
}
