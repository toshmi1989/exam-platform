import redis from '../../lib/redis';

const LOCK_TTL_S = 30;
const EXPLANATION_TTL_S = 3600; // 1 hour
const SESSION_TTL_S = 900; // 15 minutes
const RATE_LIMIT_KEY_PREFIX = 'rate:oral:user:';
const LOCK_KEY_PREFIX = 'lock:question:';
const EXPLANATION_KEY_PREFIX = 'question:';
const SESSION_KEY_PREFIX = 'oral:session:';

// ─── Helpers ────────────────────────────────────────────────────────────────

function secondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

async function safeRedis<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ─── Locks ──────────────────────────────────────────────────────────────────

export async function acquireLock(key: string, ttlSeconds = LOCK_TTL_S): Promise<boolean> {
  return safeRedis(async () => {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }, true); // fallback: act as if lock is acquired (no double-blocking on Redis failure)
}

export async function releaseLock(key: string): Promise<void> {
  await safeRedis(() => redis.del(key), 0);
}

export function questionLockKey(questionId: string): string {
  return `${LOCK_KEY_PREFIX}${questionId}`;
}

export function ttsLockKey(questionId: string, lang: string): string {
  return `lock:tts:${questionId}:${lang}`;
}

/** Poll Redis every 500ms until the lock is released or retries exhausted. */
export async function waitForLockRelease(lockKey: string, retries = 10): Promise<void> {
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const exists = await safeRedis(() => redis.exists(lockKey), 0);
    if (!exists) return;
  }
}

// ─── Explanation cache ───────────────────────────────────────────────────────

export async function getExplanationCache(questionId: string): Promise<string | null> {
  return safeRedis(
    () => redis.get(`${EXPLANATION_KEY_PREFIX}${questionId}:explanation`),
    null
  );
}

export async function setExplanationCache(questionId: string, content: string): Promise<void> {
  await safeRedis(
    () => redis.set(`${EXPLANATION_KEY_PREFIX}${questionId}:explanation`, content, 'EX', EXPLANATION_TTL_S),
    null
  );
}

// ─── Session timer ───────────────────────────────────────────────────────────

export async function setSessionTimer(sessionId: string, ttlSeconds = SESSION_TTL_S): Promise<void> {
  await safeRedis(
    () => redis.set(`${SESSION_KEY_PREFIX}${sessionId}:expires`, '1', 'EX', ttlSeconds),
    null
  );
}

export async function getSessionTtl(sessionId: string): Promise<number> {
  return safeRedis(
    () => redis.ttl(`${SESSION_KEY_PREFIX}${sessionId}:expires`),
    SESSION_TTL_S // fallback: assume session is still valid
  );
}

export async function expireSession(sessionId: string): Promise<void> {
  await safeRedis(
    () => redis.del(`${SESSION_KEY_PREFIX}${sessionId}:expires`),
    0
  );
}

// ─── Rate limit ──────────────────────────────────────────────────────────────

/**
 * Check and consume the daily rate limit for an oral exam session.
 * Returns { allowed: true } if the user hasn't taken an exam today.
 * Returns { allowed: false, message } if the limit is exceeded.
 * Admins always pass.
 */
export async function checkAndConsumeRateLimit(
  userId: string,
  isAdmin: boolean
): Promise<{ allowed: boolean; message?: string }> {
  if (isAdmin) return { allowed: true };

  const key = `${RATE_LIMIT_KEY_PREFIX}${userId}`;

  try {
    const existing = await redis.get(key);
    if (existing) {
      return {
        allowed: false,
        message:
          'Устный экзамен можно сдавать только 1 раз в сутки. Попробуйте снова завтра.',
      };
    }
    // Mark as used; TTL until midnight
    const ttl = secondsUntilMidnight();
    await redis.set(key, '1', 'EX', ttl);
    return { allowed: true };
  } catch {
    // Redis unavailable — allow (don't block users due to infra failure)
    return { allowed: true };
  }
}
