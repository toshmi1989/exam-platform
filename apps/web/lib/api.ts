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
import { API_BASE_URL } from './api/config';
import { readTelegramUser } from './telegramUser';

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
): Promise<{
  questions: ExamQuestion[];
  mode?: 'exam' | 'practice';
  examTitle?: string;
  examDirection?: string;
}> {
  const { response, data } = await apiFetch(`/attempts/${attemptId}/questions`);
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as {
    questions?: ExamQuestion[];
    mode?: 'exam' | 'practice';
    examTitle?: string;
    examDirection?: string;
  } | null;
  return {
    questions: payload?.questions ?? [],
    mode: payload?.mode,
    examTitle: payload?.examTitle,
    examDirection: payload?.examDirection,
  };
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

export async function dismissBroadcast(broadcastId: string): Promise<void> {
  const { response, data } = await apiFetch('/broadcasts/dismiss', {
    method: 'POST',
    json: { broadcastId },
  });
  if (!response.ok) {
    throw data as ApiError;
  }
}

export async function acceptAgreement(): Promise<void> {
  if (typeof window !== 'undefined') {
    const { readTelegramUser } = await import('./telegramUser');
    const user = readTelegramUser();
    const telegramId = user?.telegramId;
    if (!telegramId) {
      throw { reasonCode: 'AUTH_REQUIRED', message: 'Сессия не найдена. Войдите снова.' };
    }
    const tryProxy = async (): Promise<void> => {
      const res = await fetch('/api/accept-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-id': telegramId },
        body: '{}',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw (data as ApiError) ?? { reasonCode: 'UNKNOWN', message: 'Не удалось сохранить. Попробуйте снова.' };
      }
    };
    const tryDirect = async (): Promise<void> => {
      const { response, data } = await apiFetch('/accept-agreement', { method: 'POST', json: {} });
      if (!response.ok) throw (data as ApiError) ?? { reasonCode: 'UNKNOWN', message: 'Не удалось сохранить.' };
    };
    try {
      await tryProxy();
    } catch (proxyErr) {
      try {
        await tryDirect();
      } catch {
        throw proxyErr;
      }
    }
    return;
  }
  const { response, data } = await apiFetch('/accept-agreement', { method: 'POST', json: {} });
  if (!response.ok) throw data as ApiError;
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

export interface BroadcastItem {
  id: string;
  title: string;
  text: string;
  segment: string;
  createdAt: number;
  imageData?: string;
}

export async function getBroadcasts(): Promise<BroadcastItem[]> {
  const { response, data } = await apiFetch('/broadcasts');
  if (!response.ok) {
    return [];
  }
  const payload = data as { items?: BroadcastItem[] } | null;
  return Array.isArray(payload?.items) ? payload.items : [];
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
  subscriptionsToday: number;
  subscriptionsThisMonth: number;
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
      subscriptionsToday: 0,
      subscriptionsThisMonth: 0,
    }
  );
}

