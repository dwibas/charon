const DAY_MS = 24 * 60 * 60 * 1000;

function deleteIfTableExists(database, table, column, cutoff) {
  const exists = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return 0;
  return database.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(cutoff).changes;
}

export function cleanupOperationalData(database, {
  nowMs = Date.now(),
  alertRetentionDays = 7,
  logRetentionDays = 30,
  signalRetentionDays = 30,
} = {}) {
  const expiredPendingAlerts = database.prepare(
    "UPDATE price_alerts SET status = 'expired' WHERE status = 'pending' AND expires_at_ms <= ?"
  ).run(nowMs).changes;

  const alertCutoff = nowMs - alertRetentionDays * DAY_MS;
  const deletedTerminalAlerts = database.prepare(
    "DELETE FROM price_alerts WHERE status IN ('triggered', 'expired') AND created_at_ms < ?"
  ).run(alertCutoff).changes;

  const deletedDecisionLogs = deleteIfTableExists(database, 'decision_logs', 'at_ms', nowMs - logRetentionDays * DAY_MS);
  const deletedSignalEvents = deleteIfTableExists(database, 'signal_events', 'at_ms', nowMs - signalRetentionDays * DAY_MS);

  return { expiredPendingAlerts, deletedTerminalAlerts, deletedDecisionLogs, deletedSignalEvents };
}

export function logCleanupResult(result, prefix = '[cleanup]') {
  const total = Object.values(result).reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) return;
  console.log(`${prefix} expired pending alerts=${result.expiredPendingAlerts}, deleted terminal alerts=${result.deletedTerminalAlerts}, decision_logs=${result.deletedDecisionLogs}, signal_events=${result.deletedSignalEvents}`);
}
