'use client';

import { ReactNode, HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export default function Card({
  children,
  padding = 'md',
  hover = false,
  className = '',
  ...props
}: CardProps) {
  const paddingStyle = paddingStyles[padding];
  const hoverStyle = hover ? 'transition-all duration-200 hover:border-gray-300 dark:hover:border-slate-600' : '';

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 ${paddingStyle} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

