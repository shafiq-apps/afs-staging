'use client';

import { ReactNode, HTMLAttributes } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { LucideIcon } from "lucide-react";

export type BannerVariant = 'info' | 'success' | 'warning' | 'error' | 'default';

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: LucideIcon;
}

const variantStyles: Record<BannerVariant, { bg: string; border: string; text: string; icon: typeof Info }> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-500/20',
    border: 'border-blue-200 dark:border-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
    icon: Info,
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/25',
    border: 'border-emerald-200 dark:border-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle,
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-500/25',
    border: 'border-amber-200 dark:border-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    icon: AlertTriangle,
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-500/25',
    border: 'border-red-200 dark:border-red-500',
    text: 'text-red-700 dark:text-red-300',
    icon: AlertCircle,
  },
  default: {
    bg: 'bg-gray-50 dark:bg-slate-700',
    border: 'border-gray-200 dark:border-slate-500',
    text: 'text-gray-700 dark:text-gray-200',
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

