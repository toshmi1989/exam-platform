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

type UserItem = {
  telegramId: string;
  name: string;
  status: string;
  lastSeen: string;
  subscriptionActive?: boolean;
};

export default function AdminUsersPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [recentDirections, setRecentDirections] = useState<{ direction: string; examType: string; attemptedAt: string }[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadUsers();
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!selectedUser?.telegramId) {
      setRecentDirections([]);
      setUserAvatar(null);
      return;
    }
    
    // Load recent directions
    apiFetch(`/admin/users/${encodeURIComponent(selectedUser.telegramId)}/recent-directions`)
      .then(({ response, data }) => {
        if (!response.ok) return;
        const payload = data as { items?: { direction: string; examType: string; attemptedAt: string }[] };
        setRecentDirections(payload?.items ?? []);
      })
      .catch(() => setRecentDirections([]));
    
    // Load avatar
    apiFetch(`/admin/users/${encodeURIComponent(selectedUser.telegramId)}/avatar`)
      .then(({ response, data }) => {
        if (response.ok) {
          const payload = data as { avatarUrl?: string };
          setUserAvatar(payload?.avatarUrl ?? null);
        } else {
          setUserAvatar(null);
        }
      })
      .catch(() => setUserAvatar(null));
  }, [selectedUser?.telegramId]);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Users',
        subtitle: 'Search and manage users.',
        search: 'Search by Telegram ID or name',
        subscriptionLabel: 'Subscription',
        subActive: 'Active',
        noSub: 'None',
        lastVisit: 'Last visit',
        telegramId: 'Telegram ID',
        grantSub: 'Activate subscription',
        cancelSub: 'Cancel subscription',
        deleteFromDb: 'Delete from database',
        back: 'Back',
        actionFailed: 'Action failed. Please try again.',
        recentDirections: 'Last 10 directions (test/oral)',
        noRecent: 'No attempts yet.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Foydalanuvchilar',
        subtitle: 'Foydalanuvchilarni qidirish va boshqarish.',
        search: 'Telegram ID yoki ism bo‘yicha qidiring',
        subscriptionLabel: 'Obuna',
        subActive: 'Faol',
        noSub: 'Yo‘q',
        lastVisit: 'Oxirgi tashrif',
        telegramId: 'Telegram ID',
        grantSub: 'Obunani faollashtirish',
        cancelSub: 'Obunani bekor qilish',
        deleteFromDb: 'Bazadan o‘chirish',
        back: 'Orqaga',
        actionFailed: 'Amal bajarilmadi. Qayta urinib ko‘ring.',
        recentDirections: "So'nggi 10 yo'nalish (test/og'zaki)",
        noRecent: "Hali urinishlar yo'q.",
      };
    }
    return {
      title: 'Пользователи',
      subtitle: 'Поиск и управление пользователями.',
      search: 'Поиск по Telegram ID или имени',
        subscriptionLabel: 'Подписка',
        subActive: 'Активна',
        noSub: 'Нет',
        lastVisit: 'Последний визит',
      telegramId: 'Telegram ID',
      grantSub: 'Активировать подписку',
      cancelSub: 'Отменить подписку',
      deleteFromDb: 'Удалить из базы',
      back: 'Назад',
      actionFailed: 'Не удалось выполнить действие.',
      recentDirections: 'Последние 10 направлений (тест/устный)',
      noRecent: 'Попыток пока нет.',
    };
  }, [language]);

  async function loadUsers() {
    const { response, data } = await apiFetch(
      `/admin/users?search=${encodeURIComponent(query)}`
    );
    if (!response.ok) return;
    const payload = data as { items?: UserItem[] } | null;
    setUsers(payload?.items ?? []);
  }

  async function handleGrantSubscription(telegramId: string) {
    setActionError(null);
    setActionLoading(true);
    try {
      const { response } = await apiFetch(
        `/admin/users/${encodeURIComponent(telegramId)}/subscription/grant`,
        { method: 'POST' }
      );
      if (!response.ok) {
        setActionError(copy.actionFailed);
        return;
      }
      await loadUsers();
      setSelectedUser((prev) => {
        if (!prev || prev.telegramId !== telegramId) return prev;
        return { ...prev, subscriptionActive: true };
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelSubscription(telegramId: string) {
    setActionError(null);
    setActionLoading(true);
    try {
      const { response } = await apiFetch(
        `/admin/users/${encodeURIComponent(telegramId)}/subscription/cancel`,
        { method: 'POST' }
      );
      if (!response.ok) {
        setActionError(copy.actionFailed);
        return;
      }
      await loadUsers();
      setSelectedUser((prev) => {
        if (!prev || prev.telegramId !== telegramId) return prev;
        return { ...prev, subscriptionActive: false };
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteFromDb(telegramId: string) {
    setActionError(null);
    setActionLoading(true);
    try {
      const { response } = await apiFetch(
        `/admin/users/${encodeURIComponent(telegramId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        setActionError(copy.actionFailed);
        return;
      }
      await loadUsers();
      setSelectedUser(null);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.search}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
            />

            {actionError ? (
              <Card>
                <p className="text-sm text-rose-500">{actionError}</p>
              </Card>
            ) : null}

            {selectedUser ? (
              <Card title={selectedUser.name}>
                <div className="flex flex-col gap-4">
                  {userAvatar && (
                    <div className="flex justify-center">
                      <img
                        src={userAvatar}
                        alt={selectedUser.name}
                        className="h-24 w-24 rounded-full object-cover border-2 border-slate-200"
                        onError={() => setUserAvatar(null)}
                      />
                    </div>
                  )}
                  <div className="grid gap-2 text-sm">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-500">
                        {copy.telegramId}:
                      </span>{' '}
                      {selectedUser.telegramId}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-500">
                        {copy.lastVisit}:
                      </span>{' '}
                      {new Date(selectedUser.lastSeen).toLocaleString()}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-500">
                        {copy.subscriptionLabel}:
                      </span>{' '}
                      {selectedUser.subscriptionActive ? copy.subActive : copy.noSub}
                    </p>
                  </div>
                  {recentDirections.length > 0 ? (
                    <div className="border-t border-slate-200 pt-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">
                        {copy.recentDirections}
                      </p>
                      <ul className="space-y-1 text-sm text-slate-600">
                        {recentDirections.map((item, i) => (
                          <li key={i}>
                            {item.direction}
                            <span className="ml-1 text-slate-400">
                              {item.examType === 'ORAL' ? 'устный' : 'тест'}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">
                              {new Date(item.attemptedAt).toLocaleDateString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
                      {copy.recentDirections}: {copy.noRecent}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    <Button
                      size="md"
                      onClick={() => handleGrantSubscription(selectedUser.telegramId)}
                      disabled={actionLoading}
                    >
                      {copy.grantSub}
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => handleCancelSubscription(selectedUser.telegramId)}
                      disabled={actionLoading}
                    >
                      {copy.cancelSub}
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => handleDeleteFromDb(selectedUser.telegramId)}
                      disabled={actionLoading}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                    >
                      {copy.deleteFromDb}
                    </Button>
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => setSelectedUser(null)}
                      disabled={actionLoading}
                    >
                      {copy.back}
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <div className="grid gap-2">
                {users.map((user) => (
                  <Card
                    key={user.telegramId}
                    className="cursor-pointer p-3 transition hover:border-[#2AABEE] hover:bg-slate-50/50"
                    onClick={() => setSelectedUser(user)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {user.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {user.telegramId} · {user.status}
                          {user.subscriptionActive ? ` · ${copy.subActive}` : ''}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
