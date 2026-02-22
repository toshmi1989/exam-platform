import { prisma } from '../../db/prisma';
import { getSessionTtl, expireSession } from './oral.redis';

/**
 * Check if the session's Redis timer has expired.
 * If expired, marks the session as 'timeout' in the DB and returns true.
 * Returns false if the session is still active.
 */
export async function checkAndExpireSession(sessionId: string): Promise<boolean> {
  const ttl = await getSessionTtl(sessionId);

  // TTL = -2 means key doesn't exist (expired or never set)
  // TTL = -1 means key exists with no expiry (shouldn't happen)
  if (ttl === -2 || ttl === 0) {
    await markSessionTimeout(sessionId);
    return true; // expired
  }

  return false; // still active
}

async function markSessionTimeout(sessionId: string): Promise<void> {
  try {
    const session = await prisma.oralExamSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (session && session.status === 'active') {
      await prisma.oralExamSession.update({
        where: { id: sessionId },
        data: {
          status: 'timeout',
          finishedAt: new Date(),
        },
      });
      await expireSession(sessionId);
    }
  } catch (err) {
    console.error('[oral.timer] Failed to mark session timeout:', err);
  }
}
