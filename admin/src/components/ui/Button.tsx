'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-purple-500/90 hover:bg-purple-600 text-white transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 border-transparent',
  secondary: 'bg-slate-800/60 dark:bg-slate-700/60 text-slate-100 dark:text-slate-200 hover:bg-slate-800/80 dark:hover:bg-slate-700/80 border-slate-700/30 dark:border-slate-600/30',
  outline: 'bg-white dark:bg-slate-800 text-white dark:text-gray-200 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700',
  ghost: 'bg-transparent text-white dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 border-transparent',
  danger: 'bg-red-500/90 hover:bg-red-600 text-white transition-colors duration-200 shadow-md shadow-red-500/20 hover:shadow-red-500/30 border-transparent',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];
  const focusRingColor = variant === 'danger' ? 'focus:ring-red-500' : 'focus:ring-purple-500';

  const isDisabled = disabled || loading;

  return (
    <button
      className={`${baseStyles} ${variantStyle} ${sizeStyle} ${focusRingColor} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {children}
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="h-4 w-4 mr-2" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="h-4 w-4 ml-2" />}
        </>
      )}
    </button>
  );
}

