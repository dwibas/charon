import Database from 'better-sqlite3';
import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanupOperationalData } from '../src/db/cleanup.js';

test('cleanupOperationalData expires stale pending alerts and prunes old terminal alerts/logs/events', () => {
  const database = new Database(':memory:');
  const nowMs = 1_700_000_000_000;
  database.exec(`
    CREATE TABLE price_alerts (id INTEGER PRIMARY KEY, status TEXT, created_at_ms INTEGER, expires_at_ms INTEGER);
    CREATE TABLE decision_logs (id INTEGER PRIMARY KEY, at_ms INTEGER);
    CREATE TABLE signal_events (id INTEGER PRIMARY KEY, at_ms INTEGER);
  `);
  database.prepare('INSERT INTO price_alerts VALUES (?, ?, ?, ?)').run(1, 'pending', nowMs - 10_000, nowMs - 1);
  database.prepare('INSERT INTO price_alerts VALUES (?, ?, ?, ?)').run(2, 'triggered', nowMs - 10 * 24 * 60 * 60 * 1000, nowMs - 9 * 24 * 60 * 60 * 1000);
  database.prepare('INSERT INTO price_alerts VALUES (?, ?, ?, ?)').run(3, 'pending', nowMs, nowMs + 60_000);
  database.prepare('INSERT INTO decision_logs VALUES (?, ?)').run(1, nowMs - 40 * 24 * 60 * 60 * 1000);
  database.prepare('INSERT INTO decision_logs VALUES (?, ?)').run(2, nowMs);
  database.prepare('INSERT INTO signal_events VALUES (?, ?)').run(1, nowMs - 40 * 24 * 60 * 60 * 1000);
  database.prepare('INSERT INTO signal_events VALUES (?, ?)').run(2, nowMs);

  const result = cleanupOperationalData(database, { nowMs, alertRetentionDays: 7, logRetentionDays: 30, signalRetentionDays: 30 });

  assert.deepEqual(result, { expiredPendingAlerts: 1, deletedTerminalAlerts: 1, deletedDecisionLogs: 1, deletedSignalEvents: 1 });
  assert.equal(database.prepare("SELECT status FROM price_alerts WHERE id = 1").get().status, 'expired');
  assert.equal(database.prepare("SELECT COUNT(*) AS c FROM price_alerts WHERE id = 2").get().c, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS c FROM decision_logs").get().c, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS c FROM signal_events").get().c, 1);
});
