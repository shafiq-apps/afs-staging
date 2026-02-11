'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  resize?: 'none' | 'both' | 'horizontal' | 'vertical';
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      resize = 'vertical',
      className = '',
      ...props
    },
    ref
  ) => {
    const resizeStyle = {
      none: 'resize-none',
      both: 'resize',
      horizontal: 'resize-x',
      vertical: 'resize-y',
    }[resize];

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-white dark:text-gray-300 mb-2">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-4 py-2 border rounded-lg
            ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-slate-600 focus:border-purple-500 focus:ring-purple-500'}
            focus:outline-none focus:ring-2 focus:ring-offset-0
            text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800
            placeholder-gray-500 dark:placeholder-gray-400
            dark:[color-scheme:dark]
            disabled:bg-gray-100 dark:disabled:bg-slate-700 disabled:cursor-not-allowed
            transition-colors duration-200
            ${resizeStyle}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;

