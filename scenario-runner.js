#!/usr/bin/env node
'use strict';
// scenario-runner.js — Deterministic scenario executor for the Caves of Qud agent harness.
// Usage: node scenario-runner.js scenarios/joppa-intro.json [--ipc-dir PATH] [--delay MS]

const fs = require('fs');
const path = require('path');
const { HarnessClient } = require('./harness-client');

const REPORT_DIR = path.join(__dirname, 'reports');
const DEFAULT_DELAY_MS = 800;

// ---------------------------------------------------------------------------
// ScenarioRunner
// ---------------------------------------------------------------------------

class ScenarioRunner {
  /**
   * @param {HarnessClient} harness
   * @param {object} [options]
   * @param {number} [options.delayMs] — pause between steps (default 800)
   * @param {boolean} [options.verbose] — extra logging (default true)
   */
  constructor(harness, options = {}) {
    this.harness = harness;
    this.delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    this.verbose = options.verbose ?? true;
    this.results = [];       // per-step results
    this.scenarioName = '';
    this.startTime = null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Load and execute a scenario JSON file.
   * @param {string} scenarioPath — path to the scenario .json
   * @returns {Promise<{passed: number, failed: number, skipped: number, results: Array}>}
   */
  async runScenario(scenarioPath) {
    const raw = fs.readFileSync(scenarioPath, 'utf8');
    const scenario = JSON.parse(raw);

    this.scenarioName = scenario.name || path.basename(scenarioPath, '.json');
    this.startTime = new Date();
    this.results = [];

    _log('SCENARIO', `Starting: ${scenario.name}`);
    if (scenario.description) _log('SCENARIO', `  ${scenario.description}`);
    if (scenario.tags) _log('SCENARIO', `  Tags: ${scenario.tags.join(', ')}`);

    const steps = scenario.steps || [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepName = step.name || `step_${i + 1}`;
      _log('STEP', `[${i + 1}/${steps.length}] ${stepName}`);

      const result = await this.runStep(step);
      this.results.push({ index: i + 1, name: stepName, ...result });

      if (this.verbose) {
        const icon = result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : 'SKIP';
        _log(icon, `  ${stepName}: ${result.summary || result.status}`);
      }

      // Abort if step failed and abortOnFail is set
      if (result.status === 'fail' && step.abortOnFail) {
        _log('ABORT', `Aborting scenario after step "${stepName}" (abortOnFail=true)`);
        break;
      }

      // Pause between steps
      if (i < steps.length - 1) {
        await _sleep(step.delayMs ?? this.delayMs);
      }
    }

    const counts = this._countResults();
    _log('SCENARIO', `Done. ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped out of ${this.results.length} steps.`);

    // Write report
    const report = this.generateReport();
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const reportPath = path.join(REPORT_DIR, `scenario-${this.scenarioName}-${ts}.md`);
    fs.writeFileSync(reportPath, report);
    _log('REPORT', `Written to ${reportPath}`);

    return { ...counts, results: this.results, reportPath };
  }

  /**
   * Execute one scenario step.
   * @param {object} step
   * @returns {Promise<{status: string, summary: string, response?: object}>}
   */
  async runStep(step) {
    try {
      // --- repeat support ---
      const repeatCount = step.repeat || 1;

      // --- action step ---
      if (step.action) {
        let lastResponse = null;
        for (let r = 0; r < repeatCount; r++) {
          if (repeatCount > 1) _log('STEP', `  repeat ${r + 1}/${repeatCount}`);
          const response = await this.harness.performAction(step.action);
          lastResponse = response;

          const failed = response.status === 'error' || response.status === 'timeout';

          // If action failed and there's a fallback, run it
          if (failed && step.onFail && step.fallback) {
            _log('STEP', `  Action failed (${response.status}), running fallback: ${step.onFail}`);
            lastResponse = await this._runFallback(step.fallback);
          }

          // Pause between repeats (half the normal delay)
          if (r < repeatCount - 1) {
            await _sleep(Math.floor((step.delayMs ?? this.delayMs) / 2));
          }
        }

        // Evaluate post-action assertions if present
        if (step.assert) {
          const assertResult = await this._evaluateAssertions(step.assert);
          if (!assertResult.allPassed) {
            return {
              status: 'fail',
              summary: `Action succeeded but assertion failed: ${_summarizeAssertions(assertResult)}`,
              response: lastResponse,
              assertResult,
            };
          }
        }

        const statusMsg = lastResponse?.status === 'timeout' ? 'timeout' :
                          lastResponse?.status === 'error' ? 'error' : 'ok';
        return {
          status: statusMsg === 'ok' ? 'pass' : 'fail',
          summary: _summarizeResponse(lastResponse),
          response: lastResponse,
        };
      }

      // --- assertion-only step (no action) ---
      if (step.assert) {
        const assertResult = await this._evaluateAssertions(step.assert);
        return {
          status: assertResult.allPassed ? 'pass' : 'fail',
          summary: _summarizeAssertions(assertResult),
          assertResult,
        };
      }

      // --- waitUntil step ---
      if (step.waitUntil) {
        const timeout = step.timeout || 15000;
        const condition = _buildConditionFn(step.waitUntil);
        const result = await this.harness.waitUntil(condition, timeout);
        return {
          status: result.met ? 'pass' : 'fail',
          summary: result.met ? 'Condition met' : `Condition not met within ${timeout}ms`,
          state: result.state,
        };
      }

      // --- unknown step type ---
      return { status: 'skip', summary: 'No action, assert, or waitUntil defined' };

    } catch (err) {
      return { status: 'fail', summary: `Exception: ${err.message}` };
    }
  }

  /**
   * Generate a Markdown report of the scenario run.
   * @returns {string}
   */
  generateReport() {
    const counts = this._countResults();
    const endTime = new Date();
    const durationSec = ((endTime - this.startTime) / 1000).toFixed(1);

    const lines = [
      `# Scenario Report: ${this.scenarioName}`,
      '',
      `**Run at:** ${this.startTime.toISOString()}`,
      `**Duration:** ${durationSec}s`,
      `**Result:** ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped / ${this.results.length} total`,
      '',
      '## Steps',
      '',
    ];

    for (const r of this.results) {
      const icon = r.status === 'pass' ? '[PASS]' : r.status === 'fail' ? '[FAIL]' : '[SKIP]';
      lines.push(`${r.index}. **${icon}** \`${r.name}\` — ${r.summary}`);
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Generated by scenario-runner.js*`);

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  _countResults() {
    let passed = 0, failed = 0, skipped = 0;
    for (const r of this.results) {
      if (r.status === 'pass') passed++;
      else if (r.status === 'fail') failed++;
      else skipped++;
    }
    return { passed, failed, skipped };
  }

  async _runFallback(fallbackSteps) {
    let lastResponse = null;
    for (const fb of fallbackSteps) {
      const repeatCount = fb.repeat || 1;
      for (let r = 0; r < repeatCount; r++) {
        _log('FALL', `  fallback: ${fb.action?.type || JSON.stringify(fb.action).slice(0, 60)}${repeatCount > 1 ? ` (${r + 1}/${repeatCount})` : ''}`);
        lastResponse = await this.harness.performAction(fb.action);
        if (r < repeatCount - 1) await _sleep(300);
      }
    }
    return lastResponse;
  }

  async _evaluateAssertions(assertions) {
    const arr = Array.isArray(assertions) ? assertions : [assertions];
    const result = await this.harness.assertState(arr);
    const allPassed = result.status === 'ok' || (result.results && result.results.every(r => r.passed));
    return { allPassed, details: result };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag.padEnd(8)}] ${msg}`);
}

/** Build a condition function from a waitUntil descriptor. */
function _buildConditionFn(descriptor) {
  // descriptor: { path: "hp", gt: 10 } or { path: "interaction.conversationActive", equals: false }
  return (state) => {
    const actual = _getNestedValue(state, descriptor.path);
    if ('equals' in descriptor) return actual === descriptor.equals;
    if ('notEquals' in descriptor) return actual !== descriptor.notEquals;
    if ('gt' in descriptor) return actual > descriptor.gt;
    if ('lt' in descriptor) return actual < descriptor.lt;
    if ('contains' in descriptor) return String(actual).includes(descriptor.contains);
    if ('exists' in descriptor) return descriptor.exists ? actual !== undefined : actual === undefined;
    return actual !== undefined && actual !== null;
  };
}

/** Resolve a dot-separated path on an object. */
function _getNestedValue(obj, dotPath) {
  if (!dotPath) return obj;
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/** Summarize a harness response for logging. */
function _summarizeResponse(resp) {
  if (!resp) return '(no response)';
  const parts = [];
  if (resp.status) parts.push(resp.status);
  if (resp.message) parts.push(resp.message.slice(0, 80));
  if (resp.npcText) parts.push(`NPC: "${resp.npcText.slice(0, 60)}"`);
  if (resp.error) parts.push(`error: ${resp.error}`);
  if (resp.steps !== undefined) parts.push(`${resp.steps} steps`);
  if (resp.arrived !== undefined) parts.push(resp.arrived ? 'arrived' : 'not arrived');
  return parts.join(' | ') || JSON.stringify(resp).slice(0, 100);
}

/** Summarize assertion results for logging. */
function _summarizeAssertions(assertResult) {
  if (!assertResult.details?.results) {
    return assertResult.allPassed ? 'all assertions passed' : 'assertion check failed';
  }
  return assertResult.details.results.map(r => {
    const a = r.assertion;
    const op = 'equals' in a ? `== ${a.equals}` :
               'gt' in a ? `> ${a.gt}` :
               'lt' in a ? `< ${a.lt}` :
               'contains' in a ? `contains "${a.contains}"` : 'exists';
    return `${a.path} ${op}: ${r.passed ? 'PASS' : 'FAIL'}${r.actual !== undefined ? ` (actual: ${r.actual})` : ''}`;
  }).join('; ');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const scenarioPath = args.find(a => !a.startsWith('--'));
  const ipcDir = args.find((_, i, a) => a[i - 1] === '--ipc-dir');
  const delayMs = parseInt(args.find((_, i, a) => a[i - 1] === '--delay') || String(DEFAULT_DELAY_MS));

  if (!scenarioPath) {
    console.error('Usage: node scenario-runner.js <scenario.json> [--ipc-dir PATH] [--delay MS]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(scenarioPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Scenario file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const harness = new HarnessClient(ipcDir);
  const runner = new ScenarioRunner(harness, { delayMs });

  try {
    const result = await runner.runScenario(resolvedPath);
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(2);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { ScenarioRunner };
