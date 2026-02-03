'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BackButton from '../../../components/BackButton';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import { readSettings, Language } from '../../../lib/uiSettings';

const paymentMethods = [
  { id: 'anorbank', label: 'Anorbank', logo: '/payments/anorbank.svg' },
  { id: 'click', label: 'Click', logo: '/payments/click.svg' },
  { id: 'payme', label: 'Payme', logo: '/payments/payme.svg' },
  { id: 'uzum', label: 'Uzum', logo: '/payments/uzum.svg' },
  { id: 'xazna', label: 'Xazna', logo: '/payments/xazna.svg' },
  { id: 'alif', label: 'Alif', logo: '/payments/alif.svg' },
];

export default function SubscribePage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);

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
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'To‘lov usulini tanlang',
        subtitle: 'Obunani sotib olish uchun qulay usulni tanlang.',
      };
    }
    return {
      title: 'Выберите способ оплаты',
      subtitle: 'Выберите удобный способ оплаты подписки.',
    };
  }, [language]);

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <BackButton placement="bottom" />
          <PageHeader title={copy.title} subtitle={copy.subtitle} />

        <div className="grid grid-cols-2 gap-4">
          {paymentMethods.map((method) => (
            <Card key={method.id} className="flex flex-col items-center gap-3 p-4">
              <div className="flex h-12 w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={method.logo}
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
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
