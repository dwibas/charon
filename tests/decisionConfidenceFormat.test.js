import test from 'node:test';
import assert from 'node:assert/strict';

import { batchRevealSummary } from '../src/telegram/format.js';

const row = {
  id: 1,
  candidate: {
    token: { mint: 'Mint111111111111111111111111111111111111111', symbol: 'TEST' },
    signals: { label: 'graduated + trending' },
    metrics: { marketCapUsd: 100000, liquidityUsd: 10000 },
  },
};

test('batchRevealSummary does not display misleading 0.0% confidence for no-buy decisions', () => {
  const text = batchRevealSummary(123, [row], {
    verdict: 'PASS',
    confidence: 0,
    selected_candidate_id: null,
    reason: 'No asymmetric setup.',
  }, 1);

  assert.match(text, /Decision: <b>PASS<\/b>/);
  assert.doesNotMatch(text, /0\.0%/);
  assert.match(text, /Confidence: n\/a/);
});

test('batchRevealSummary still displays numeric confidence when the model provides it', () => {
  const text = batchRevealSummary(124, [row], {
    verdict: 'WATCH',
    confidence: 45,
    selected_candidate_id: null,
    reason: 'Watch but not buy.',
  }, 1);

  assert.match(text, /Decision: <b>WATCH<\/b> · Confidence: 45\.0%/);
});
