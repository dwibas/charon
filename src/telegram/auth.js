export function normalizeChatId(chatId) {
  if (chatId === undefined || chatId === null || chatId === '') return null;
  return String(chatId);
}

export function isAuthorizedTelegramChat(chatId, allowedChatId) {
  const expected = normalizeChatId(allowedChatId);
  if (!expected) return false;
  return normalizeChatId(chatId) === expected;
}

export function isAuthorizedTelegramMessage(msg, allowedChatId) {
  return isAuthorizedTelegramChat(msg?.chat?.id, allowedChatId);
}

export function isAuthorizedTelegramCallback(query, allowedChatId) {
  return isAuthorizedTelegramChat(query?.message?.chat?.id, allowedChatId);
}

export function logUnauthorizedTelegram(kind, actualChatId, allowedChatId) {
  console.log(`[telegram] unauthorized ${kind} from chat ${normalizeChatId(actualChatId) ?? 'unknown'}; expected ${normalizeChatId(allowedChatId) ?? 'unset'}`);
}
