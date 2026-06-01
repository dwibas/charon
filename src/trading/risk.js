function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function approvedByLlmThreshold(decision, strategy = {}, options = {}) {
  const verdict = String(decision?.verdict || '').toUpperCase();
  if (verdict !== 'BUY') return false;
  const confidence = finiteNumber(decision?.confidence, 0);
  const threshold = finiteNumber(strategy?.llm_min_confidence, finiteNumber(options.globalLlmMinConfidence, 75));
  return confidence >= threshold;
}

export function resolvePositionRisk({ strategy = {}, decision = {}, settings = {} }) {
  const defaultTp = finiteNumber(settings.defaultTpPercent, 50);
  const defaultSl = finiteNumber(settings.defaultSlPercent, -25);
  const allowLlmTpSl = Boolean(settings.allowLlmTpSl);

  const strategyTp = finiteNumber(strategy.tp_percent, defaultTp);
  const strategySl = finiteNumber(strategy.sl_percent, defaultSl);
  const decisionTp = finiteNumber(decision.suggested_tp_percent, strategyTp);
  const decisionSl = finiteNumber(decision.suggested_sl_percent, strategySl);

  const trailingEnabled = strategy.trailing_enabled ?? Boolean(settings.defaultTrailingEnabled);
  const trailingPercent = finiteNumber(strategy.trailing_percent, finiteNumber(settings.defaultTrailingPercent, 20));

  return {
    tpPercent: allowLlmTpSl ? decisionTp : strategyTp,
    slPercent: allowLlmTpSl ? decisionSl : strategySl,
    trailingEnabled: trailingEnabled ? 1 : 0,
    trailingPercent,
  };
}
