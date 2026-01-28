'use client';

import { ReactNode, HTMLAttributes } from 'react';

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  direction?: 'row' | 'column';
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?: boolean;
}

const spacingStyles = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

const alignStyles = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyStyles = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

export default function Stack({
  children,
  direction = 'column',
  spacing = 'md',
  align = 'stretch',
  justify = 'start',
  wrap = false,
  className = '',
  ...props
}: StackProps) {
  const directionStyle = direction === 'row' ? 'flex-row' : 'flex-col';
  const spacingStyle = spacingStyles[spacing];
  const alignStyle = alignStyles[align];
  const justifyStyle = justifyStyles[justify];
  const wrapStyle = wrap ? 'flex-wrap' : '';

  return (
    <div
      className={`flex ${directionStyle} ${spacingStyle} ${alignStyle} ${justifyStyle} ${wrapStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

