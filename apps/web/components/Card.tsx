import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ title, children, className, onClick }: CardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`
        rounded-2xl p-5
        bg-[var(--app-card-bg)]
        border border-[color:var(--app-card-border)]
        shadow-sm
        transition-all duration-200
        hover:border-[color:var(--app-card-border-hover)] hover:shadow-md
        ${onClick ? 'cursor-pointer' : ''}
        ${className ?? ''}
      `}
    >
      {title && (
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {title}
        </h2>
      )}

      {children}
    </div>
  );
}
