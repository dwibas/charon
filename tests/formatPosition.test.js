import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPosition } from '../src/telegram/format.js';

test('formatPosition shows current mcap and current PnL before high-water PnL', () => {
  const text = formatPosition({
    id: 1,
    mint: 'Mint111111111111111111111111111111111111111',
    symbol: 'TEST',
    status: 'open',
    execution_mode: 'dry_run',
    strategy_id: 'smart_money',
    entry_mcap: 100,
    mcap: 80,
    high_water_mcap: 150,
    size_sol: 0.1,
    tp_percent: 100,
    sl_percent: -99,
    trailing_enabled: 0,
  });

  assert.match(text, /Current mcap:/);
  assert.match(text, /High:/);
  assert.match(text, /PnL: -20\.0%/);
  assert.match(text, /Best: 50\.0%/);
});

test('formatPosition does not present high-water mcap as current for stale open rows', () => {
  const text = formatPosition({
    id: 2,
    mint: 'Mint222222222222222222222222222222222222222',
    symbol: 'STALE',
    status: 'open',
    execution_mode: 'dry_run',
    strategy_id: 'smart_money',
    entry_mcap: 100,
    high_water_mcap: 150,
    size_sol: 0.1,
    tp_percent: 100,
    sl_percent: -99,
    trailing_enabled: 0,
  });

  assert.match(text, /Current mcap: stale/);
  assert.doesNotMatch(text, /Current mcap: \$150/);
  assert.match(text, /High: \$150/);
  assert.match(text, /PnL: \?/);
  assert.match(text, /Best: 50\.0%/);
});
