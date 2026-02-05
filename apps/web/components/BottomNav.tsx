'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { readSettings, Language } from '../lib/uiSettings';
import { readTelegramUser, TelegramUserSnapshot } from '../lib/telegramUser';

// Определение высоты клавиатуры через визуальный viewport
function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Используем visualViewport если доступен (современные браузеры)
    if (window.visualViewport) {
      const updateHeight = () => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const windowHeight = window.innerHeight;
        const viewportHeight = viewport.height;
        const height = Math.max(0, windowHeight - viewportHeight);
        setKeyboardHeight(height);
      };

      window.visualViewport.addEventListener('resize', updateHeight);
      updateHeight();

      return () => {
        window.visualViewport?.removeEventListener('resize', updateHeight);
      };
    }

    // Fallback: если visualViewport недоступен, используем фиксированную высоту при фокусе
    // (это будет обрабатываться через chatMode prop)
    return;
  }, []);

  return keyboardHeight;
}

const activeColor = '#2AABEE';

interface ChatActions {
  onSend: () => void;
  onAddPhoto: () => void;
  canSend: boolean;
  hasImage: boolean;
}

interface BottomNavProps {
  chatMode?: boolean;
  chatActions?: ChatActions;
}

export default function BottomNav({ chatMode = false, chatActions }: BottomNavProps = {}) {
  const pathname = usePathname();
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [user, setUser] = useState<TelegramUserSnapshot | null>(
    readTelegramUser()
  );
  const keyboardHeight = useKeyboardHeight();
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

  const chatCopy = useMemo(() => {
    if (language === 'Английский') {
      return { addPhoto: 'Add photo', send: 'Send' };
    }
    if (language === 'Узбекский') {
      return { addPhoto: 'Rasm qo‘shish', send: 'Yuborish' };
    }
    return { addPhoto: 'Добавить фото', send: 'Отправить' };
  }, [language]);

  // При открытой клавиатуре поднимаем нав панель выше
  // Если visualViewport доступен, используем реальную высоту клавиатуры
  // Иначе используем фиксированное смещение (примерно 300px для типичной клавиатуры)
  const bottomOffset = chatMode
    ? keyboardHeight > 0
      ? `${keyboardHeight + 12}px`
      : '20rem' // Fallback: поднимаем примерно на высоту клавиатуры
    : '0.75rem';

  return (
    <nav
      className="fixed left-0 right-0 z-50 transition-all duration-300 ease-out"
      style={{ bottom: bottomOffset }}
    >
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 shadow-[0_18px_35px_rgba(15,23,42,0.18)] ring-1 ring-[#2AABEE]/20 backdrop-blur-md">
          {chatMode && chatActions ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={chatActions.onAddPhoto}
                className="flex h-10 items-center justify-center rounded-xl text-[13px] font-medium text-slate-600 transition-all duration-150 hover:bg-slate-100 active:scale-[0.98]"
              >
                {chatCopy.addPhoto}
              </button>
              <button
                type="button"
                onClick={chatActions.onSend}
                disabled={!chatActions.canSend}
                className={`flex h-10 items-center justify-center rounded-xl text-[13px] font-medium transition-all duration-150 active:scale-[0.98] ${
                  chatActions.canSend
                    ? 'bg-[#2AABEE] text-white hover:bg-[#2299DD]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {chatCopy.send}
              </button>
            </div>
          ) : (
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
