import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSuppressCodexFailureNotification } from '../src/pipeline/codexCli.js';

test('shouldSuppressCodexFailureNotification suppresses codex_cli_error fallback decisions', () => {
  assert.equal(shouldSuppressCodexFailureNotification({ risks: ['codex_cli_error'], reason: 'Codex CLI failed: usage limit' }), true);
});

test('shouldSuppressCodexFailureNotification does not suppress normal decisions', () => {
  assert.equal(shouldSuppressCodexFailureNotification({ risks: [], verdict: 'BUY', reason: 'good setup' }), false);
});
