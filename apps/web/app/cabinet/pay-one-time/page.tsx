'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { getProfile, createPayment, getPaymentStatus } from '../../../lib/api';

export const dynamic = 'force-dynamic';

const PAYMENT_LOGOS = '/payments/';
// Cache-busting version для логотипов (обновить при изменении файлов)
const LOGO_VERSION = 'v2';
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
  const [hasStoredInvoice, setHasStoredInvoice] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  // Используем относительные пути для статики - Next.js автоматически раздаст из public/
  // Для Telegram Mini App это работает корректно, так как статика раздается с того же домена

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

  // Функция для проверки sessionStorage
  const checkStoredInvoice = useCallback((shouldAutoRedirect = false) => {
    if (!examId) {
      setHasStoredInvoice(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem('exam_one_time_return');
      if (!raw) {
        setHasStoredInvoice(false);
        return;
      }
      const parsed = JSON.parse(raw) as { invoiceId?: string; examId?: string; mode?: string };
      if (parsed.invoiceId && parsed.examId === examId) {
        console.log('[pay-one-time] Found stored invoice:', parsed.invoiceId);
        setHasStoredInvoice(true);
        // Автоматически переходим на страницу ожидания при первой проверке
        // (только если не было редиректа ранее и нет pendingInvoice)
        if (shouldAutoRedirect && !hasRedirected && !pendingInvoice) {
          console.log('[pay-one-time] Auto-redirecting to return page');
          setHasRedirected(true);
          router.replace(
            `/cabinet/pay-one-time/return?invoiceId=${encodeURIComponent(
              parsed.invoiceId
            )}&examId=${encodeURIComponent(parsed.examId!)}&mode=${
              parsed.mode === 'practice' ? 'practice' : 'exam'
            }`
          );
        }
      } else {
        setHasStoredInvoice(false);
      }
    } catch (e) {
      console.error('[pay-one-time] Error checking stored invoice:', e);
      setHasStoredInvoice(false);
    }
  }, [examId, hasRedirected, pendingInvoice, router]);

  // Проверяем наличие незавершённого инвойса в sessionStorage для отображения кнопки
  useEffect(() => {
    // При первой загрузке проверяем и делаем автоматический редирект если нужно
    checkStoredInvoice(true);

    // Проверяем при возврате фокуса на окно (когда пользователь вернулся из приложения оплаты)
    const handleFocus = () => {
      // При возврате фокуса тоже делаем автоматический редирект
      checkStoredInvoice(true);
    };

    // Проверяем периодически (каждые 2 секунды) для случаев, когда focus не срабатывает
    // Но без автоматического редиректа - только для показа кнопки
    const intervalId = setInterval(() => {
      checkStoredInvoice(false);
    }, 2000);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus); // Для случаев, когда страница восстанавливается из кэша

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      clearInterval(intervalId);
    };
  }, [examId, checkStoredInvoice]);

  // Если есть «висящий» инвойс в sessionStorage, при открытии страницы проверяем его статус.
  // - paid    → сразу на страницу возврата / чека
  // - created → показываем баннер и начинаем опрос статуса (для Telegram WebView)
  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    const POLL_INTERVAL_MS = 3000; // 3 секунды
    const MAX_POLL_ATTEMPTS = 40; // ~2 минуты

    try {
      const raw = sessionStorage.getItem('exam_one_time_return');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { invoiceId?: string; examId?: string; mode?: string };
      if (!parsed.invoiceId || parsed.examId !== examId) return;

      let pollCount = 0;

      void (async () => {
        // Первая проверка сразу
        try {
          const status = await getPaymentStatus(parsed.invoiceId!);
          if (cancelled) return;
          if (status.status === 'paid') {
            router.replace(
              `/cabinet/pay-one-time/return?invoiceId=${encodeURIComponent(
                parsed.invoiceId!
              )}&examId=${encodeURIComponent(parsed.examId!)}&mode=${parsed.mode === 'practice' ? 'practice' : 'exam'}`
            );
            return;
          }
          if (status.status === 'created') {
            // Автоматически переходим на страницу ожидания оплаты
            console.log('[pay-one-time] Found pending invoice, redirecting to return page');
            router.replace(
              `/cabinet/pay-one-time/return?invoiceId=${encodeURIComponent(
                parsed.invoiceId!
              )}&examId=${encodeURIComponent(parsed.examId!)}&mode=${parsed.mode === 'practice' ? 'practice' : 'exam'}`
            );
            return;
          }
          // Любой другой статус — считаем инвойс недействительным и очищаем.
          sessionStorage.removeItem('exam_one_time_return');
          setHasStoredInvoice(false);
        } catch {
          // При ошибке просто продолжаем без баннера.
        }
      })();

      return () => {
        cancelled = true;
      };
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
        checkPayment: 'Check payment',
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
        checkPayment: 'To‘lovni tekshirish',
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
      checkPayment: 'Проверить платеж',
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
      console.log('[pay-one-time] Starting payment creation:', { examId, paymentSystem, mode });
      const { checkout_url, invoiceId } = await createPayment({
        kind: 'one-time',
        examId,
        paymentSystem,
        mode,
      });
      console.log('[pay-one-time] Payment created:', { checkout_url, invoiceId });
      if (!checkout_url || !invoiceId) {
        throw new Error('Неверный ответ от сервера: отсутствует ссылка на оплату.');
      }
      try {
        sessionStorage.setItem(
          'exam_one_time_return',
          JSON.stringify({ invoiceId, examId, mode })
        );
      } catch {
        // ignore if sessionStorage unavailable
      }
      console.log('[pay-one-time] Redirecting to:', checkout_url);
      window.location.href = checkout_url;
    } catch (e) {
      console.error('[pay-one-time] handlePay error:', e);
      const errorMessage = e instanceof Error ? e.message : copy.errorPay;
      setError(errorMessage);
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
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    try {
                      sessionStorage.removeItem('exam_one_time_return');
                    } catch {
                      // ignore
                    }
                    setPendingInvoice(null);
                    setHasStoredInvoice(false);
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
            {hasStoredInvoice && !pendingInvoice ? (
              <Button
                className="mt-2 w-full"
                onClick={() => {
                  console.log('[pay-one-time] Check payment button clicked, hasStoredInvoice:', hasStoredInvoice);
                  try {
                    const raw = sessionStorage.getItem('exam_one_time_return');
                    console.log('[pay-one-time] Raw sessionStorage:', raw);
                    if (!raw) {
                      console.log('[pay-one-time] No sessionStorage data');
                      return;
                    }
                    const parsed = JSON.parse(raw) as {
                      invoiceId?: string;
                      examId?: string;
                      mode?: string;
                    };
                    console.log('[pay-one-time] Parsed data:', parsed, 'current examId:', examId);
                    if (parsed.invoiceId && parsed.examId === examId) {
                      console.log('[pay-one-time] Redirecting to return page');
                      router.push(
                        `/cabinet/pay-one-time/return?invoiceId=${encodeURIComponent(
                          parsed.invoiceId
                        )}&examId=${encodeURIComponent(parsed.examId)}&mode=${
                          parsed.mode === 'practice' ? 'practice' : 'exam'
                        }`
                      );
                    } else {
                      console.log('[pay-one-time] Invoice ID or examId mismatch');
                    }
                  } catch (e) {
                    console.error('[pay-one-time] Error in check payment:', e);
                  }
                }}
              >
                {copy.checkPayment}
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {paymentMethods.map((method) => (
              <Card
                key={method.id}
                className={`flex flex-col items-center gap-3 p-4 transition ${paying ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90'}`}
                onClick={() => !paying && handlePay(method.id)}
              >
                <div className="flex h-12 w-full items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${PAYMENT_LOGOS}${method.logo}?v=${LOGO_VERSION}`}
                    alt={method.label}
                    className="h-10 w-auto object-contain"
                    onError={(e) => {
                      // Если изображение не загрузилось, скрываем его и показываем текст
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'block';
                    }}
                  />
                  <span className="h-10 text-slate-400 hidden" aria-hidden>{method.label}</span>
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
