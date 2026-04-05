'use strict';
// llm-provider.js — Abstraction layer for LLM calls.
// Supports 'claude' (CLI) and 'ollama' (local HTTP API) providers.

const { spawn } = require('child_process');

// --- Claude CLI provider ---
function callClaude(fullPrompt, model) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', model, '--output-format', 'text'], {
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

// --- Ollama HTTP provider ---
async function callOllama(fullPrompt, model, endpoint) {
  const url = `${endpoint}/api/generate`;
  const body = JSON.stringify({
    model,
    prompt: fullPrompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 2048,
    },
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.response || '').trim();
}

// --- Provider factory ---
function createProvider(config) {
  const provider = config.provider || 'claude';
  const ollamaEndpoint = config.ollamaEndpoint || 'http://localhost:11434';
  const ollamaModel = config.ollamaModel || 'gemma4';

  return {
    name: provider,

    async call(systemPrompt, userPrompt, model) {
      const fullPrompt = systemPrompt + '\n\n---\n\n' + userPrompt;

      if (provider === 'ollama') {
        // Ollama ignores the model escalation — uses the configured local model
        return callOllama(fullPrompt, ollamaModel, ollamaEndpoint);
      }

      // Claude CLI — pass through the model name (haiku/sonnet/opus)
      return callClaude(fullPrompt, model);
    },

    // For logging — what model is actually being used
    resolveModel(model) {
      if (provider === 'ollama') return ollamaModel;
      return model;
    },
  };
}

module.exports = { createProvider };
