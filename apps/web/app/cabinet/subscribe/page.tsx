'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { openPaymentLink } from '../../../lib/telegram';
import { createPayment, getPaymentStatus } from '../../../lib/api';
import { APP_BASE_URL } from '../../../lib/api/config';

export const dynamic = 'force-dynamic';

const PAYMENT_LOGOS = '/payments/';
const LOGO_VERSION = 'v2';
const SUBSCRIBE_STORAGE_KEY = 'exam_subscribe_return';
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

export default function SubscribePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetBase, setAssetBase] = useState(() =>
    (APP_BASE_URL || '').replace(/\/$/, '')
  );
  const [hasStoredInvoice, setHasStoredInvoice] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    const base = (APP_BASE_URL || '').replace(/\/$/, '');
    if (base) return;
    setAssetBase(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const checkStoredInvoice = useCallback((shouldAutoRedirect = false) => {
    try {
      const raw = sessionStorage.getItem(SUBSCRIBE_STORAGE_KEY);
      if (!raw) {
        setHasStoredInvoice(false);
        return;
      }
      const parsed = JSON.parse(raw) as { invoiceId?: string };
      if (parsed.invoiceId) {
        setHasStoredInvoice(true);
        if (shouldAutoRedirect && !hasRedirected) {
          setHasRedirected(true);
          router.replace(`/cabinet/subscribe/return?invoiceId=${encodeURIComponent(parsed.invoiceId)}`);
        }
      } else {
        setHasStoredInvoice(false);
      }
    } catch {
      setHasStoredInvoice(false);
    }
  }, [hasRedirected, router]);

  useEffect(() => {
    checkStoredInvoice(true);
    const handleFocus = () => checkStoredInvoice(true);
    const intervalId = setInterval(() => checkStoredInvoice(false), 2000);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      clearInterval(intervalId);
    };
  }, [checkStoredInvoice]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Choose payment method',
        subtitle: 'Select a convenient way to purchase your subscription.',
        errorPay: 'Payment failed. Please try again.',
        checkPayment: 'Check payment',
        unfinishedPayment: 'You have an incomplete subscription payment.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "To'lov usulini tanlang",
        subtitle: 'Obunani sotib olish uchun qulay usulni tanlang.',
        errorPay: "To'lov amalga oshmadi. Qayta urinib ko'ring.",
        checkPayment: "To'lovni tekshirish",
        unfinishedPayment: "Sizda tugallanmagan obuna to'lovi mavjud.",
      };
    }
    return {
      title: 'Выберите способ оплаты',
      subtitle: 'Выберите удобный способ оплаты подписки.',
      errorPay: 'Оплата не прошла. Попробуйте снова.',
      checkPayment: 'Проверить платеж',
      unfinishedPayment: 'У вас есть незавершённая оплата подписки.',
    };
  }, [language]);

  async function handlePay(paymentSystem: string) {
    setError(null);
    setPaying(true);
    try {
      const { checkout_url, invoiceId } = await createPayment({
        kind: 'subscription',
        paymentSystem,
      });
      if (invoiceId) {
        try {
          sessionStorage.setItem(SUBSCRIBE_STORAGE_KEY, JSON.stringify({ invoiceId }));
        } catch {
          // ignore
        }
      }
      if (checkout_url) {
        openPaymentLink(checkout_url);
        if (invoiceId) {
          router.push(`/cabinet/subscribe/return?invoiceId=${encodeURIComponent(invoiceId)}`);
        }
      } else {
        setError(copy.errorPay);
        setPaying(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.errorPay);
      setPaying(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <BackButton placement="bottom" />
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

          {hasStoredInvoice && (
            <Card className="flex flex-col gap-3 border-amber-300 bg-amber-50">
              <p className="text-sm font-medium text-amber-900">
                {copy.unfinishedPayment}
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    const raw = sessionStorage.getItem(SUBSCRIBE_STORAGE_KEY);
                    if (!raw) return;
                    const parsed = JSON.parse(raw) as { invoiceId?: string };
                    if (parsed.invoiceId) {
                      router.push(`/cabinet/subscribe/return?invoiceId=${encodeURIComponent(parsed.invoiceId)}`);
                    }
                  } catch {
                    // ignore
                  }
                }}
                className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 active:scale-[0.98]"
              >
                {copy.checkPayment}
              </button>
            </Card>
          )}

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
                      src={`${assetBase}${PAYMENT_LOGOS}${method.logo}?v=${LOGO_VERSION}`}
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
                  ) : (
                    <span className="h-10 text-slate-400 hidden" aria-hidden>{method.label}</span>
                  )}
                  <span className="h-10 text-slate-400 hidden" aria-hidden>{method.label}</span>
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {method.label}
                </p>
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
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
