import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCodexCliEnv, buildCodexCliPrompt, decideWithCodexCli, resolveCodexCliCommand } from '../src/pipeline/codexCli.js';

const rows = [{
  id: 7,
  candidate: {
    token: { mint: 'Mint111pump', symbol: 'MINT' },
    metrics: { marketCapUsd: 25000, liquidityUsd: 12000 },
    signals: { route: 'fee_graduated_trending' },
    filters: { passed: true, failures: [] },
  },
}];

function normalizeDecision(parsed) {
  const verdict = ['BUY', 'WATCH', 'PASS'].includes(String(parsed?.verdict).toUpperCase())
    ? String(parsed.verdict).toUpperCase()
    : 'WATCH';
  return {
    verdict,
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 0)),
    reason: String(parsed?.reason || ''),
    risks: Array.isArray(parsed?.risks) ? parsed.risks.map(String) : [],
    suggested_tp_percent: Number(parsed?.suggested_tp_percent) || 50,
    suggested_sl_percent: Number(parsed?.suggested_sl_percent) || -25,
    raw: parsed,
  };
}

test('buildCodexCliPrompt asks for strict JSON and warns against tool/file actions', () => {
  const prompt = buildCodexCliPrompt({ system: 'system text', user: { candidates: [] } });
  assert.match(prompt, /Return strict JSON only/);
  assert.match(prompt, /Do not edit files/);
  assert.match(prompt, /Do not run commands/);
});

test('decideWithCodexCli parses fenced JSON and maps selected row', async () => {
  const decision = await decideWithCodexCli({
    rows,
    system: 'system text',
    user: { candidates: [{ candidate_id: 7, mint: 'Mint111pump' }] },
    normalizeDecision,
    runner: async () => ({
      stdout: 'analysis ignored\n```json\n{"verdict":"BUY","selected_candidate_id":7,"selected_mint":"Mint111pump","confidence":81,"reason":"strong overlap","risks":["thin_liquidity"],"suggested_tp_percent":60,"suggested_sl_percent":-20}\n```',
      stderr: '',
      exitCode: 0,
    }),
  });

  assert.equal(decision.verdict, 'BUY');
  assert.equal(decision.selected_candidate_id, 7);
  assert.equal(decision.selected_mint, 'Mint111pump');
  assert.equal(decision.selected_row, rows[0]);
  assert.equal(decision.confidence, 81);
});

test('decideWithCodexCli returns WATCH fallback on timeout or malformed output', async () => {
  const decision = await decideWithCodexCli({
    rows,
    system: 'system text',
    user: { candidates: [{ candidate_id: 7, mint: 'Mint111pump' }] },
    normalizeDecision,
    runner: async () => ({ stdout: 'not json', stderr: '', exitCode: 0 }),
  });

  assert.equal(decision.verdict, 'WATCH');
  assert.equal(decision.selected_candidate_id, null);
  assert.deepEqual(decision.risks, ['codex_cli_error']);
  assert.match(decision.reason, /Codex CLI failed/);
});

test('codex CLI helpers keep fallback PATH and resolve executables outside runtime PATH', () => {
  const dir = join(tmpdir(), `charon-codex-test-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const fakeCodex = join(dir, 'codex');
  writeFileSync(fakeCodex, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const resolved = resolveCodexCliCommand('codex', { PATH: dir });
  assert.equal(resolved, fakeCodex);

  const env = buildCodexCliEnv({ PATH: '/custom/bin' });
  assert.match(env.PATH, /\/home\/ubuntu\/\.hermes\/node\/bin/);
  assert.match(env.PATH, /\/home\/ubuntu\/\.local\/bin/);
  assert.equal(env.CI, '1');
});
