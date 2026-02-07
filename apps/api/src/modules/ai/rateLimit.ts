/**
 * In-memory rate limiter: max 2 requests per second (sliding window).
 * Used for POST /ai/explain to avoid cost spikes.
 */

const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 2;
const timestamps: number[] = [];

function prune() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  while (timestamps.length && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

export function checkAiRateLimit(): boolean {
  prune();
  if (timestamps.length >= MAX_PER_WINDOW) {
    return false;
  }
  timestamps.push(Date.now());
  return true;
}
