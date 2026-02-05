'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import { getPaymentStatus, createAttempt, startAttempt } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

// Опрос статуса: при уходе со страницы (передумал оплатить) polling останавливается в cleanup — лишних запросов нет.
// Один запрос = один лёгкий GET /payments/status/:id (findUnique), на стабильность не влияет.
const POLL_INTERVAL_MS = 3000;  // 3 c — баланс между отзывчивостью и нагрузкой при отказе от оплаты
const MAX_POLL_ATTEMPTS = 40;   // ~2 min
const PAID_START_DELAY_MS = 800;   // дать колбэку время создать OneTimeAccess
const CREATE_ATTEMPT_RETRIES = 5;  // повторы createAttempt при гонке с колбэком
const CREATE_ATTEMPT_RETRY_DELAY_MS = 1000;

const STORAGE_KEY = 'exam_one_time_return';

function PayOneTimeReturnClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState(() => searchParams.get('invoiceId') ?? '');
  const [examId, setExamId] = useState(() => searchParams.get('examId') ?? '');
  const [mode, setMode] = useState<'exam' | 'practice'>(() =>
    (searchParams.get('mode') === 'practice' ? 'practice' : 'exam')
  );
  const [restored, setRestored] = useState(false);

  const [status, setStatus] = useState<'polling' | 'paid' | 'starting' | 'done' | 'error'>('polling');
  const [message, setMessage] = useState<string>('Ожидание подтверждения оплаты…');
  const pollCount = useRef(0);

  // Восстановить invoiceId/examId/mode из sessionStorage, если в URL нет (редирект шлюза мог обрезать query)
  useEffect(() => {
    if (restored) return;
    const hasFromUrl = invoiceId && examId;
    if (hasFromUrl) {
      setRestored(true);
      return;
    }
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { invoiceId?: string; examId?: string; mode?: string };
        if (parsed.invoiceId) setInvoiceId((prev) => prev || parsed.invoiceId || '');
        if (parsed.examId) setExamId((prev) => prev || parsed.examId || '');
        if (parsed.mode === 'practice' || parsed.mode === 'exam') setMode(parsed.mode);
      }
    } catch {
      // ignore
    }
    setRestored(true);
  }, [invoiceId, examId, restored]);

  useEffect(() => {
    if (!restored) return;
    if (!invoiceId || !examId) {
      setStatus('error');
      setMessage('Не указан счёт или экзамен. Перейдите в «Мои экзамены» и попробуйте снова.');
      return;
    }

    let cancelled = false;

    async function startTestAfterPaid(): Promise<boolean> {
      await new Promise((r) => setTimeout(r, PAID_START_DELAY_MS));
      for (let i = 0; i < CREATE_ATTEMPT_RETRIES && !cancelled; i++) {
        try {
          const attempt = await createAttempt(examId, mode);
          await startAttempt(attempt.attemptId);
          if (cancelled) return false;
          try {
            sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          router.replace(`/attempt/${attempt.attemptId}`);
          return true;
        } catch {
          if (i < CREATE_ATTEMPT_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, CREATE_ATTEMPT_RETRY_DELAY_MS));
          }
        }
      }
      return false;
    }

    async function poll() {
      while (!cancelled && pollCount.current < MAX_POLL_ATTEMPTS) {
        try {
          const result = await getPaymentStatus(invoiceId);
          if (cancelled) return;
          if (result.status === 'paid') {
            // Оплата подтверждена — показываем экран чека и даём пользователю явно нажать «Начать тест»
            setStatus('paid');
            setMessage('Оплата успешно получена.');
            return;
          }
        } catch {
          // ignore and retry
        }
        pollCount.current += 1;
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (!cancelled) {
        setStatus('error');
        setMessage('Ожидание подтверждения истекло. Проверьте подписку или попробуйте снова.');
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [restored, invoiceId, examId, mode, router]);

  async function handleStartClick() {
    setStatus('starting');
    setMessage('Запускаем тест…');
    const ok = await (async () => {
      try {
        await new Promise((r) => setTimeout(r, PAID_START_DELAY_MS));
        const attempt = await createAttempt(examId, mode);
        await startAttempt(attempt.attemptId);
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        router.replace(`/attempt/${attempt.attemptId}`);
        return true;
      } catch {
        return false;
      }
    })();
    if (!ok) {
      setStatus('error');
      setMessage('Не удалось запустить тест. Доступ уже оформлен — перейдите в «Мои экзамены» и начните тест.');
    }
  }

  async function handleRetryCheck() {
    if (!invoiceId) return;
    try {
      setStatus('polling');
      setMessage('Повторная проверка оплаты…');
      const result = await getPaymentStatus(invoiceId);
      if (result.status === 'paid') {
        setStatus('paid');
        setMessage('Оплата успешно подтверждена.');
      } else {
        setStatus('error');
        setMessage('Оплата всё ещё не подтверждена. Если вы оплачивали, подождите немного и попробуйте ещё раз.');
      }
    } catch {
      setStatus('error');
      setMessage('Не удалось проверить оплату. Проверьте соединение и попробуйте ещё раз.');
    }
  }

  function handleRestartPayment() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    if (examId) {
      router.replace(`/cabinet/pay-one-time?examId=${encodeURIComponent(examId)}&mode=${mode}`);
    } else {
      router.replace('/cabinet/my-exams');
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title="Возврат после оплаты" subtitle="" />
          <Card className="flex flex-col items-center gap-4 py-8">
            {(status === 'polling' || status === 'starting') && (
              <p className="text-center text-slate-600">{message}</p>
            )}
            {status === 'paid' && (
              <>
                <p className="text-center text-slate-700">
                  Оплата успешно подтверждена. Нажмите кнопку ниже, чтобы начать тест.
                </p>
                <button
                  type="button"
                  onClick={handleStartClick}
                  className="mt-4 rounded-lg bg-emerald-500 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 active:scale-95"
                >
                  Начать тест
                </button>
                <p className="mt-2 text-center text-xs text-slate-500">
                  Если кнопка не срабатывает, откройте раздел «Мои экзамены» и запустите тест вручную.
                </p>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="text-center text-slate-700">{message}</p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleRetryCheck}
                    className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 active:scale-95"
                  >
                    Проверить ещё раз
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartPayment}
                    className="w-full rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300 active:scale-95"
                  >
                    Выбрать способ оплаты заново
                  </button>
                  <a
                    href="/cabinet/my-exams"
                    className="mt-1 block text-center text-xs text-slate-500 underline-offset-2 hover:underline"
                  >
                    Перейти в «Мои экзамены»
                  </a>
                </div>
              </>
            )}
          </Card>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}

export default function PayOneTimeReturnPage() {
  return (
    <Suspense fallback={null}>
      <PayOneTimeReturnClient />
    </Suspense>
  );
}
