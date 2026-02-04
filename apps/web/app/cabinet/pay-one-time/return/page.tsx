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

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // ~2 min

function PayOneTimeReturnClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = searchParams.get('invoiceId') ?? '';
  const examId = searchParams.get('examId') ?? '';
  const mode = (searchParams.get('mode') === 'practice' ? 'practice' : 'exam') as 'exam' | 'practice';

  const [status, setStatus] = useState<'polling' | 'starting' | 'done' | 'error'>('polling');
  const [message, setMessage] = useState<string>('Ожидание подтверждения оплаты…');
  const pollCount = useRef(0);

  useEffect(() => {
    if (!invoiceId || !examId) {
      setStatus('error');
      setMessage('Не указан счёт или экзамен.');
      return;
    }

    let cancelled = false;

    async function poll() {
      while (!cancelled && pollCount.current < MAX_POLL_ATTEMPTS) {
        try {
          const result = await getPaymentStatus(invoiceId);
          if (cancelled) return;
          if (result.status === 'paid') {
            setStatus('starting');
            setMessage('Оплата получена. Запускаем тест…');
            const attempt = await createAttempt(examId, mode);
            await startAttempt(attempt.attemptId);
            if (cancelled) return;
            setStatus('done');
            router.replace(`/attempt/${attempt.attemptId}`);
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
  }, [invoiceId, examId, mode, router]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title="Возврат после оплаты" subtitle="" />
          <Card className="flex flex-col items-center gap-4 py-8">
            {(status === 'polling' || status === 'starting') && (
              <p className="text-center text-slate-600">{message}</p>
            )}
            {status === 'error' && (
              <>
                <p className="text-center text-rose-600">{message}</p>
                <a
                  href="/cabinet/my-exams"
                  className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                >
                  К экзаменам
                </a>
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
