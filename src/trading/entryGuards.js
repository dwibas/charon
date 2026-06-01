export function positionCreationResult({ existingId = null, insertedId = null } = {}) {
  if (existingId != null) return { positionId: Number(existingId), created: false };
  return { positionId: Number(insertedId), created: true };
}

export function shouldSkipSameMintEntry({ openPosition = null, lastClosedPosition = null, nowMs = Date.now(), cooldownMs = 0 } = {}) {
  if (openPosition?.id != null) {
    return { skip: true, reason: 'open_position', positionId: Number(openPosition.id), remainingMs: null };
  }
  const closedAt = Number(lastClosedPosition?.closed_at_ms || 0);
  const cooldown = Number(cooldownMs || 0);
  if (lastClosedPosition?.id != null && cooldown > 0 && closedAt > 0) {
    const elapsed = Number(nowMs) - closedAt;
    if (elapsed < cooldown) {
      return {
        skip: true,
        reason: 'cooldown',
        positionId: Number(lastClosedPosition.id),
        remainingMs: cooldown - elapsed,
      };
    }
  }
  return { skip: false, reason: null, positionId: null, remainingMs: 0 };
}

function finitePositive(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parseTimeMs(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function volume24hUsd(candidate = {}) {
  const jupStats24h = candidate.jupiterAsset?.stats24h || {};
  const trendStats24h = candidate.trending?.stats24h || {};
  return finitePositive(
    candidate.metrics?.volume24hUsd,
    candidate.trending?.volume24h,
    candidate.jupiterAsset?.volume24h,
    Number(jupStats24h.buyVolume || 0) + Number(jupStats24h.sellVolume || 0),
    Number(trendStats24h.buyVolume || 0) + Number(trendStats24h.sellVolume || 0),
  );
}

function fees24hUsd(candidate = {}) {
  return finitePositive(
    candidate.metrics?.fees24hUsd,
    candidate.metrics?.fee24hUsd,
    candidate.jupiterAsset?.fees24h,
    candidate.jupiterAsset?.fees,
    candidate.trending?.fees24h,
    candidate.trending?.fees24hUsd,
  );
}

function tokenStartMs(candidate = {}) {
  return parseTimeMs(
    candidate.metrics?.tokenCreatedAtMs,
    candidate.metrics?.tokenCreatedAt,
    candidate.trending?.createdAt,
    candidate.jupiterAsset?.firstPool?.createdAt,
    candidate.jupiterAsset?.createdAt,
    candidate.gmgn?.open_timestamp,
    candidate.gmgn?.migrated_timestamp,
    candidate.gmgn?.creation_timestamp,
  );
}

function dumpFromHighPercent(candidate = {}) {
  const chartWindow = candidate.chart?.windows?.find(row => row.label === 'ath_context_24h_5m' && row.available)
    || candidate.chart?.windows?.find(row => row.available);
  const belowHigh = finitePositive(
    candidate.metrics?.dumpFromHighPercent,
    candidate.metrics?.spotDumpPercent,
    Math.abs(Number(candidate.chart?.distanceFromAthPercent || NaN)),
    Math.abs(Number(candidate.chart?.belowRangeHighPercent || NaN)),
    Math.abs(Number(chartWindow?.belowHighPercent || NaN)),
  );
  return belowHigh;
}

export function buildFeeTvlDumpMetrics(candidate = {}, { nowMs = Date.now() } = {}) {
  const liquidityUsd = finitePositive(candidate.metrics?.liquidityUsd, candidate.jupiterAsset?.liquidity, candidate.trending?.liquidity, candidate.gmgn?.liquidity);
  const feeUsd = fees24hUsd(candidate);
  const volumeUsd = volume24hUsd(candidate);
  const startedAtMs = tokenStartMs(candidate);
  const ageMs = startedAtMs ? Number(nowMs) - startedAtMs : null;
  const dumpPct = dumpFromHighPercent(candidate);
  const priceChange5m = Number(candidate.trending?.stats5m?.priceChange ?? candidate.trending?.change5m ?? NaN);
  return {
    liquidityUsd,
    fees24hUsd: feeUsd,
    volume24hUsd: volumeUsd,
    tokenStartedAtMs: startedAtMs,
    tokenAgeMs: Number.isFinite(ageMs) && ageMs >= 0 ? ageMs : null,
    tokenAgeHours: Number.isFinite(ageMs) && ageMs >= 0 ? ageMs / 3_600_000 : null,
    feeTvl24h: liquidityUsd > 0 && feeUsd > 0 ? feeUsd / liquidityUsd : null,
    volumeTvl24h: liquidityUsd > 0 && volumeUsd > 0 ? volumeUsd / liquidityUsd : null,
    dumpFromHighPercent: dumpPct,
    spotOnDump: Number.isFinite(dumpPct) && dumpPct > 0 && (!Number.isFinite(priceChange5m) || priceChange5m <= 0),
    priceChange5m: Number.isFinite(priceChange5m) ? priceChange5m : null,
  };
}

export function evaluateFeeTvlDumpGuard(candidate = {}, strat = {}, { nowMs = Date.now() } = {}) {
  if (strat.fee_tvl_dump_enabled !== true) return { passed: true, failures: [], metrics: buildFeeTvlDumpMetrics(candidate, { nowMs }) };
  const metrics = buildFeeTvlDumpMetrics(candidate, { nowMs });
  const failures = [];
  const minFeeTvl = Number(strat.min_fee_tvl_24h ?? 0.20);
  const minAgeMs = Number(strat.token_age_min_ms ?? 12 * 60 * 60 * 1000);
  const maxAgeMs = Number(strat.token_age_max_ms ?? 48 * 60 * 60 * 1000);
  const minVolumeTvl = Number(strat.min_volume_tvl_24h ?? 3);
  const minDump = Number(strat.min_dump_from_high_percent ?? 15);
  const maxDump = Number(strat.max_dump_from_high_percent ?? 45);

  if (!Number.isFinite(metrics.feeTvl24h) || metrics.feeTvl24h < minFeeTvl) {
    failures.push(`fee/tvl 24h: ${Number(metrics.feeTvl24h || 0).toFixed(3)} < ${minFeeTvl}`);
  }
  if (!Number.isFinite(metrics.tokenAgeMs) || metrics.tokenAgeMs < minAgeMs) {
    failures.push(`token age min: ${Number(metrics.tokenAgeHours || 0).toFixed(1)}h < ${(minAgeMs / 3_600_000).toFixed(1)}h`);
  }
  if (Number.isFinite(metrics.tokenAgeMs) && Number.isFinite(maxAgeMs) && maxAgeMs > 0 && metrics.tokenAgeMs > maxAgeMs) {
    failures.push(`token age max: ${Number(metrics.tokenAgeHours || 0).toFixed(1)}h > ${(maxAgeMs / 3_600_000).toFixed(1)}h`);
  }
  if (!Number.isFinite(metrics.volumeTvl24h) || metrics.volumeTvl24h < minVolumeTvl) {
    failures.push(`volume/tvl 24h: ${Number(metrics.volumeTvl24h || 0).toFixed(2)} < ${minVolumeTvl}`);
  }
  if (strat.require_spot_dump !== false) {
    if (!Number.isFinite(metrics.dumpFromHighPercent) || metrics.dumpFromHighPercent < minDump) {
      failures.push(`spot dump min: ${Number(metrics.dumpFromHighPercent || 0).toFixed(1)}% < ${minDump}%`);
    }
    if (Number.isFinite(metrics.dumpFromHighPercent) && Number.isFinite(maxDump) && maxDump > 0 && metrics.dumpFromHighPercent > maxDump) {
      failures.push(`spot dump max: ${Number(metrics.dumpFromHighPercent || 0).toFixed(1)}% > ${maxDump}%`);
    }
    if (metrics.spotOnDump !== true) failures.push('spot dump: not currently on dump/pullback');
  }
  return { passed: failures.length === 0, failures, metrics };
}
