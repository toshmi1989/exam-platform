'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { readSettings, Language } from '../../../lib/uiSettings';
import { getAdminChatsUnreadCount } from '../../../lib/api';

export default function AdminNav() {
  const pathname = usePathname();
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [chatsUnread, setChatsUnread] = useState(0);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const n = await getAdminChatsUnreadCount();
        setChatsUnread(n);
      } catch {
        setChatsUnread(0);
      }
    }
    function onVisible() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load();
      }
    }
    void load();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load();
      }
    }, 15000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const items = useMemo(() => {
    if (language === 'Английский') {
      return [
        { href: '/admin', label: 'Dashboard' },
        { href: '/admin/users', label: 'Users' },
        { href: '/admin/blacklist', label: 'Blacklist' },
        { href: '/admin/chats', label: 'Chats' },
        { href: '/admin/broadcasts', label: 'Broadcast' },
        { href: '/admin/exams', label: 'Exams' },
        { href: '/admin/access-settings', label: 'Access' },
        { href: '/admin/import', label: 'Import' },
        { href: '/admin/ai', label: 'AI — Tests' },
        { href: '/admin/ai/oral', label: 'AI — Oral' },
        { href: '/admin/analytics', label: 'Analytics' },
      ];
    }
    if (language === 'Узбекский') {
      return [
        { href: '/admin', label: 'Bosh sahifa' },
        { href: '/admin/users', label: 'Foydalanuvchilar' },
        { href: '/admin/blacklist', label: 'Qora ro’yxat' },
        { href: '/admin/chats', label: 'Chatlar' },
        { href: '/admin/broadcasts', label: 'Xabar yuborish' },
        { href: '/admin/exams', label: 'Imtihonlar' },
        { href: '/admin/access-settings', label: 'Kirish' },
        { href: '/admin/import', label: 'Import' },
        { href: '/admin/ai', label: 'AI — Testlar' },
        { href: '/admin/ai/oral', label: "AI — Og'zaki" },
        { href: '/admin/analytics', label: 'Analitika' },
      ];
    }
    return [
      { href: '/admin', label: 'Сводка' },
      { href: '/admin/users', label: 'Пользователи' },
      { href: '/admin/blacklist', label: 'Черный список' },
      { href: '/admin/chats', label: 'Чаты' },
      { href: '/admin/broadcasts', label: 'Рассылка' },
      { href: '/admin/exams', label: 'Экзамены' },
      { href: '/admin/access-settings', label: 'Доступ' },
      { href: '/admin/import', label: 'Импорт' },
      { href: '/admin/ai', label: 'AI — Тесты' },
      { href: '/admin/ai/oral', label: 'AI — Устные' },
      { href: '/admin/analytics', label: 'Аналитика' },
    ];
  }, [language]);

  return (
    <div className="grid grid-cols-3 gap-2 pb-2">
      {items.map((item) => {
        const isActive =
          item.href === '/admin/ai'
            ? pathname === '/admin/ai'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isChats = item.href === '/admin/chats';
        const showBadge = isChats && chatsUnread > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-medium transition ${
              isActive
                ? 'bg-[#2AABEE] text-white'
                : 'border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {item.label}
            {showBadge ? (
              <span
                className={`absolute -right-1 -top-1 flex h-4 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold shadow-sm ${
                  isActive
                    ? 'bg-white text-rose-500'
                    : 'bg-rose-500 text-white'
                }`}
                title={chatsUnread > 0 ? `Непрочитанных: ${chatsUnread}` : undefined}
                aria-label={chatsUnread > 0 ? `Непрочитанных сообщений: ${chatsUnread}` : undefined}
              >
                {chatsUnread > 99 ? '99+' : chatsUnread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
