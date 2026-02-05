'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';
import { createPayment } from '../../../lib/api';

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

export default function SubscribePage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetBase] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Choose payment method',
        subtitle: 'Select a convenient way to purchase your subscription.',
        errorPay: 'Payment failed. Please try again.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: "To'lov usulini tanlang",
        subtitle: 'Obunani sotib olish uchun qulay usulni tanlang.',
        errorPay: "To'lov amalga oshmadi. Qayta urinib ko'ring.",
      };
    }
    return {
      title: 'Выберите способ оплаты',
      subtitle: 'Выберите удобный способ оплаты подписки.',
      errorPay: 'Оплата не прошла. Попробуйте снова.',
    };
  }, [language]);

  async function handlePay(paymentSystem: string) {
    setError(null);
    setPaying(true);
    try {
      const { checkout_url } = await createPayment({
        kind: 'subscription',
        paymentSystem,
      });
      window.location.href = checkout_url;
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
                    src={assetBase ? `${assetBase}${PAYMENT_LOGOS}${method.logo}` : `${PAYMENT_LOGOS}${method.logo}`}
                    alt={method.label}
                    className="h-10 w-auto object-contain"
                  />
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
