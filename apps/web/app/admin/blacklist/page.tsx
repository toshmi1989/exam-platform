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

export default function AdminBlacklistPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [telegramId, setTelegramId] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<
    { telegramId: string; reason?: string; createdAt: number }[]
  >([]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    void loadBlacklist();
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Blacklist',
        subtitle: 'Block users by Telegram ID.',
        id: 'Telegram ID',
        reason: 'Reason',
        add: 'Add to blacklist',
        unblock: 'Unblock',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Qora ro’yxat',
        subtitle: 'Telegram ID bo‘yicha bloklash.',
        id: 'Telegram ID',
        reason: 'Sabab',
        add: 'Qora ro’yxatga qo‘shish',
        unblock: 'Blokdan chiqarish',
      };
    }
    return {
      title: 'Черный список',
      subtitle: 'Блокировка пользователей по Telegram ID.',
      id: 'Telegram ID',
      reason: 'Причина',
      add: 'Добавить в черный список',
      unblock: 'Разблокировать',
    };
  }, [language]);

  async function loadBlacklist() {
    const { response, data } = await apiFetch('/admin/blacklist');
    if (!response.ok) return;
    const payload = data as { items?: typeof items } | null;
    setItems(payload?.items ?? []);
  }

  async function handleAdd() {
    if (!telegramId.trim()) return;
    const { response } = await apiFetch('/admin/blacklist', {
      method: 'POST',
      json: { telegramId, reason },
    });
    if (response.ok) {
      setTelegramId('');
      setReason('');
      void loadBlacklist();
    }
  }

  async function handleRemove(id: string) {
    const { response } = await apiFetch(`/admin/blacklist/${id}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      void loadBlacklist();
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <Card>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={telegramId}
                  onChange={(event) => setTelegramId(event.target.value)}
                  placeholder={copy.id}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                />
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={copy.reason}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                />
              </div>
              <div className="mt-4">
                <Button size="lg" onClick={handleAdd}>
                  {copy.add}
                </Button>
              </div>
            </Card>

            <div className="grid gap-4">
              {items.map((item) => (
                <Card
                  key={item.telegramId}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.telegramId}
                    </p>
                    <p className="text-xs text-slate-500">{item.reason}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => handleRemove(item.telegramId)}
                  >
                    {copy.unblock}
                  </Button>
                </Card>
              ))}
            </div>
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
