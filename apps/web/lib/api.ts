import {
  ApiError,
  AttemptRef,
  ExamQuestion,
  ExamResult,
  UserProfile,
  AttemptHistoryItem,
  ExamReview,
} from './types';
import { apiFetch } from './api/client';

function extractAttemptId(data: unknown): string {
  // TODO: adjust to actual API response shape.
  if (typeof data === 'object' && data && 'attemptId' in data) {
    return (data as { attemptId: string }).attemptId;
  }
  if (
    typeof data === 'object' &&
    data &&
    'attempt' in data &&
    typeof (data as { attempt?: { id?: string } }).attempt?.id === 'string'
  ) {
    return (data as { attempt?: { id?: string } }).attempt?.id as string;
  }
  throw new Error('Unable to resolve attemptId from response.');
}

export async function createAttempt(
  examId: string,
  mode: 'exam' | 'practice'
): Promise<AttemptRef> {
  const { response, data } = await apiFetch('/attempts', {
    method: 'POST',
    json: { examId, mode },
  });
  if (!response.ok) {
    throw data as ApiError;
  }
  const raw = data as unknown;

  return {
    attemptId: extractAttemptId(raw),
    raw,
  };
}

export async function startAttempt(attemptId: string): Promise<unknown> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/start`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw data as ApiError;
  }
  return data;
}

export async function saveAnswer(
  attemptId: string,
  questionId: string,
  answer: string
): Promise<unknown> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/answer`, {
    method: 'POST',
    json: { questionId, answer },
  });
  if (!response.ok) {
    throw data as ApiError;
  }
  return data;
}

export async function submitAttempt(
  attemptId: string
): Promise<unknown> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/submit`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw data as ApiError;
  }
  return data;
}

export async function getQuestions(
  attemptId: string
): Promise<{ questions: ExamQuestion[]; mode?: 'exam' | 'practice' }> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/questions`);
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as { questions?: ExamQuestion[]; mode?: 'exam' | 'practice' } | null;
  return { questions: payload?.questions ?? [], mode: payload?.mode };
}

export async function getResult(
  attemptId: string
): Promise<ExamResult> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/result`);
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as { result?: ExamResult } | null;
  return (payload?.result ?? { score: 0, maxScore: 0 }) as ExamResult;
}

export async function getReview(
  attemptId: string
): Promise<ExamReview> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/review`);
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as { questions?: ExamReview['questions']; answers?: Record<string, string> } | null;
  return {
    questions: payload?.questions ?? [],
    answers: payload?.answers ?? {},
  };
}

export async function getProfile(): Promise<UserProfile> {
  const { response, data } = await apiFetch('/me');
  if (!response.ok) {
    throw data as ApiError;
  }
  return data as UserProfile;
}

export async function acceptAgreement(): Promise<void> {
  if (typeof window !== 'undefined') {
    const { readTelegramUser } = await import('./telegramUser');
    const user = readTelegramUser();
    const res = await fetch('/api/accept-agreement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user?.telegramId ? { 'x-telegram-id': user.telegramId } : {}),
      },
      body: '{}',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw (data as ApiError) ?? { reasonCode: 'UNKNOWN', message: 'Не удалось сохранить' };
    }
    return;
  }
  const { response, data } = await apiFetch('/accept-agreement', {
    method: 'POST',
    json: {},
  });
  if (!response.ok) {
    throw data as ApiError;
  }
}

export async function getAttemptHistory(): Promise<AttemptHistoryItem[]> {
  // TODO: replace with actual attempt history endpoint.
  const { response, data } = await apiFetch('/me/attempts');
  if (!response.ok) {
    throw data as ApiError;
  }
  return (data as AttemptHistoryItem[]) ?? [];
}

export async function getChatUnread(): Promise<number> {
  const { response, data } = await apiFetch('/chat/unread');
  if (!response.ok) {
    return 0;
  }
  const payload = data as { unread?: number } | null;
  return typeof payload?.unread === 'number' ? payload.unread : 0;
}

export async function getAdminChatsUnreadCount(): Promise<number> {
  const { response, data } = await apiFetch('/admin/chats/unread-count');
  if (!response.ok) {
    return 0;
  }
  const payload = data as { total?: number } | null;
  return typeof payload?.total === 'number' ? payload.total : 0;
}

export interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  attemptsToday: number;
  conversion: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { response, data } = await apiFetch('/admin/stats');
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as AdminStats | null;
  return (
    payload ?? {
      totalUsers: 0,
      activeSubscriptions: 0,
      attemptsToday: 0,
      conversion: 0,
    }
  );
}

export interface AdminAnalytics {
  attemptsByDay: { date: string; count: number }[];
  topExams: { examId: string; title: string; attemptCount: number }[];
  conversion: { subscribed: number; total: number };
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const { response, data } = await apiFetch('/admin/analytics');
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as AdminAnalytics | null;
  return (
    payload ?? {
      attemptsByDay: [],
      topExams: [],
      conversion: { subscribed: 0, total: 0 },
    }
  );
}

export async function purchaseOneTimeAccess(examId: string): Promise<void> {
  const { response, data } = await apiFetch('/payments/one-time', {
    method: 'POST',
    json: { examId },
  });
  if (!response.ok) {
    throw data as ApiError;
  }
}

export interface CreatePaymentParams {
  kind: 'one-time' | 'subscription';
  paymentSystem: string;
  examId?: string;
  mode?: 'exam' | 'practice';
}

export interface CreatePaymentResult {
  checkout_url: string;
  invoiceId: string;
}

export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const { response, data } = await apiFetch('/payments/create', {
    method: 'POST',
    json: params as unknown as Record<string, unknown>,
  });
  if (!response.ok) {
    const payload = data as ApiError & { reasonCode?: string; message?: string };
    if (payload?.reasonCode === 'INVALID_RETURN_URL') {
      throw new Error(payload?.message ?? 'Укажите на сервере FRONTEND_URL — публичный HTTPS-адрес (например ngrok).');
    }
    throw payload as ApiError;
  }
  const payload = data as { checkout_url?: string; invoiceId?: string } | null;
  const checkout_url = payload?.checkout_url ?? '';
  const invoiceId = payload?.invoiceId ?? '';
  if (!checkout_url || !invoiceId) {
    throw new Error('Invalid createPayment response');
  }
  return { checkout_url, invoiceId };
}

export interface PaymentStatusResult {
  status: string;
  kind?: string;
  examId?: string | null;
  receiptUrl?: string;
  amountTiyin?: number;
  subscriptionEndsAt?: string | null;
}

export async function getPaymentStatus(invoiceId: string): Promise<PaymentStatusResult> {
  const { response, data } = await apiFetch(`/payments/status/${encodeURIComponent(invoiceId)}`);
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as PaymentStatusResult | null;
  return {
    status: payload?.status ?? 'created',
    kind: payload?.kind,
    examId: payload?.examId,
    receiptUrl: payload?.receiptUrl,
    amountTiyin: payload?.amountTiyin,
    subscriptionEndsAt: payload?.subscriptionEndsAt,
  };
}

export type { ApiError };
