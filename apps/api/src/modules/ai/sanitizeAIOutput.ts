/**
 * Sanitize AI output before sending to end users (e.g. Telegram).
 * Removes system tags and role metadata that must never be shown.
 */
export function sanitizeAIOutput(text: string): string {
  return text
    .replace(/<\/?system>/gi, '')
    .replace(/role:\s*system/gi, '')
    .trim();
}

/**
 * Filter messages so only user and assistant are visible.
 * Use before serializing chat history for client or Telegram.
 */
export function filterVisibleMessages<T extends { role?: string }>(messages: T[]): T[] {
  return messages.filter((m) => m.role === 'assistant' || m.role === 'user');
}
