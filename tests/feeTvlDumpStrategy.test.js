import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeeTvlDumpMetrics, evaluateFeeTvlDumpGuard } from '../src/trading/entryGuards.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-05-30T16:00:00Z');

function candidate(overrides = {}) {
  const ageHours = overrides.ageHours ?? 24;
  const createdAt = new Date(NOW - ageHours * HOUR).toISOString();
  const liquidityUsd = overrides.liquidityUsd ?? 10_000;
  const volume24hUsd = overrides.volume24hUsd ?? 40_000;
  const fees24hUsd = overrides.fees24hUsd ?? 2_500;
  return {
    token: { mint: 'Mint111111111111111111111111111111111111111' },
    metrics: {
      liquidityUsd,
      trendingVolumeUsd: overrides.volume5mUsd ?? 1_000,
    },
    jupiterAsset: {
      createdAt,
      firstPool: { createdAt },
      liquidity: liquidityUsd,
      fees: fees24hUsd,
      stats24h: {
        buyVolume: volume24hUsd * 0.55,
        sellVolume: volume24hUsd * 0.45,
      },
    },
    trending: {
      createdAt,
      volume24h: volume24hUsd,
      volume: overrides.volume5mUsd ?? 1_000,
      stats5m: {
        priceChange: overrides.priceChange5m ?? -8,
        buyVolume: 450,
        sellVolume: 550,
      },
      stats24h: {
        buyVolume: volume24hUsd * 0.55,
        sellVolume: volume24hUsd * 0.45,
      },
    },
    gmgn: {
      open_timestamp: Math.floor((NOW - ageHours * HOUR) / 1000),
    },
    chart: {
      distanceFromAthPercent: overrides.distanceFromAthPercent ?? -25,
      windows: [{ label: 'ath_context_24h_5m', available: true, belowHighPercent: overrides.distanceFromAthPercent ?? -25 }],
    },
  };
}

const strategy = {
  fee_tvl_dump_enabled: true,
  min_fee_tvl_24h: 0.20,
  token_age_min_ms: 12 * HOUR,
  token_age_max_ms: 48 * HOUR,
  min_volume_tvl_24h: 3,
  min_dump_from_high_percent: 15,
  max_dump_from_high_percent: 45,
  require_spot_dump: true,
};

test('fee/tvl dump metrics derive 24h fee density, age, volume/tvl, and dump depth', () => {
  const metrics = buildFeeTvlDumpMetrics(candidate(), { nowMs: NOW });
  assert.equal(Number(metrics.feeTvl24h.toFixed(2)), 0.25);
  assert.equal(Number(metrics.tokenAgeHours.toFixed(1)), 24.0);
  assert.equal(Number(metrics.volumeTvl24h.toFixed(1)), 4.0);
  assert.equal(Number(metrics.dumpFromHighPercent.toFixed(1)), 25.0);
  assert.equal(metrics.spotOnDump, true);
});

test('fee/tvl dump guard passes only 12-48h tokens with fee/tvl >=20%, enough volume, and spot dump', () => {
  assert.equal(evaluateFeeTvlDumpGuard(candidate(), strategy, { nowMs: NOW }).passed, true);

  assert.match(evaluateFeeTvlDumpGuard(candidate({ fees24hUsd: 1_900 }), strategy, { nowMs: NOW }).failures.join('; '), /fee\/tvl 24h/);
  assert.match(evaluateFeeTvlDumpGuard(candidate({ ageHours: 6 }), strategy, { nowMs: NOW }).failures.join('; '), /token age min/);
  assert.match(evaluateFeeTvlDumpGuard(candidate({ ageHours: 72 }), strategy, { nowMs: NOW }).failures.join('; '), /token age max/);
  assert.match(evaluateFeeTvlDumpGuard(candidate({ volume24hUsd: 20_000 }), strategy, { nowMs: NOW }).failures.join('; '), /volume\/tvl 24h/);
  assert.match(evaluateFeeTvlDumpGuard(candidate({ distanceFromAthPercent: -5 }), strategy, { nowMs: NOW }).failures.join('; '), /spot dump min/);
  assert.match(evaluateFeeTvlDumpGuard(candidate({ distanceFromAthPercent: -60 }), strategy, { nowMs: NOW }).failures.join('; '), /spot dump max/);
});
