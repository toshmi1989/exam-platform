'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import { getPaymentStatus, createAttempt, startAttempt } from '../../../../lib/api';
import { readSettings, type Language } from '../../../../lib/uiSettings';

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
  const [language, setLanguage] = useState<Language>(() => readSettings().language);
  const [invoiceId, setInvoiceId] = useState(() => searchParams.get('invoiceId') ?? '');
  const [examId, setExamId] = useState(() => searchParams.get('examId') ?? '');
  const [mode, setMode] = useState<'exam' | 'practice'>(() =>
    (searchParams.get('mode') === 'practice' ? 'practice' : 'exam')
  );
  const [restored, setRestored] = useState(false);

  const [status, setStatus] = useState<'polling' | 'paid' | 'starting' | 'done' | 'error'>('polling');
  const [message, setMessage] = useState<string>('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'calmexam.uiSettings' && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as { language?: Language };
          if (next.language) setLanguage(next.language);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Return after payment',
        waiting: 'Waiting for payment confirmation…',
        errorNoInvoice: 'Invoice or exam not specified. Go to "My exams" and try again.',
        paidReceived: 'Payment received successfully.',
        timeout: 'Confirmation timed out. Check your subscription or try again.',
        starting: 'Starting test…',
        paidConfirm: 'Payment confirmed. Click the button below to start the test.',
        receipt: 'Payment receipt',
        startTest: 'Start test',
        hint: 'If the button does not work, open "My exams" and start the test manually.',
        errorStart: 'Could not start test. Access is already active — go to "My exams" and start the test.',
        retryChecking: 'Rechecking payment…',
        paidConfirmed: 'Payment confirmed successfully.',
        notConfirmed: 'Payment not confirmed yet. If you paid, wait a moment and try again.',
        checkFailed: 'Could not verify payment. Check your connection and try again.',
        retryCheck: 'Check again',
        choosePaymentAgain: 'Choose payment method again',
        goToMyExams: 'Go to "My exams"',
        cancel: 'Cancel',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "To'lovdan keyin qaytish",
        waiting: "To'lov tasdiqlanishi kutilmoqda…",
        errorNoInvoice: "Hisob-faktura yoki imtihon ko'rsatilmagan. «Mening imtihonlarim»ga o'ting va qayta urinib ko'ring.",
        paidReceived: "To'lov muvaffaqiyatli qabul qilindi.",
        timeout: "Tasdiqlash muddati tugadi. Obunani tekshiring yoki qayta urinib ko'ring.",
        starting: "Test ishga tushiryapmiz…",
        paidConfirm: "To'lov tasdiqlandi. Testni boshlash uchun quyidagi tugmani bosing.",
        receipt: "To'lov kvitansiyasi",
        startTest: "Testni boshlash",
        hint: "Agar tugma ishlamasa, «Mening imtihonlarim» bo'limini oching va testni qo'lda ishga tushiring.",
        errorStart: "Testni ishga tushirib bo'lmadi. Kirish allaqachon mavjud — «Mening imtihonlarim»ga o'ting va testni boshlang.",
        retryChecking: "To'lovni qayta tekshirish…",
        paidConfirmed: "To'lov muvaffaqiyatli tasdiqlandi.",
        notConfirmed: "To'lov hali tasdiqlanmadi. To'lgan bo'lsangiz, biroz kuting va qayta urinib ko'ring.",
        checkFailed: "To'lovni tekshirib bo'lmadi. Ulanishni tekshiring va qayta urinib ko'ring.",
        retryCheck: "Qayta tekshirish",
        choosePaymentAgain: "To'lov usulini qayta tanlang",
        goToMyExams: "«Mening imtihonlarim»ga o'tish",
        cancel: 'Bekor qilish',
      };
    }
    return {
      title: 'Возврат после оплаты',
      waiting: 'Ожидание подтверждения оплаты…',
      errorNoInvoice: 'Не указан счёт или экзамен. Перейдите в «Мои экзамены» и попробуйте снова.',
      paidReceived: 'Оплата успешно получена.',
      timeout: 'Ожидание подтверждения истекло. Проверьте подписку или попробуйте снова.',
      starting: 'Запускаем тест…',
      paidConfirm: 'Оплата успешно подтверждена. Нажмите кнопку ниже, чтобы начать тест.',
      receipt: 'Чек оплаты',
      startTest: 'Начать тест',
      hint: 'Если кнопка не срабатывает, откройте раздел «Мои экзамены» и запустите тест вручную.',
      errorStart: 'Не удалось запустить тест. Доступ уже оформлен — перейдите в «Мои экзамены» и начните тест.',
      retryChecking: 'Повторная проверка оплаты…',
      paidConfirmed: 'Оплата успешно подтверждена.',
      notConfirmed: 'Оплата всё ещё не подтверждена. Если вы оплачивали, подождите немного и попробуйте ещё раз.',
      checkFailed: 'Не удалось проверить оплату. Проверьте соединение и попробуйте ещё раз.',
      retryCheck: 'Проверить ещё раз',
      choosePaymentAgain: 'Выбрать способ оплаты заново',
      goToMyExams: 'Перейти в «Мои экзамены»',
      cancel: 'Отменить',
    };
  }, [language]);

  const copyRef = useRef(copy);
  copyRef.current = copy;

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
      setMessage(copyRef.current.errorNoInvoice);
      return;
    }

    let cancelled = false;
    setMessage(copyRef.current.waiting);

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
            setReceiptUrl(result.receiptUrl ?? null);
            setStatus('paid');
            setMessage(copyRef.current.paidReceived);
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
        setMessage(copyRef.current.timeout);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [restored, invoiceId, examId, mode, router]);

  async function handleStartClick() {
    setStatus('starting');
    setMessage(copy.starting);
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
      setMessage(copy.errorStart);
    }
  }

  async function handleRetryCheck() {
    if (!invoiceId) return;
    try {
      setStatus('polling');
      setMessage(copy.retryChecking);
      const result = await getPaymentStatus(invoiceId);
      if (result.status === 'paid') {
        setReceiptUrl(result.receiptUrl ?? null);
        setStatus('paid');
        setMessage(copy.paidConfirmed);
      } else {
        setStatus('error');
        setMessage(copy.notConfirmed);
      }
    } catch {
      setStatus('error');
      setMessage(copy.checkFailed);
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
      router.replace('/exam/select');
    }
  }

  function handleCancelPayment() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.replace('/cabinet');
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title={copy.title} subtitle="" />
          <Card className="flex flex-col items-center gap-4 py-8">
            {(status === 'polling' || status === 'starting') && (
              <>
                <p className="text-center text-slate-600">{message}</p>
                <button
                  type="button"
                  onClick={handleCancelPayment}
                  className="mt-4 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98]"
                >
                  {copy.cancel}
                </button>
              </>
            )}
            {status === 'paid' && (
              <>
                <p className="text-center text-slate-700">
                  {copy.paidConfirm}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {receiptUrl && (
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-50"
                    >
                      {copy.receipt}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleStartClick}
                    className="rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-600 active:scale-95"
                  >
                    {copy.startTest}
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-slate-500">
                  {copy.hint}
                </p>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="text-center text-slate-700">{message}</p>
                <div className="mt-4 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleRetryCheck}
                    className="w-full rounded-xl bg-slate-800 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-slate-900 active:scale-95"
                  >
                    {copy.retryCheck}
                  </button>
                  <button
                    type="button"
                    onClick={handleRestartPayment}
                    className="w-full rounded-xl bg-slate-200 px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-300 active:scale-95"
                  >
                    {copy.choosePaymentAgain}
                  </button>
                  <a
                    href="/exam/select"
                    className="mt-1 block text-center text-sm text-slate-500 underline-offset-2 hover:underline"
                  >
                    {copy.goToMyExams}
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