export interface AdminAnalytics {
  attemptsByDay: { date: string; count: number }[];
  topExams: { examId: string; title: string; attemptCount: number }[];
  topOralExams: { examId: string; title: string; attemptCount: number }[];
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
      topOralExams: [],
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

export async function getOralQuestions(examId: string): Promise<{ id: string; prompt: string; order: number }[]> {
  const { response, data } = await apiFetch(`/exams/${encodeURIComponent(examId)}/oral-questions`);
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as { questions?: { id: string; prompt: string; order: number }[] } | null;
  return payload?.questions ?? [];
}

export async function getOralAnswer(questionId: string): Promise<{ content: string }> {
  const { response, data } = await apiFetch('/oral/answer', {
    method: 'POST',
    json: { questionId },
  });
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as { content?: string } | null;
  if (typeof payload?.content !== 'string') {
    throw new Error('Invalid oral answer response');
  }
  return { content: payload.content };
}

/**
 * Stream oral answer (SSE). Calls onChunk for each piece of content, onDone when finished.
 * Use for lower perceived latency while AI generates.
 */
export async function streamOralAnswer(
  questionId: string,
  onChunk: (content: string) => void,
  onDone: () => void
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  }
  const res = await fetch(`${API_BASE_URL}/oral/answer/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ questionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw (err as ApiError) || new Error('Failed to load answer');
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; error?: boolean };
            if (data.error) throw new Error('Generation failed');
            if (data.content) onChunk(data.content);
            if (data.done) onDone();
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6)) as { content?: string; done?: boolean; error?: boolean };
        if (data.content) onChunk(data.content);
      } catch {
        // ignore
      }
    }
  } finally {
    onDone();
  }
}

/** Язык ответа определяется по языку экзамена (теста) на бэкенде. */
export async function explainQuestion(questionId: string): Promise<{ content: string }> {
  const { response, data } = await apiFetch('/ai/explain', {
    method: 'POST',
    json: { questionId },
  });
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as { content?: string } | null;
  if (typeof payload?.content !== 'string') {
    throw new Error('Invalid explain response');
  }
  return { content: payload.content };
}

/**
 * Stream Ziyoda explanation (SSE). Calls onChunk for each piece, onDone when finished.
 * Use for lower perceived latency while AI generates.
 */
export async function streamExplainQuestion(
  questionId: string,
  onChunk: (content: string) => void,
  onDone: () => void
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  }
  const res = await fetch(`${API_BASE_URL}/ai/explain/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ questionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw (err as ApiError) || new Error('Failed to load explanation');
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as { content?: string; done?: boolean; error?: boolean };
            if (data.error) throw new Error('Generation failed');
            if (data.content) onChunk(data.content);
            if (data.done) onDone();
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6)) as { content?: string; done?: boolean };
        if (data.content) onChunk(data.content);
      } catch {
        // ignore
      }
    }
  } finally {
    onDone();
  }
}

export interface AdminAiStatsByExam {
  examId: string;
  title: string;
  total: number;
  withExplanation: number;
}

export interface AdminAiStats {
  totalQuestions: number;
  withExplanation: number;
  missing: number;
  byExam: AdminAiStatsByExam[];
}

export async function getAdminAiStats(): Promise<AdminAiStats> {
  const { response, data } = await apiFetch('/admin/ai/stats');
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as AdminAiStats | null;
  return (
    payload ?? {
      totalQuestions: 0,
      withExplanation: 0,
      missing: 0,
      byExam: [],
    }
  );
}

export interface PrewarmProgress {
  total: number;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  currentQuestionId: string | null;
  done?: boolean;
  error?: string;
}

/**
 * POST /admin/ai/prewarm/stream and stream progress via SSE.
 * Calls onProgress for each event. Resolves when stream ends; rejects on fetch/parse error.
 */
