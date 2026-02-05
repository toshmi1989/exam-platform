'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import { getPaymentStatus, type PaymentStatusResult } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;
const SUBSCRIBE_STORAGE_KEY = 'exam_subscribe_return';

function formatAmount(tiyin: number): string {
  return (tiyin / 100).toLocaleString('ru-UZ', { maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function SubscribeReturnClient() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoiceId') ?? '';

  const [status, setStatus] = useState<'polling' | 'paid' | 'error'>('polling');
  const [message, setMessage] = useState<string>('Ожидание подтверждения оплаты…');
  const [paidDetails, setPaidDetails] = useState<PaymentStatusResult | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!invoiceId) {
      setStatus('error');
      setMessage('Не указан счёт.');
      return;
    }

    let cancelled = false;

    async function poll() {
      while (!cancelled && pollCount.current < MAX_POLL_ATTEMPTS) {
        try {
          const result = await getPaymentStatus(invoiceId);
          if (cancelled) return;
          if (result.status === 'paid') {
            setPaidDetails(result);
            setStatus('paid');
            setMessage('Подписка оформлена.');
            try {
              sessionStorage.removeItem(SUBSCRIBE_STORAGE_KEY);
            } catch {
              // ignore
            }
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
  }, [invoiceId]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title="Возврат после оплаты" subtitle="" />
          <Card className="flex flex-col items-center gap-4 py-8">
            {status === 'polling' && (
              <p className="text-center text-slate-600">{message}</p>
            )}
            {status === 'paid' && paidDetails && (
              <>
                <p className="text-center font-medium text-slate-800">
                  Оплата успешно подтверждена.
                </p>
                <div className="w-full space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p><strong>Подписка</strong> на все экзамены</p>
                  {paidDetails.amountTiyin != null && (
                    <p>Сумма: {formatAmount(paidDetails.amountTiyin)} сум</p>
                  )}
                  {paidDetails.subscriptionEndsAt && (
                    <p>Срок действия: до {formatDate(paidDetails.subscriptionEndsAt)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {paidDetails.receiptUrl && (
                    <a
                      href={paidDetails.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Чек оплаты
                    </a>
                  )}
                  <a
                    href="/cabinet"
                    className="inline-flex justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                  >
                    В кабинет
                  </a>
                </div>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="text-center text-rose-600">{message}</p>
                <a
                  href="/cabinet"
                  className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                >
                  В кабинет
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

export default function SubscribeReturnPage() {
  return (
    <Suspense fallback={null}>
      <SubscribeReturnClient />
    </Suspense>
  );
}
