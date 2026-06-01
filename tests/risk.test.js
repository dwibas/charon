import test from 'node:test';
import assert from 'node:assert/strict';

import { approvedByLlmThreshold, resolvePositionRisk } from '../src/trading/risk.js';

test('approvedByLlmThreshold uses active strategy threshold before global threshold', () => {
  assert.equal(approvedByLlmThreshold({ verdict: 'BUY', confidence: 72 }, { llm_min_confidence: 70 }, { globalLlmMinConfidence: 75 }), true);
  assert.equal(approvedByLlmThreshold({ verdict: 'BUY', confidence: 68 }, { llm_min_confidence: 70 }, { globalLlmMinConfidence: 75 }), false);
});

test('resolvePositionRisk ignores LLM TP/SL when disabled', () => {
  const risk = resolvePositionRisk({
    strategy: { tp_percent: 100, sl_percent: -99, trailing_enabled: true, trailing_percent: 20 },
    decision: { suggested_tp_percent: 55, suggested_sl_percent: -18 },
    settings: { defaultTpPercent: 50, defaultSlPercent: -25, defaultTrailingEnabled: false, defaultTrailingPercent: 10, allowLlmTpSl: false },
  });
  assert.equal(risk.tpPercent, 100);
  assert.equal(risk.slPercent, -99);
});

test('resolvePositionRisk permits LLM TP/SL when enabled', () => {
  const risk = resolvePositionRisk({
    strategy: { tp_percent: 100, sl_percent: -99 },
    decision: { suggested_tp_percent: 55, suggested_sl_percent: -18 },
    settings: { defaultTpPercent: 50, defaultSlPercent: -25, defaultTrailingEnabled: false, defaultTrailingPercent: 10, allowLlmTpSl: true },
  });
  assert.equal(risk.tpPercent, 55);
  assert.equal(risk.slPercent, -18);
});
