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
import { readTelegramUser } from '../../../lib/telegramUser';

export default function AdminAccessSettingsPage() {
  type PlanState = { name: string; price: string; duration: string; enabled: boolean };
  const [plans, setPlans] = useState<PlanState[]>([
    { name: 'Подписка', price: '99000', duration: '30', enabled: true },
    { name: '', price: '0', duration: '0', enabled: false },
    { name: '', price: '0', duration: '0', enabled: false },
  ]);
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [price, setPrice] = useState('99000');
  const [duration, setDuration] = useState('30');
  const [freeAttempts, setFreeAttempts] = useState('yes');
  const [dailyLimit, setDailyLimit] = useState('1');
  const [oralDailyLimit, setOralDailyLimit] = useState('5');
  const [botAiDailyLimit, setBotAiDailyLimit] = useState('3');
  const [showAnswers, setShowAnswers] = useState('no');
  const [oneTimePrice, setOneTimePrice] = useState('15000');
  const [oneTimeAnswers, setOneTimeAnswers] = useState('no');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        planNum: (n: number) => `Plan ${n}`,
        planName: 'Plan name',
        enabled: 'Enabled',
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
        botAiDailyLimit: 'AI bot: requests per day (no subscription)',
        botAiDailyLimitHint: 'Daily limit of Ziyoda AI replies for users without subscription. 0 = no free AI.',
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
        planNum: (n: number) => `Tarif ${n}`,
        planName: 'Tarif nomi',
        enabled: 'Yoqilgan',
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
        botAiDailyLimit: 'AI bot: kunlik so‘rovlar (obunasiz)',
        botAiDailyLimitHint: 'Obunasiz foydalanuvchilar uchun Ziyoda AI javoblari limiti. 0 = bepul AI yo‘q.',
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
      planNum: (n: number) => `План ${n}`,
      planName: 'Название плана',
      enabled: 'Включён',
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
      botAiDailyLimit: 'ИИ-бот: запросов в день (без подписки)',
      botAiDailyLimitHint: 'Дневной лимит ответов Зиёды для пользователей без подписки. 0 = нет бесплатных запросов к ИИ.',
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
    try {
      const res = await fetch('/api/admin/settings/access', { method: 'GET', headers });
      const data = (await res.json().catch(() => null)) as {
        settings?: {
          subscriptionPrice: number;
          subscriptionDurationDays: number;
          subscriptionPlans?: { index: number; name: string; price: number; durationDays: number; enabled: boolean }[];
          allowFreeAttempts: boolean;
          freeDailyLimit: number;
          freeOralDailyLimit?: number;
          showAnswersWithoutSubscription: boolean;
          oneTimePrice: number;
          showAnswersForOneTime: boolean;
        };
      } | null;
      setLoadError(null);
      if (!res.ok) return;
      if (!data?.settings) return;
      const sp = data.settings.subscriptionPlans;
      if (Array.isArray(sp) && sp.length >= 1) {
        setPlans([
          { name: sp[0]?.name ?? 'Подписка', price: String(sp[0]?.price ?? 0), duration: String(sp[0]?.durationDays ?? 0), enabled: sp[0]?.enabled ?? true },
          { name: sp[1]?.name ?? '', price: String(sp[1]?.price ?? 0), duration: String(sp[1]?.durationDays ?? 0), enabled: sp[1]?.enabled ?? false },
          { name: sp[2]?.name ?? '', price: String(sp[2]?.price ?? 0), duration: String(sp[2]?.durationDays ?? 0), enabled: sp[2]?.enabled ?? false },
        ]);
      } else {
        setPrice(String(data.settings.subscriptionPrice));
        setDuration(String(data.settings.subscriptionDurationDays));
        setPlans((prev) => [
          { name: 'Подписка', price: String(data.settings!.subscriptionPrice), duration: String(data.settings!.subscriptionDurationDays), enabled: true },
          prev[1],
          prev[2],
        ]);
      }
      setFreeAttempts(data.settings.allowFreeAttempts ? 'yes' : 'no');
      setDailyLimit(String(data.settings.freeDailyLimit));
      setOralDailyLimit(String(data.settings.freeOralDailyLimit ?? 5));
      setBotAiDailyLimit(String((data.settings as { botAiDailyLimitFree?: number }).botAiDailyLimitFree ?? 3));
      setShowAnswers(data.settings.showAnswersWithoutSubscription ? 'yes' : 'no');
      setOneTimePrice(String(data.settings.oneTimePrice));
      setOneTimeAnswers(data.settings.showAnswersForOneTime ? 'yes' : 'no');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить настройки.');
    }
  }

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = readTelegramUser();
    if (user?.telegramId) headers['x-telegram-id'] = user.telegramId;
    try {
      const firstEnabled = plans.find((p) => p.enabled);
      const res = await fetch('/api/admin/settings/access', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subscriptionPrice: firstEnabled ? Number(firstEnabled.price) : Number(price),
          subscriptionDurationDays: firstEnabled ? Number(firstEnabled.duration) : Number(duration),
          subscriptionPlans: plans.map((p, i) => ({
            index: i + 1,
            name: p.name.trim() || (i === 0 ? 'Подписка' : ''),
            price: Number(p.price) || 0,
            durationDays: Number(p.duration) || 0,
            enabled: p.enabled,
          })),
          allowFreeAttempts: freeAttempts === 'yes',
          freeDailyLimit: Number(dailyLimit),
          freeOralDailyLimit: Number(oralDailyLimit),
          botAiDailyLimitFree: Number(botAiDailyLimit),
          showAnswersWithoutSubscription: showAnswers === 'yes',
          oneTimePrice: Number(oneTimePrice),
          showAnswersForOneTime: oneTimeAnswers === 'yes',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(data?.error ?? 'Не удалось сохранить.');
        return;
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Нет связи с сервером.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            {loadError && (
              <p className="text-sm text-rose-600">{loadError}</p>
            )}

            {[0, 1, 2].map((i) => (
              <Card key={i} title={copy.planNum(i + 1)}>
                <p className="mb-3 text-xs text-slate-500">{i === 0 ? copy.subscriptionHint : ''}</p>
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`plan-enabled-${i}`}
                    checked={plans[i].enabled}
                    onChange={(e) => {
                      setPlans((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], enabled: e.target.checked };
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-[#2AABEE] focus:ring-[#2AABEE]"
                  />
                  <label htmlFor={`plan-enabled-${i}`} className="text-sm text-slate-600">{copy.enabled}</label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <input
                      value={plans[i].name}
                      onChange={(e) => setPlans((prev) => { const n = [...prev]; n[i] = { ...n[i], name: e.target.value }; return n; })}
                      placeholder={copy.planName}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                    />
                  </div>
                  <div>
                    <input
                      value={plans[i].price}
                      onChange={(e) => setPlans((prev) => { const n = [...prev]; n[i] = { ...n[i], price: e.target.value }; return n; })}
                      placeholder={copy.price}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                    />
                    <p className="mt-1 text-xs text-slate-500">{copy.priceHint}</p>
                  </div>
                  <div>
                    <input
                      value={plans[i].duration}
                      onChange={(e) => setPlans((prev) => { const n = [...prev]; n[i] = { ...n[i], duration: e.target.value }; return n; })}
                      placeholder={copy.duration}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                    />
                    <p className="mt-1 text-xs text-slate-500">{i === 0 ? copy.durationHint : ''}</p>
                  </div>
                </div>
              </Card>
            ))}

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
                <input
                  value={botAiDailyLimit}
                  onChange={(event) => setBotAiDailyLimit(event.target.value)}
                  placeholder={copy.botAiDailyLimit}
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                />
                <p className="mt-1 text-xs text-slate-500">{copy.botAiDailyLimitHint}</p>
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

            {saveError && (
              <p className="text-sm text-rose-600">{saveError}</p>
            )}
            <Button size="lg" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '…' : copy.save}
            </Button>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
