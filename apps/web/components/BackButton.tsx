'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface BackButtonProps {
  label?: string;
  onBack?: () => void;
  className?: string;
  placement?: 'top' | 'bottom';
}

export default function BackButton({
  label = 'Back',
  onBack,
  className,
  placement = 'top',
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  }, [onBack, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as { Telegram?: { WebApp?: { BackButton?: { show?: () => void; hide?: () => void; onClick?: (cb: () => void) => void; offClick?: (cb: () => void) => void } } } })
      .Telegram?.WebApp;

    const backButton = tg?.BackButton;
    if (!backButton) return;

    backButton.show?.();
    backButton.onClick?.(handleBack);

    return () => {
      backButton.offClick?.(handleBack);
      backButton.hide?.();
    };
  }, [handleBack]);

  const button = (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900 ${className ?? ''}`}
      aria-label={label}
    >
      <span className="text-base">←</span>
      {label}
    </button>
  );

  if (placement === 'bottom') {
    return (
      <div className="fixed bottom-20 left-0 right-0 z-40 flex justify-center pb-[env(safe-area-inset-bottom)]">
        {button}
      </div>
    );
  }

  return button;
}
