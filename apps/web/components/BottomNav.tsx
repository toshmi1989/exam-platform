'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { readSettings, Language } from '../lib/uiSettings';
import { readTelegramUser, TelegramUserSnapshot } from '../lib/telegramUser';

const activeColor = '#2AABEE';

export default function BottomNav() {
  const pathname = usePathname();
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [user, setUser] = useState<TelegramUserSnapshot | null>(
    readTelegramUser()
  );
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const navItems = useMemo(() => {
    const isAdmin = Boolean(user?.isAdmin || user?.role === 'admin');
    if (language === 'Английский') {
      const items = [
        { href: '/cabinet/my-exams', label: 'Exams' },
        { href: '/cabinet', label: 'Home' },
        { href: '/cabinet/settings', label: 'Settings' },
      ];
      return isAdmin ? [...items, { href: '/admin', label: 'Admin' }] : items;
    }
    if (language === 'Узбекский') {
      const items = [
        { href: '/cabinet/my-exams', label: 'Imtihon' },
        { href: '/cabinet', label: 'Asosiy' },
        { href: '/cabinet/settings', label: 'Sozlamalar' },
      ];
      return isAdmin ? [...items, { href: '/admin', label: 'Admin' }] : items;
    }
    const items = [
      { href: '/cabinet/my-exams', label: 'Экзамен' },
      { href: '/cabinet', label: 'Главный' },
      { href: '/cabinet/settings', label: 'Настройки' },
    ];
    return isAdmin ? [...items, { href: '/admin', label: 'Админ' }] : items;
  }, [language, user]);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    const updateUser = () => setUser(readTelegramUser());
    window.addEventListener('telegram-user-changed', updateUser);
    return () => window.removeEventListener('telegram-user-changed', updateUser);
  }, []);
  const activeIndex = (() => {
    let bestIndex = -1;
    let bestLength = -1;
    navItems.forEach((item, index) => {
      const isMatch =
        normalizedPath === item.href ||
        normalizedPath.startsWith(`${item.href}/`);
      if (isMatch && item.href.length > bestLength) {
        bestIndex = index;
        bestLength = item.href.length;
      }
    });
    return Math.max(0, bestIndex);
  })();

  return (
    <nav
      className="fixed left-0 right-0 bottom-3 z-50 transition-all duration-300 ease-out"
    >
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 shadow-[0_18px_35px_rgba(15,23,42,0.18)] ring-1 ring-[#2AABEE]/20 backdrop-blur-md">
            <>
              <div
                className="pointer-events-none absolute left-2 top-2 h-10 transition-transform duration-300 ease-out"
                style={{
                  width: `calc((100% - 1rem) / ${navItems.length})`,
                  transform: `translateX(${activeIndex * 100}%)`,
                }}
              >
                <div
                  className="h-full w-full rounded-xl"
                  style={{ backgroundColor: activeColor }}
                />
              </div>

              <div
                className="grid gap-0"
                style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
              >
                {navItems.map((item, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative z-10 flex h-10 items-center justify-center rounded-xl text-[13px] font-medium transition-all duration-150 active:scale-[0.98] ${
                        isActive
                          ? 'text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
