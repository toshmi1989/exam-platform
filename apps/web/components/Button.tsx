import Link from 'next/link';
import { ReactNode } from 'react';
import { triggerHapticFeedback } from '../lib/telegram';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-300',
  secondary:
    'border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-200',
  ghost:
    'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-200',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3.5 text-base',
};

export default function Button({
  children,
  href,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled = false,
  className: classNameProp,
}: ButtonProps) {
  const className = `
    inline-flex items-center justify-center gap-2
    rounded-xl font-semibold
    transition-all duration-150
    shadow-sm hover:shadow-md
    hover:-translate-y-0.5
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    active:scale-[0.98] active:translate-y-0
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${disabled ? 'pointer-events-none opacity-60' : ''}
    ${classNameProp ?? ''}
  `;

  const handleClick = (e: React.MouseEvent) => {
    if (!disabled) triggerHapticFeedback('light');
    onClick?.();
  };

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        onClick={() => !disabled && triggerHapticFeedback('light')}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      className={className}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
