'use client';

import { motion } from 'framer-motion';
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';

function getNavIndex(pathname: string): number | null {
  if (pathname.startsWith('/cabinet/exams')) return 0;
  if (pathname.startsWith('/cabinet/my-exams')) return 0;
  if (pathname === '/cabinet') return 1;
  if (pathname.startsWith('/cabinet/settings')) return 2;
  if (pathname.startsWith('/admin')) return 3;
  return null;
}

export default function AnimatedPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const lastIndexRef = useRef<number | null>(null);
  const hasHistoryRef = useRef<boolean>(false);

  const { direction, isTabNav } = useMemo(() => {
    const currentIndex = getNavIndex(pathname);
    if (currentIndex === null) {
      return { direction: 0, isTabNav: false };
    }

    if (lastIndexRef.current === null) {
      if (typeof window !== 'undefined') {
        const stored = window.sessionStorage.getItem('nav-index');
        hasHistoryRef.current = stored !== null;
        lastIndexRef.current = stored ? Number(stored) : currentIndex;
      } else {
        lastIndexRef.current = currentIndex;
      }
    }

    const lastIndex = lastIndexRef.current ?? currentIndex;
    const dir =
      currentIndex === lastIndex ? 0 : currentIndex > lastIndex ? 1 : -1;

    return { direction: dir, isTabNav: true };
  }, [pathname]);

  useEffect(() => {
    const currentIndex = getNavIndex(pathname);
    if (currentIndex === null) return;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('nav-index', String(currentIndex));
    }
    lastIndexRef.current = currentIndex;
  }, [pathname]);

  const initial = isTabNav
    ? hasHistoryRef.current
      ? { opacity: 0, x: direction * 24 }
      : { opacity: 1, x: 0, y: 0 }
    : { opacity: 0, y: 14 };
  const animate = { opacity: 1, x: 0, y: 0 };
  const exit = isTabNav
    ? { opacity: 0, x: direction * -20 }
    : { opacity: 0, y: -10 };

  return (
    <motion.div
      initial={initial}
      animate={animate}
      exit={exit}
      transition={{
        duration: 0.32,
        ease: 'easeOut',
      }}
    >
      {children}
    </motion.div>
  );
}
