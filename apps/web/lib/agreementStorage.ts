/** Версия соглашения (должна совпадать с бэкендом). */
export const AGREEMENT_VERSION = 'v1.0';

const STORAGE_KEY = 'exam_guest_agreement';

export interface GuestAgreementSnapshot {
  accepted: boolean;
  version: string;
  acceptedAt: string;
}

export function getGuestAgreement(): GuestAgreementSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== 'object' || data === null || !('accepted' in data) || !('version' in data)) return null;
    const { accepted, version, acceptedAt } = data as { accepted?: unknown; version?: unknown; acceptedAt?: unknown };
    if (accepted !== true || typeof version !== 'string') return null;
    return { accepted: true, version, acceptedAt: typeof acceptedAt === 'string' ? acceptedAt : '' };
  } catch {
    return null;
  }
}

export function setGuestAgreement(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accepted: true,
        version: AGREEMENT_VERSION,
        acceptedAt: new Date().toISOString(),
      })
    );
  } catch {
    // ignore
  }
}

export function hasGuestAcceptedAgreement(): boolean {
  const snap = getGuestAgreement();
  return snap?.accepted === true && snap?.version === AGREEMENT_VERSION;
}
