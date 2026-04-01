'use strict';
// ipc-handler.js — IPC command dispatch + plan executor.
// Extracted from daemon.js. Handles all command types from the LLM agent:
// special commands (reflexes, audit, social, etc.), plan execution, and
// standard command sequences.

const fs = require('fs');
const path = require('path');

const GENERIC_FAILS = [
  "you can't do that",
  "you don't have that",
  "you do not have that",
  "no such item",
  "you aren't carrying that",
  "that doesn't seem to be here",
  "you can't go that way",
];

/**
 * Create the IPC command handler function.
 * @param {Object} ctx — all daemon subsystems the handler needs
 * @returns {Function} async (command) => result
 */
function createIpcHandler(ctx) {
  const {
    connection, isFileIpc, dataDir, log,
    reflexEngine, worldModel, tactics, behaviorTree,
    conversation, audit, gameState, stateMachine,
    blackboard, outputBuffer,
  } = ctx;

  // Wait-for helper (used by standard commands)
  function waitForPattern(pattern, timeoutMs) {
    return new Promise((resolve) => {
      const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
      const startCursor = outputBuffer.getCursor();
      const deadline = Date.now() + timeoutMs;

      const check = setInterval(() => {
        const newText = outputBuffer.getOutputSince(startCursor);
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

  // Helper: wait for file-IPC result matching a command string
  async function waitForFileIpcResult(cmd, timeoutMs = 10000) {
    const resultPath = path.join(dataDir, 'ipc', 'result.json');
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (fs.existsSync(resultPath)) {
          const r = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
          if (r.command === cmd) return r;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }

  // Helper: delete stale result.json before sending a new command
  function clearStaleResult() {
    try { fs.unlinkSync(path.join(dataDir, 'ipc', 'result.json')); } catch {}
  }

  // Helper: read file-IPC result as string
  function readFileIpcResult() {
    try {
      return JSON.stringify(JSON.parse(
        fs.readFileSync(path.join(dataDir, 'ipc', 'result.json'), 'utf8')));
    } catch { return ''; }
  }

  // Helper: build the result object returned to the LLM agent.
  // Unified shape — all fields present regardless of connection type.
  // Absent data is omitted (not null), keeping responses lean.
  function buildResult(extras = {}) {
    const result = {
      state: stateMachine.getState(),
      worldModel: worldModel.snapshot(),
      audit: audit.run(),
      gameState: gameState.snapshot(),
      reflexes: reflexEngine.snapshot(),
    };

    // Social context (available for all games, even if conversation middleware is idle)
    const socialFrame = conversation.getSocialFrame();
    if (socialFrame && Object.keys(socialFrame).length > 0) {
      result.socialContext = socialFrame;
    }

    // File-IPC: include mod's structured result (NPC text, choices, etc.)
    if (isFileIpc) {
      try {
        result.gameResult = JSON.parse(fs.readFileSync(
          path.join(dataDir, 'ipc', 'result.json'), 'utf8'));
      } catch {}
    }

    return { ...result, ...extras };
  }

  // --- Special command handlers (no game connection needed) ---

  function handleSpecialCommand(command) {
    switch (command.type) {
      case 'setReflexes':
        reflexEngine.setRules(command.rules || []);
        return { status: 'ok', rulesLoaded: (command.rules || []).length, reflexes: reflexEngine.snapshot() };

      case 'getWorldModel':
        return { worldModel: worldModel.snapshot(), reflexes: reflexEngine.snapshot() };

      case 'setRole':
        tactics.setRole(command.role);
        return { status: 'ok', role: command.role };

      case 'setPlan':
        tactics.setPlan(command.plan);
        return { status: 'ok', plan: command.plan };

      case 'getGroupStatus':
        return { groupStatus: tactics.getGroupStatus() };

      case 'setBehaviorTree':
        behaviorTree.loadTree(command.tree);
        return { status: 'ok', tree: behaviorTree.snapshot() };

      case 'getBehaviorTree':
        return { tree: behaviorTree.snapshot() };

      case 'socialResponse': {
        const msg = command.message;
        const channel = command.channel || 'say';
        if (msg) conversation.queueResponse(msg, channel);
        return { status: 'ok', queued: true, channel };
      }

      case 'getSocialContext':
        return {
          socialContext: conversation.getSocialFrame(),
          socialPrompt: conversation.assemblePrompt(),
          conversation: conversation.snapshot(),
        };

      case 'getAudit':
        return { audit: audit.run() };

      case 'suppressAudit':
        audit.suppress(command.findingId, command.reason, command.durationMs);
        return { status: 'ok', suppressed: command.findingId };

      case 'unsuppressAudit':
        audit.unsuppress(command.findingId);
        return { status: 'ok', unsuppressed: command.findingId };

      case 'addAuditRule': {
        const added = audit.addCustomRule(command.rule);
        return { status: added ? 'ok' : 'error', customRules: audit.getCustomRules() };
      }

      case 'removeAuditRule':
        audit.removeCustomRule(command.ruleId);
        return { status: 'ok' };

      default:
        return null; // Not a special command
    }
  }

  // --- Plan Executor ---

  async function executePlan(command) {
    if (!connection.isPlaying()) {
      return { error: 'Not connected to game', connectionState: connection.getState() };
    }

    const plan = command.plan;
    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      return { error: 'Plan must have a steps array' };
    }

    log('PLAN', `Executing plan "${plan.id || 'unnamed'}" (${plan.steps.length} steps)`);
    gameState.acquireMutex();
    reflexEngine.acquireMutex();
    behaviorTree.acquireMutex();

    const planStartCursor = outputBuffer.getCursor();
    const captures = {};
    const stepResults = [];
    const delayMs = plan.delayMs || 1500;
    const settleMs = plan.settleMs || 2000;

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        const stepCursor = outputBuffer.getCursor();

        const cmd = typeof step === 'string' ? step : step.command;
        if (!cmd) {
          stepResults.push({ step: i, skipped: true, reason: 'no command' });
          continue;
        }

        if (isFileIpc) clearStaleResult();

        connection.send(cmd);
        log('PLAN', `Step ${i}: "${cmd}"`);

        if (isFileIpc) {
          await waitForFileIpcResult(cmd);
        } else {
          await new Promise(r => setTimeout(r, delayMs));
        }

        // Collect step output
        const stepOutput = isFileIpc
          ? readFileIpcResult()
          : outputBuffer.getOutputSince(stepCursor).trim();

        // Check for failure
        const failPatterns = step.failPatterns || [];
        const lower = stepOutput.toLowerCase();
        let failed = false;
        let failReason = null;

        for (const pattern of failPatterns) {
          if (lower.includes(pattern.toLowerCase())) { failed = true; failReason = pattern; break; }
        }
        if (!failed) {
          for (const gf of GENERIC_FAILS) {
            if (lower.includes(gf)) { failed = true; failReason = gf; break; }
          }
        }
        if (!failed && isFileIpc) {
          try {
            const parsed = JSON.parse(stepOutput);
            if (parsed.status === 'error') { failed = true; failReason = parsed.message || 'error status in result'; }
          } catch {}
        }

        const onFail = step.onFail || 'continue';
        const outputLimit = isFileIpc ? 8000 : 2000; // File-IPC returns structured JSON, needs more room
        const result = { step: i, command: cmd, output: stepOutput.slice(-outputLimit), failed, failReason };

        if (step.capture) {
          captures[step.capture] = stepOutput.slice(-5000);
          result.captured = step.capture;
        }

        stepResults.push(result);

        if (failed) {
          log('PLAN', `Step ${i} failed: "${failReason}" (onFail: ${onFail})`);
          if (onFail === 'abort') break;
        }
      }

      await new Promise(r => setTimeout(r, settleMs));
      gameState.clearDecision();

      return {
        planId: plan.id || null,
        description: plan.description || null,
        stepsExecuted: stepResults.length,
        stepsFailed: stepResults.filter(s => s.failed).length,
        steps: stepResults,
        captures,
        worldModel: worldModel.snapshot(),
        audit: audit.run(),
        output: isFileIpc ? undefined : outputBuffer.getOutputSince(planStartCursor).slice(-5000),
      };
    } finally {
      gameState.releaseMutex();
      reflexEngine.releaseMutex();
      behaviorTree.releaseMutex();
    }
  }

  // --- Standard command execution ---

  async function executeCommands(command) {
    log('IPC', `Received command: ${command.id} (${(command.commands || []).length} cmds)`);

    if (!connection.isPlaying()) {
      return { output: '', error: 'Not connected to game', connectionState: connection.getState() };
    }

    gameState.acquireMutex();
    reflexEngine.acquireMutex();
    behaviorTree.acquireMutex();

    const startCursor = outputBuffer.getCursor();
    const events = [];

    try {
      for (let i = 0; i < command.commands.length; i++) {
        const cmd = command.commands[i];

        if (typeof cmd === 'string') {
          if (isFileIpc) clearStaleResult();
          connection.send(cmd);
          log('IPC', `Sent: "${cmd}"`);
          if (isFileIpc) {
            await waitForFileIpcResult(cmd);
          } else {
            await new Promise(r => setTimeout(r, 1500));
          }
        } else if (typeof cmd === 'object' && cmd.wait) {
          const matched = await waitForPattern(cmd.wait, cmd.timeout || 15000);
          log('IPC', matched ? `Wait matched: ${cmd.wait}` : `Wait timed out: ${cmd.wait}`);
          if (cmd.send) {
            connection.send(cmd.send);
            await new Promise(r => setTimeout(r, 1500));
          }
        } else if (typeof cmd === 'object' && cmd.action) {
          const result = gameState.translateCommand(cmd);
          if (result.error) {
            log('IPC', `Typed command rejected: ${result.error}`);
            events.push({ type: 'command_error', detail: result.error });
          } else {
            connection.send(result.command);
            log('IPC', `Typed [${cmd.action}] → "${result.command}"`);
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }

      await new Promise(r => setTimeout(r, 2000));
      const newOutput = outputBuffer.getOutputSince(startCursor);
      gameState.clearDecision();

      return buildResult({
        output: isFileIpc ? undefined : newOutput.slice(-5000),
        events,
      });
    } finally {
      gameState.releaseMutex();
      reflexEngine.releaseMutex();
      behaviorTree.releaseMutex();
    }
  }

  // --- Main handler ---

  return async function handleCommand(command) {
    // Try special commands first (no game connection needed)
    const special = handleSpecialCommand(command);
    if (special) return special;

    // Plan executor
    if (command.type === 'executePlan') return executePlan(command);

    // Standard command execution
    return executeCommands(command);
  };
}

module.exports = { createIpcHandler };
