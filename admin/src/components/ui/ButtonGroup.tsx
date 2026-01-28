'use client';

import { ReactNode, HTMLAttributes } from 'react';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  orientation?: 'horizontal' | 'vertical';
  attached?: boolean;
}

export default function ButtonGroup({
  children,
  orientation = 'horizontal',
  attached = false,
  className = '',
  ...props
}: ButtonGroupProps) {
  const orientationStyle = orientation === 'horizontal' ? 'flex-row' : 'flex-col';
  const attachedStyle = attached ? 'space-x-0' : 'space-x-2';

  return (
    <div
      className={`inline-flex ${orientationStyle} ${attachedStyle} ${className}`}
      role="group"
      {...props}
    >
      {children}
    </div>
  );
}

