'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { getProfile, createPayment, getPaymentStatus, createAttempt, startAttempt } from '../../../lib/api';
import { APP_BASE_URL } from '../../../lib/api/config';

export const dynamic = 'force-dynamic';

const PAYMENT_LOGOS = '/payments/';
const paymentMethods = [
  { id: 'anorbank', label: 'Anorbank', logo: 'anorbank.svg' },
  { id: 'click', label: 'Click', logo: 'click.svg' },
  { id: 'payme', label: 'Payme', logo: 'payme.svg' },
  { id: 'uzum', label: 'Uzum', logo: 'uzum.svg' },
  { id: 'xazna', label: 'Xazna', logo: 'xazna.svg' },
  { id: 'alif', label: 'Alif', logo: 'alif.svg' },
  { id: 'visa', label: 'Visa', logo: 'visa.svg' },
  { id: 'mastercard', label: 'Mastercard', logo: 'mastercard.svg' },
];

function PayOneTimeClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const examId = searchParams.get('examId') ?? '';
  const mode = (searchParams.get('mode') === 'practice' ? 'practice' : 'exam') as 'exam' | 'practice';

  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [oneTimePrice, setOneTimePrice] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<{
    invoiceId: string;
    examId: string;
    mode: 'exam' | 'practice';
  } | null>(null);
  const [assetBase, setAssetBase] = useState(() =>
    (APP_BASE_URL || '').replace(/\/$/, '')
  );

  useEffect(() => {
    if ((APP_BASE_URL || '').replace(/\/$/, '')) return;
    setAssetBase(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    getProfile()
      .then((p) => setOneTimePrice(p.oneTimePrice ?? null))
      .catch(() => setOneTimePrice(null));
  }, []);

  // Если есть «висящий» инвойс в sessionStorage, при открытии страницы проверяем его статус.
  // - paid    → сразу на страницу возврата / чека
  // - created → показываем баннер с предложением продолжить ожидание или отменить
  useEffect(() => {
    if (!examId) return;
    try {
      const raw = sessionStorage.getItem('exam_one_time_return');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { invoiceId?: string; examId?: string; mode?: string };
      if (!parsed.invoiceId || parsed.examId !== examId) return;

      void (async () => {
        try {
          const status = await getPaymentStatus(parsed.invoiceId!);
          if (status.status === 'paid') {
            router.replace(
              `/cabinet/pay-one-time/return?invoiceId=${encodeURIComponent(
                parsed.invoiceId!
              )}&examId=${encodeURIComponent(parsed.examId!)}&mode=${parsed.mode === 'practice' ? 'practice' : 'exam'}`
            );
            return;
          }
          if (status.status === 'created') {
            setPendingInvoice({
              invoiceId: parsed.invoiceId!,
              examId: parsed.examId!,
              mode: parsed.mode === 'practice' ? 'practice' : 'exam',
            });
            return;
          }
          // Любой другой статус — считаем инвойс недействительным и очищаем.
          sessionStorage.removeItem('exam_one_time_return');
        } catch {
          // При ошибке просто продолжаем без баннера.
        }
      })();
    } catch {
      // ignore
    }
  }, [examId, router]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'One-time access',
        subtitle: 'Pay once to take this test.',
        priceLabel: 'Amount',
        sum: 'UZS',
        pay: 'Pay and start test',
        back: 'Back to exams',
        noExam: 'Exam not selected. Choose a direction and try again.',
        errorPay: 'Payment failed. Please try again.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Bir martalik kirish',
        subtitle: 'Bu testni topshirish uchun bir marta to‘lang.',
        priceLabel: 'Summa',
        sum: 'so‘m',
        pay: 'To‘lash va testni boshlash',
        back: 'Imtihonlarga qaytish',
        noExam: 'Imtihon tanlanmagan. Yo‘nalishni tanlang va qayta urinib ko‘ring.',
        errorPay: 'To‘lov amalga oshmadi. Qayta urinib ko‘ring.',
      };
    }
    return {
      title: 'Разовый доступ',
      subtitle: 'Оплатите один раз, чтобы пройти этот тест.',
      priceLabel: 'Стоимость',
      sum: 'сум',
      pay: 'Оплатить и начать тест',
      back: 'Назад к экзаменам',
      noExam: 'Экзамен не выбран. Выберите направление и попробуйте снова.',
      errorPay: 'Оплата не прошла. Попробуйте снова.',
    };
  }, [language]);

  async function handlePay(paymentSystem: string) {
    if (!examId) {
      setError(copy.noExam);
      return;
    }
    setError(null);
    setPaying(true);
    try {
      const { checkout_url, invoiceId } = await createPayment({
        kind: 'one-time',
        examId,
        paymentSystem,
        mode,
      });
      try {
        sessionStorage.setItem(
          'exam_one_time_return',
          JSON.stringify({ invoiceId, examId, mode })
        );
      } catch {
        // ignore if sessionStorage unavailable
      }
      window.location.href = checkout_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.errorPay);
      setPaying(false);
    }
  }

  if (!examId) {
    return (
      <>
        <AnimatedPage>
          <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
            <BackButton placement="bottom" />
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <Card>
              <p className="text-sm text-slate-600">{copy.noExam}</p>
              <Button href="/cabinet/my-exams" size="lg" className="mt-4 w-full">
                {copy.back}
              </Button>
            </Card>
          </main>
        </AnimatedPage>
        <BottomNav />
      </>
    );
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <BackButton placement="bottom" />
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

          {pendingInvoice ? (
            <Card className="flex flex-col gap-3 border-amber-300 bg-amber-50">
              <p className="text-sm font-medium text-amber-900">
                У вас уже есть незавершённая оплата для этого экзамена.
              </p>
              <p className="text-xs text-amber-800">
                Вы можете продолжить ожидание подтверждения оплаты или отменить и выбрать способ оплаты заново.
              </p>
              <div className="mt-1 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    router.push(
                      `/cabinet/pay-one-time/return?invoiceId=${encodeURIComponent(
                        pendingInvoice.invoiceId
                      )}&examId=${encodeURIComponent(
                        pendingInvoice.examId
                      )}&mode=${pendingInvoice.mode}`
                    );
                  }}
                >
                  Продолжить
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem('exam_one_time_return');
                    } catch {
                      // ignore
                    }
                    setPendingInvoice(null);
                  }}
                >
                  Отменить
                </Button>
              </div>
            </Card>
          ) : null}

          <div
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm"
            role="status"
          >
            <p className="font-semibold text-slate-900">{copy.priceLabel}</p>
            <p className="text-2xl font-bold text-slate-900">
              {oneTimePrice != null
                ? `${oneTimePrice.toLocaleString('ru-UZ')} ${copy.sum}`
                : '—'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {paymentMethods.map((method) => (
              <Card
                key={method.id}
                className={`flex flex-col items-center gap-3 p-4 transition ${paying ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90'}`}
                onClick={() => !paying && handlePay(method.id)}
              >
                <div className="flex h-12 w-full items-center justify-center">
                  {assetBase ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`${assetBase}${PAYMENT_LOGOS}${method.logo}`}
                      alt={method.label}
                      className="h-10 w-auto object-contain"
                    />
                  ) : (
                    <span className="h-10 text-slate-400" aria-hidden>{method.label}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-700">{method.label}</p>
              </Card>
            ))}
          </div>

          {error ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <p className="text-center text-sm text-slate-500">
            {copy.pay}
          </p>

          <Button href="/cabinet/my-exams" size="lg" variant="secondary" className="w-full">
            {copy.back}
          </Button>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}

export default function PayOneTimePage() {
  return (
    <Suspense fallback={null}>
      <PayOneTimeClient />
    </Suspense>
  );
}
