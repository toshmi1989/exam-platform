'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AnimatedPage from '../../../../components/AnimatedPage';
import BottomNav from '../../../../components/BottomNav';
import Card from '../../../../components/Card';
import PageHeader from '../../../../components/PageHeader';
import { getPaymentStatus, type PaymentStatusResult } from '../../../../lib/api';
import { readSettings, type Language } from '../../../../lib/uiSettings';
import { isTelegramWebApp, getOpenInTelegramAppUrl } from '../../../../lib/telegram';

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

function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') return 'Русский';
  try {
    const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'ru';
    if (browserLang.toLowerCase().startsWith('uz')) return 'Узбекский';
    if (browserLang.toLowerCase().startsWith('en')) return 'Английский';
  } catch {
    // ignore
  }
  return 'Русский';
}

function SubscribeReturnClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invoiceId = searchParams.get('invoiceId') ?? '';
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'Русский';
    try {
      const raw = window.localStorage.getItem('calmexam.uiSettings');
      if (raw) {
        const parsed = JSON.parse(raw) as { language?: Language };
        if (parsed.language && ['Узбекский', 'Русский', 'Английский'].includes(parsed.language)) {
          return parsed.language;
        }
      }
    } catch {
      // ignore
    }
    // No saved settings - use browser language
    return detectBrowserLanguage();
  });
  const [mounted, setMounted] = useState(false);
  const inTelegram = mounted && isTelegramWebApp();

  const [status, setStatus] = useState<'polling' | 'paid' | 'error'>('polling');
  const [message, setMessage] = useState<string>('');
  const [paidDetails, setPaidDetails] = useState<PaymentStatusResult | null>(null);
  const pollCount = useRef(0);
  const [checkedBrowser, setCheckedBrowser] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const onSettingsChange = () => {
      const settings = readSettings();
      if (settings.language) setLanguage(settings.language);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('ui-settings-changed', onSettingsChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('ui-settings-changed', onSettingsChange);
    };
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Return after payment',
        waiting: 'Waiting for payment confirmation…',
        errorNoInvoice: 'Invoice not specified.',
        paidMessage: 'Subscription activated.',
        paidConfirm: 'Payment confirmed successfully.',
        subscriptionLabel: 'Subscription',
        subscriptionAll: 'to all exams',
        amount: 'Amount:',
        validUntil: 'Valid until',
        receipt: 'Payment receipt',
        toCabinet: 'To cabinet',
        timeout: 'Confirmation timed out. Check your subscription or try again.',
        cancel: 'Cancel',
        openInTelegramTitle: 'Payment received',
        openInTelegramMessage: 'Subscription activated. Open ZiyoMed in Telegram to continue.',
        openInTelegramButton: 'Open in Telegram',
        legacyFormatMessage: 'This payment was made in the old format and cannot be verified. Please contact support or make a new payment.',
        notYourPaymentMessage: 'This payment does not belong to your session.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "To'lovdan keyin qaytish",
        waiting: "To'lov tasdiqlanishi kutilmoqda…",
        errorNoInvoice: "Hisob-faktura ko'rsatilmagan.",
        paidMessage: "Obuna faollashtirildi.",
        paidConfirm: "To'lov muvaffaqiyatli tasdiqlandi.",
        subscriptionLabel: "Obuna",
        subscriptionAll: "barcha imtihonlar uchun",
        amount: "Summa:",
        validUntil: "Amal qilish muddati",
        receipt: "To'lov kvitansiyasi",
        toCabinet: "Kabinetga",
        timeout: "Tasdiqlash muddati tugadi. Obunani tekshiring yoki qayta urinib ko'ring.",
        cancel: 'Bekor qilish',
        openInTelegramTitle: "To'lov qabul qilindi",
        openInTelegramMessage: "Obuna faollashtirildi. Davom etish uchun ZiyoMed ni Telegramda oching.",
        openInTelegramButton: "Telegramda ochish",
        legacyFormatMessage: "Bu to'lov eski formatda amalga oshirilgan va tekshirib bo'lmaydi. Iltimos, qo'llab-quvvatlash xizmatiga murojaat qiling yoki yangi to'lov qiling.",
        notYourPaymentMessage: "Bu to'lov sizning seansingizga tegishli emas.",
      };
    }
    return {
      title: 'Возврат после оплаты',
      waiting: 'Ожидание подтверждения оплаты…',
      errorNoInvoice: 'Не указан счёт.',
      paidMessage: 'Подписка оформлена.',
      paidConfirm: 'Оплата успешно подтверждена.',
      subscriptionLabel: 'Подписка',
      subscriptionAll: 'на все экзамены',
      amount: 'Сумма:',
      validUntil: 'Срок действия: до',
      receipt: 'Чек оплаты',
      toCabinet: 'В кабинет',
      timeout: 'Ожидание подтверждения истекло. Проверьте подписку или попробуйте снова.',
      cancel: 'Отменить',
      openInTelegramTitle: 'Оплата получена',
      openInTelegramMessage: 'Подписка активирована. Откройте ZiyoMed в Telegram, чтобы продолжить.',
      openInTelegramButton: 'Открыть в Telegram',
      legacyFormatMessage: 'Этот платёж был выполнен в старом формате и не может быть проверен. Обратитесь в поддержку или выполните новый платёж.',
      notYourPaymentMessage: 'Этот платёж не принадлежит вашему сеансу.',
    };
  }, [language]);

  const copyRef = useRef(copy);
  copyRef.current = copy;

  // Check payment status immediately when opened in browser (for legacy/foreign invoice detection)
  useEffect(() => {
    if (!mounted || !invoiceId || checkedBrowser) return;
    
    if (!inTelegram) {
      setCheckedBrowser(true);
      let cancelled = false;
      (async () => {
        try {
          const result = await getPaymentStatus(invoiceId);
          if (cancelled) return;
          
          // Update copy ref to ensure we have latest language
          const currentCopy = copyRef.current;
          
          // Check for legacy format or foreign payment regardless of status
          if (result.isLegacyFormat) {
            setStatus('error');
            setMessage(currentCopy.legacyFormatMessage);
            return;
          }
          if (result.status === 'paid' && !result.belongsToUser) {
            setStatus('error');
            setMessage(currentCopy.notYourPaymentMessage);
            return;
          }
          
          // Valid payment - show Telegram link
          if (result.status === 'paid') {
            setStatus('paid');
            setMessage(currentCopy.paidMessage);
          } else {
            // Other statuses - show error
            setStatus('error');
            setMessage(currentCopy.errorNoInvoice);
          }
        } catch {
          setStatus('error');
          setMessage(copyRef.current.errorNoInvoice);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [mounted, invoiceId, inTelegram, checkedBrowser, copy]);

  // Poll for payment status in Telegram
  useEffect(() => {
    if (!inTelegram || !invoiceId) {
      if (!inTelegram && invoiceId) return; // opened in browser — already checked above
      if (!invoiceId) {
        setStatus('error');
        setMessage(copyRef.current.errorNoInvoice);
      }
      return;
    }

    let cancelled = false;
    setMessage(copyRef.current.waiting);

    async function poll() {
      while (!cancelled && pollCount.current < MAX_POLL_ATTEMPTS) {
        try {
          const result = await getPaymentStatus(invoiceId);
          if (cancelled) return;
          if (result.status === 'paid') {
            if (result.isLegacyFormat) {
              setStatus('error');
              setMessage(copyRef.current.legacyFormatMessage);
              return;
            }
            if (!result.belongsToUser) {
              setStatus('error');
              setMessage(copyRef.current.notYourPaymentMessage);
              return;
            }
            setPaidDetails(result);
            setStatus('paid');
            setMessage(copyRef.current.paidMessage);
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
        setMessage(copyRef.current.timeout);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, inTelegram]);

  function handleCancelPayment() {
    try {
      sessionStorage.removeItem(SUBSCRIBE_STORAGE_KEY);
    } catch {
      // ignore
    }
    router.replace('/cabinet');
  }

  if (mounted && !inTelegram) {
    const openInTelegramTitle = (copy as { openInTelegramTitle?: string }).openInTelegramTitle ?? 'Оплата получена';
    const openInTelegramMessage = (copy as { openInTelegramMessage?: string }).openInTelegramMessage ?? 'Подписка активирована. Откройте ZiyoMed в Telegram, чтобы продолжить.';
    const openInTelegramButton = (copy as { openInTelegramButton?: string }).openInTelegramButton ?? 'Открыть в Telegram';
    const legacyFormatMessage = (copy as { legacyFormatMessage?: string }).legacyFormatMessage ?? 'Этот платёж был выполнен в старом формате и не может быть проверен.';
    const notYourPaymentMessage = (copy as { notYourPaymentMessage?: string }).notYourPaymentMessage ?? 'Этот платёж не принадлежит вашему сеансу.';

    return (
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title={status === 'error' ? copy.title : openInTelegramTitle} subtitle="" />
          <Card className="flex flex-col items-center gap-6 py-8">
            {status === 'error' ? (
              <>
                <p className="text-center text-rose-600">
                  {message || legacyFormatMessage || notYourPaymentMessage}
                </p>
                <a
                  href="/cabinet"
                  className="inline-flex w-full max-w-xs justify-center rounded-xl bg-slate-200 px-5 py-4 text-base font-medium text-slate-800 hover:bg-slate-300"
                >
                  {copy.toCabinet}
                </a>
              </>
            ) : (
              <>
                <p className="text-center text-slate-700">
                  {message || openInTelegramMessage}
                </p>
                <a
                  href={getOpenInTelegramAppUrl()}
                  className="inline-flex w-full max-w-xs justify-center rounded-xl bg-[#2AABEE] px-5 py-4 text-base font-semibold text-white hover:bg-[#229ED9]"
                >
                  {openInTelegramButton}
                </a>
              </>
            )}
          </Card>
        </main>
      </AnimatedPage>
    );
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <PageHeader title={copy.title} subtitle="" />
          <Card className="flex flex-col items-center gap-4 py-8">
            {status === 'polling' && (
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
            {status === 'paid' && paidDetails && (
              <>
                <p className="text-center font-medium text-slate-800">
                  {copy.paidConfirm}
                </p>
                <div className="w-full space-y-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p><strong>{copy.subscriptionLabel}</strong> {copy.subscriptionAll}</p>
                  {paidDetails.amountTiyin != null && (
                    <p>{copy.amount} {formatAmount(paidDetails.amountTiyin)} сум</p>
                  )}
                  {paidDetails.subscriptionEndsAt && (
                    <p>{copy.validUntil} {formatDate(paidDetails.subscriptionEndsAt)}</p>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {paidDetails.receiptUrl && (
                    <a
                      href={paidDetails.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-50"
                    >
                      {copy.receipt}
                    </a>
                  )}
                  <a
                    href="/cabinet"
                    className="inline-flex justify-center rounded-xl bg-emerald-500 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-600"
                  >
                    {copy.toCabinet}
                  </a>
                </div>
              </>
            )}
            {status === 'error' && (
              <>
                <p className="text-center text-rose-600">{message}</p>
                <a
                  href="/cabinet"
                  className="rounded-xl bg-slate-200 px-5 py-3 text-base font-medium text-slate-800 hover:bg-slate-300"
                >
                  {copy.toCabinet}
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
