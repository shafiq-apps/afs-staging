'use client';

import Link from 'next/link';
import { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  children?: ReactNode;
  iconOnly?: boolean;
  ariaLabel?: string;
  label?: string;
  onClick?: (e: any) => void;
  disabled?: boolean | undefined | null;
  external?: boolean;
};

export type CommonButtonProps =
  | (ButtonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: string })
  | (ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string });

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-500/90 hover:bg-blue-600 text-white transition-colors duration-200 shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 border-transparent',
  secondary: 'bg-slate-800/60 dark:bg-slate-700/60 text-slate-100 dark:text-slate-200 hover:bg-slate-800/80 dark:hover:bg-slate-700/80 border-slate-700/30 dark:border-slate-600/30',
  outline: 'bg-white dark:bg-slate-800 text-white dark:text-gray-200 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700',
  ghost: 'bg-transparent text-white dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 border-transparent',
  danger: 'bg-red-500/90 hover:bg-red-600 text-white transition-colors duration-200 shadow-md shadow-red-500/20 hover:shadow-red-500/30 border-transparent'
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-0 py-1.5 text-sm',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
  xl: 'px-8 py-4 text-md',
};

const iconOnlySizeStyles: Record<ButtonSize, string> = {
  xs: 'h-8',
  sm: 'h-9',
  md: 'h-10',
  lg: 'h-12',
  xl: 'h-14',
};

export default function Button({
  variant = 'outline',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  children,
  iconOnly = false,
  ariaLabel,
  className = '',
  label,
  href = undefined,
  disabled = undefined,
  external,
  ...props
}: CommonButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];
  const sizeHeight = iconOnlySizeStyles[size];
  const focusRingColor = variant === 'danger' ? 'focus:ring-blue-500' : 'focus:ring-blue-500';

  const content = (
    <>
      {loading ? (
        <>
          <svg
            className={`animate-spin h-4 w-4 ${iconOnly ? '' : '-ml-1 mr-2'}`}
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
          {iconOnly && Icon ? null : children}
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && (
            <Icon className={`h-4 w-4 ${iconOnly ? '' : 'mr-2'}`} />
          )}

          {iconOnly && Icon ? null : children}

          {Icon && iconPosition === 'right' && (
            <Icon className={`h-4 w-4 ${iconOnly ? '' : 'ml-2'}`} />
          )}
        </>
      )}
    </>
  );

  const classes = `${baseStyles} ${variantStyle} ${sizeStyle} ${sizeHeight} ${focusRingColor} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-label={iconOnly ? ariaLabel || label || 'Icon link' : undefined}
        aria-disabled={disabled || loading}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...(props as any)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-label={iconOnly ? ariaLabel || label || 'Icon button' : undefined}
      {...(props as any)}
    >
      {content}
    </button>
  );
}
