import test from 'node:test';
import assert from 'node:assert/strict';

import { positionCreationResult, shouldSkipSameMintEntry } from '../src/trading/entryGuards.js';

test('positionCreationResult marks existing position as not created', () => {
  assert.deepEqual(positionCreationResult({ existingId: 32 }), { positionId: 32, created: false });
});

test('positionCreationResult marks inserted position as created', () => {
  assert.deepEqual(positionCreationResult({ insertedId: 33 }), { positionId: 33, created: true });
});

test('shouldSkipSameMintEntry rejects open same-mint position', () => {
  const result = shouldSkipSameMintEntry({ openPosition: { id: 32 }, lastClosedPosition: null, nowMs: 1000, cooldownMs: 0 });
  assert.equal(result.skip, true);
  assert.equal(result.reason, 'open_position');
  assert.equal(result.positionId, 32);
});

test('shouldSkipSameMintEntry rejects recently closed same-mint position inside cooldown', () => {
  const result = shouldSkipSameMintEntry({
    openPosition: null,
    lastClosedPosition: { id: 31, closed_at_ms: 900 },
    nowMs: 1000,
    cooldownMs: 500,
  });
  assert.equal(result.skip, true);
  assert.equal(result.reason, 'cooldown');
  assert.equal(result.positionId, 31);
  assert.equal(result.remainingMs, 400);
});

test('shouldSkipSameMintEntry allows when cooldown expired', () => {
  const result = shouldSkipSameMintEntry({
    openPosition: null,
    lastClosedPosition: { id: 31, closed_at_ms: 100 },
    nowMs: 1000,
    cooldownMs: 500,
  });
  assert.equal(result.skip, false);
});
