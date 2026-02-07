'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import Button from '../../../components/Button';
import { readSettings, Language } from '../../../lib/uiSettings';
import { apiFetch } from '../../../lib/api/client';

export default function AdminAccessSettingsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [price, setPrice] = useState('99000');
  const [duration, setDuration] = useState('30');
  const [freeAttempts, setFreeAttempts] = useState('yes');
  const [dailyLimit, setDailyLimit] = useState('1');
  const [oralDailyLimit, setOralDailyLimit] = useState('5');
  const [showAnswers, setShowAnswers] = useState('no');
  const [oneTimePrice, setOneTimePrice] = useState('15000');
  const [oneTimeAnswers, setOneTimeAnswers] = useState('no');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Access settings',
        subtitle: 'Manage subscription and free access rules.',
        subscription: 'Subscription',
        price: 'Price',
        duration: 'Duration (days)',
        subscriptionHint: 'Applies to users with an active subscription.',
        priceHint: 'Amount charged for a new subscription.',
        durationHint: 'Number of days a subscription stays active.',
        free: 'Free access',
        dailyLimit: 'Daily limit',
        oralDailyLimit: 'Oral: questions per day',
        showAnswers: 'Show correct answers',
        freeHint: 'Controls access without subscription.',
        dailyLimitHint: 'How many full attempts per day are allowed.',
        oralDailyLimitHint: 'Oral mode: how many questions per day without subscription. Subscribers have no limit.',
        showAnswersHint: 'Show correct answers after finishing a free attempt.',
        oneTime: 'One‑time access',
        oneTimeHint: 'Single exam access without subscription. Oral mode is not available for one‑time access.',
        oneTimePriceHint: 'Price for a one‑time attempt.',
        oneTimeAnswersHint: 'Show correct answers after a one‑time attempt.',
        save: 'Save changes',
        yes: 'Yes',
        no: 'No',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Kirish sozlamalari',
        subtitle: 'Obuna va bepul kirish qoidalarini boshqaring.',
        subscription: 'Obuna',
        price: 'Narx',
        duration: 'Davomiyligi (kun)',
        subscriptionHint: 'Faol obuna egalariga qo‘llanadi.',
        priceHint: 'Yangi obuna narxi.',
        durationHint: 'Obuna faol bo‘ladigan kunlar soni.',
        free: 'Bepul kirish',
        dailyLimit: 'Kunlik limit',
        oralDailyLimit: 'Og‘zaki: kuniga savollar',
        showAnswers: 'To‘g‘ri javoblar',
        freeHint: 'Obunasiz kirish qoidalari.',
        dailyLimitHint: 'Kuniga nechta to‘liq urinish ruxsat etiladi.',
        oralDailyLimitHint: 'Og‘zaki rejim: obunasiz kuniga nechta savol. Obunachilarda limit yo‘q.',
        showAnswersHint: 'Bepul urinishdan so‘ng to‘g‘ri javoblarni ko‘rsatish.',
        oneTime: 'Bir martalik kirish',
        oneTimeHint: 'Obunasiz bitta imtihon. Og‘zaki rejim bir martalik kirishda mavjud emas.',
        oneTimePriceHint: 'Bir martalik urinish narxi.',
        oneTimeAnswersHint: 'Bir martalik urinishdan so‘ng javoblarni ko‘rsatish.',
        save: 'O‘zgarishlarni saqlash',
        yes: 'Ha',
        no: 'Yo‘q',
      };
    }
    return {
      title: 'Настройки доступа',
      subtitle: 'Управление правилами подписки и доступа.',
      subscription: 'Подписка',
      price: 'Цена',
      duration: 'Длительность (дни)',
      subscriptionHint: 'Применяется к пользователям с активной подпиской.',
      priceHint: 'Стоимость новой подписки.',
      durationHint: 'Срок действия подписки в днях.',
      free: 'Без подписки',
      dailyLimit: 'Дневной лимит',
      oralDailyLimit: 'Устный режим: вопросов в день',
      showAnswers: 'Показывать ответы',
      freeHint: 'Правила доступа без подписки.',
      dailyLimitHint: 'Сколько полных попыток в день разрешено.',
      oralDailyLimitHint: 'Устный режим: сколько вопросов в день без подписки. Для подписчиков лимита нет.',
      showAnswersHint: 'Показывать ответы после бесплатной попытки.',
      oneTime: 'Разовый доступ',
      oneTimeHint: 'Единичный доступ к экзамену без подписки. Устный режим для разового доступа недоступен.',
      oneTimePriceHint: 'Цена разовой попытки.',
      oneTimeAnswersHint: 'Показывать ответы после разовой попытки.',
      save: 'Сохранить изменения',
      yes: 'Да',
      no: 'Нет',
    };
  }, [language]);

  async function loadSettings() {
    const { response, data } = await apiFetch('/admin/settings/access');
    if (!response.ok) return;
    const payload = data as {
      settings?: {
        subscriptionPrice: number;
        subscriptionDurationDays: number;
        allowFreeAttempts: boolean;
        freeDailyLimit: number;
        freeOralDailyLimit?: number;
        showAnswersWithoutSubscription: boolean;
        oneTimePrice: number;
        showAnswersForOneTime: boolean;
      };
    } | null;
    if (!payload?.settings) return;
    setPrice(String(payload.settings.subscriptionPrice));
    setDuration(String(payload.settings.subscriptionDurationDays));
    setFreeAttempts(payload.settings.allowFreeAttempts ? 'yes' : 'no');
    setDailyLimit(String(payload.settings.freeDailyLimit));
    setOralDailyLimit(String(payload.settings.freeOralDailyLimit ?? 5));
    setShowAnswers(payload.settings.showAnswersWithoutSubscription ? 'yes' : 'no');
    setOneTimePrice(String(payload.settings.oneTimePrice));
    setOneTimeAnswers(payload.settings.showAnswersForOneTime ? 'yes' : 'no');
  }

  async function handleSave() {
    setIsSaving(true);
    await apiFetch('/admin/settings/access', {
      method: 'POST',
      json: {
        subscriptionPrice: Number(price),
        subscriptionDurationDays: Number(duration),
        allowFreeAttempts: freeAttempts === 'yes',
        freeDailyLimit: Number(dailyLimit),
        freeOralDailyLimit: Number(oralDailyLimit),
        showAnswersWithoutSubscription: showAnswers === 'yes',
        oneTimePrice: Number(oneTimePrice),
        showAnswersForOneTime: oneTimeAnswers === 'yes',
      },
    });
    setIsSaving(false);
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <Card title={copy.subscription}>
              <p className="mb-3 text-xs text-slate-500">{copy.subscriptionHint}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <input
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder={copy.price}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                  />
                  <p className="mt-1 text-xs text-slate-500">{copy.priceHint}</p>
                </div>
                <div>
                  <input
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    placeholder={copy.duration}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                  />
                  <p className="mt-1 text-xs text-slate-500">{copy.durationHint}</p>
                </div>
              </div>
            </Card>

            <Card title={copy.free}>
              <p className="mb-3 text-xs text-slate-500">{copy.freeHint}</p>
              <div className="flex gap-2">
                {[copy.yes, copy.no].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFreeAttempts(item === copy.yes ? 'yes' : 'no')}
                    className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                      freeAttempts === (item === copy.yes ? 'yes' : 'no')
                        ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <input
                  value={dailyLimit}
                  onChange={(event) => setDailyLimit(event.target.value)}
                  placeholder={copy.dailyLimit}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                />
                <p className="mt-1 text-xs text-slate-500">{copy.dailyLimitHint}</p>
              </div>
              <div className="mt-4">
                <input
                  value={oralDailyLimit}
                  onChange={(event) => setOralDailyLimit(event.target.value)}
                  placeholder={copy.oralDailyLimit}
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                />
                <p className="mt-1 text-xs text-slate-500">{copy.oralDailyLimitHint}</p>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm text-slate-600">{copy.showAnswers}</p>
                <div className="flex gap-2">
                  {[copy.yes, copy.no].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setShowAnswers(item === copy.yes ? 'yes' : 'no')}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                        showAnswers === (item === copy.yes ? 'yes' : 'no')
                          ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">{copy.showAnswersHint}</p>
              </div>
            </Card>

            <Card title={copy.oneTime}>
              <p className="mb-3 text-xs text-slate-500">{copy.oneTimeHint}</p>
              <div>
                <input
                  value={oneTimePrice}
                  onChange={(event) => setOneTimePrice(event.target.value)}
                  placeholder={copy.price}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                />
                <p className="mt-1 text-xs text-slate-500">{copy.oneTimePriceHint}</p>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm text-slate-600">{copy.showAnswers}</p>
                <div className="flex gap-2">
                  {[copy.yes, copy.no].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setOneTimeAnswers(item === copy.yes ? 'yes' : 'no')}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                        oneTimeAnswers === (item === copy.yes ? 'yes' : 'no')
                          ? 'border-[#2AABEE] bg-[#2AABEE] text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">{copy.oneTimeAnswersHint}</p>
              </div>
            </Card>

            <Button size="lg" onClick={handleSave} disabled={isSaving}>
              {copy.save}
            </Button>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