export async function streamPrewarm(
  params: { examId?: string; lang?: 'ru' | 'uz' },
  onProgress: (p: PrewarmProgress) => void
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  }

  const res = await fetch(`${API_BASE_URL}/admin/ai/prewarm/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw (err as ApiError) ?? new Error('Prewarm failed');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const dec = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const m = block.match(/^data:\s*(.+)$/m);
        if (m) {
          try {
            const p = JSON.parse(m[1]) as PrewarmProgress;
            onProgress(p);
          } catch {
            // skip malformed
          }
        }
      }
    }
    if (buffer) {
      const m = buffer.match(/^data:\s*(.+)$/m);
      if (m) {
        try {
          const p = JSON.parse(m[1]) as PrewarmProgress;
          onProgress(p);
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface AdminOralStatsByExam {
  examId: string;
  title: string;
  category?: string;
  total: number;
  withAnswer: number;
}

export interface AdminOralStats {
  totalOralQuestions: number;
  withAnswer: number;
  missing: number;
  byExam: AdminOralStatsByExam[];
}

export async function getAdminOralStats(): Promise<AdminOralStats> {
  const { response, data } = await apiFetch('/admin/ai/oral/stats');
  if (!response.ok) {
    throw data as ApiError;
  }
  const payload = data as AdminOralStats | null;
  return (
    payload ?? {
      totalOralQuestions: 0,
      withAnswer: 0,
      missing: 0,
      byExam: [],
    }
  );
}

export interface OralPrewarmProgress {
  total: number;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  currentQuestionId: string | null;
  done?: boolean;
}

export async function streamOralPrewarm(
  params: { examId?: string },
  onProgress: (p: OralPrewarmProgress) => void
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  }
  const res = await fetch(`${API_BASE_URL}/admin/ai/oral/prewarm/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw (err as ApiError) ?? new Error('Oral prewarm failed');
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const m = block.match(/^data:\s*(.+)$/m);
        if (m) {
          try {
            const p = JSON.parse(m[1]) as OralPrewarmProgress;
            onProgress(p);
          } catch {
            // skip
          }
        }
      }
    }
    if (buffer) {
      const m = buffer.match(/^data:\s*(.+)$/m);
      if (m) {
        try {
          const p = JSON.parse(m[1]) as OralPrewarmProgress;
          onProgress(p);
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface KnowledgeStats {
  totalEntries: number;
  totalCacheEntries: number;
}

export interface KnowledgeEntryItem {
  id: string;
  title: string;
  source: string;
  createdAt: string;
}

export async function getKnowledgeStats(): Promise<KnowledgeStats> {
  const { response, data } = await apiFetch('/admin/knowledge/stats');
  if (!response.ok) throw data as ApiError;
  const payload = data as KnowledgeStats | null;
  return payload ?? { totalEntries: 0, totalCacheEntries: 0 };
}

export async function getKnowledgeEntries(): Promise<KnowledgeEntryItem[]> {
  const { response, data } = await apiFetch('/admin/knowledge/entries');
  if (!response.ok) throw data as ApiError;
  const payload = data as { items?: KnowledgeEntryItem[] } | null;
  return payload?.items ?? [];
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const { response, data } = await apiFetch(`/admin/knowledge/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw data as ApiError;
}

export type ZiyodaPrompts = Record<string, string>;

export async function getZiyodaPrompts(): Promise<ZiyodaPrompts> {
  const { response, data } = await apiFetch('/admin/ziyoda-prompts');
  if (!response.ok) throw data as ApiError;
  return (data as ZiyodaPrompts) ?? {};
}

export async function updateZiyodaPrompts(prompts: ZiyodaPrompts): Promise<ZiyodaPrompts> {
  const { response, data } = await apiFetch('/admin/ziyoda-prompts', {
    method: 'PUT',
    json: prompts,
  });
  if (!response.ok) throw data as ApiError;
  return (data as ZiyodaPrompts) ?? {};
}

export interface ReindexProgress {
  total: number;
  processed: number;
  done?: boolean;
  error?: string;
}

export async function reindexKnowledgeStream(
  onProgress: (p: ReindexProgress) => void
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
  }
  const res = await fetch(`${API_BASE_URL}/admin/knowledge/reindex/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw (err as ApiError) ?? new Error('Reindex failed');
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const block of lines) {
        const m = block.match(/^data:\s*(.+)$/m);
        if (m) {
          try {
            const p = JSON.parse(m[1]) as ReindexProgress;
            onProgress(p);
          } catch {
            // skip
          }
        }
      }
    }
    if (buffer) {
      const m = buffer.match(/^data:\s*(.+)$/m);
      if (m) {
        try {
          onProgress(JSON.parse(m[1]) as ReindexProgress);
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result;
      resolve(typeof s === 'string' ? s : '');
    };
    r.onerror = () => reject(new Error('Failed to read file'));
    r.readAsDataURL(file);
  });
}

export async function addTextToKnowledge(
  text: string,
  title?: string
): Promise<{ chunksCreated: number }> {
  const { response, data } = await apiFetch('/admin/knowledge/add-text', {
    method: 'POST',
    json: { text, title: title || undefined },
    timeoutMs: 120000,
  });
  if (!response.ok) throw (data as ApiError) ?? new Error('Add text failed');
  const payload = data as { chunksCreated?: number };
  return { chunksCreated: payload?.chunksCreated ?? 0 };
}

export async function uploadKnowledge(file: File): Promise<{ chunksCreated: number }> {
  const fileBase64 = await fileToBase64(file);
  const { response, data } = await apiFetch('/admin/knowledge/upload', {
    method: 'POST',
    json: { file: fileBase64, filename: file.name },
    timeoutMs: 120000,
  });
  if (!response.ok) throw (data as ApiError) ?? new Error('Upload failed');
  const payload = data as { chunksCreated?: number };
  return { chunksCreated: payload?.chunksCreated ?? 0 };
}

export type { ApiError };
