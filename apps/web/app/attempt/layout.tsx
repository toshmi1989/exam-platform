'use client';

import { useCallback, useEffect, useState } from 'react';

export default function AttemptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [contentHidden, setContentHidden] = useState(false);

  const preventCopy = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
  }, []);

  const preventContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        setContentHidden(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div
      className="relative select-none"
      style={{
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onCopy={preventCopy}
      onCut={preventCopy}
      onContextMenu={preventContextMenu}
    >
      {children}
      {contentHidden ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm"
          onClick={() => setContentHidden(false)}
          onTouchEnd={() => setContentHidden(false)}
          role="button"
          tabIndex={0}
          aria-label="Tap to continue"
        >
          <p className="px-6 text-center text-lg font-medium text-white">
            Касание для продолжения
          </p>
        </div>
      ) : null}
    </div>
  );
}
