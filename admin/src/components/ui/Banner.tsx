'use client';

import { ReactNode, HTMLAttributes } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export type BannerVariant = 'info' | 'success' | 'warning' | 'error' | 'default';

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: ReactNode;
}

const variantStyles: Record<BannerVariant, { bg: string; border: string; text: string; icon: typeof Info }> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-300',
    icon: Info,
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-300',
    icon: CheckCircle,
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-300',
    icon: AlertCircle,
  },
  default: {
    bg: 'bg-gray-50 dark:bg-slate-800',
    border: 'border-gray-200 dark:border-slate-700',
    text: 'text-gray-800 dark:text-gray-200',
    icon: Info,
  },
};

export default function Banner({
  variant = 'default',
  children,
  dismissible = false,
  onDismiss,
  icon,
  className = '',
  ...props
}: BannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const styles = variantStyles[variant];
  const Icon = icon || styles.icon;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  return (
    <div
      className={`${styles.bg} ${styles.border} ${styles.text} border rounded-lg p-4 ${className}`}
      {...props}
    >
      <div className="flex items-start">
        <Icon className={`h-5 w-5 ${styles.text} flex-shrink-0 mt-0.5`} />
        <div className="ml-3 flex-1">
          {children}
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className={`ml-4 ${styles.text} hover:opacity-70 cursor-pointer`}
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

