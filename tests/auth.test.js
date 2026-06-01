import test from 'node:test';
import assert from 'node:assert/strict';

import { isAuthorizedTelegramMessage, isAuthorizedTelegramCallback } from '../src/telegram/auth.js';

test('telegram auth accepts only configured chat for messages', () => {
  assert.equal(isAuthorizedTelegramMessage({ chat: { id: 123 } }, '123'), true);
  assert.equal(isAuthorizedTelegramMessage({ chat: { id: 999 } }, '123'), false);
  assert.equal(isAuthorizedTelegramMessage({}, '123'), false);
});

test('telegram auth accepts only callbacks from configured message chat', () => {
  assert.equal(isAuthorizedTelegramCallback({ message: { chat: { id: -100 } } }, '-100'), true);
  assert.equal(isAuthorizedTelegramCallback({ message: { chat: { id: -200 } } }, '-100'), false);
  assert.equal(isAuthorizedTelegramCallback({ data: 'buy:1' }, '-100'), false);
});
