'use client';

import { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'info' | 'success' | 'warning' | 'error' | 'default';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    size?: BadgeSize;
    children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    default: 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-200',
};

const sizeStyles: Record<BadgeSize, string> = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
};

export default function Badge({
    variant = 'default',
    size = 'md',
    children,
    className = '',
    ...props
}: BadgeProps) {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-full whitespace-nowrap';

    return (
        <span
            className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
            {...props}
        >
            {children}
        </span>
    );
}
