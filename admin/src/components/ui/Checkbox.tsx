'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      error,
      helperText,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <div className="w-full">
        <label className="flex items-center cursor-pointer group">
          <div className="relative flex items-center">
            <input
              ref={ref}
              type="checkbox"
              className={`
                sr-only
                ${className}
              `}
              {...props}
            />
            <div
              className={`
                h-5 w-5 rounded border-2 transition-all duration-200
                flex items-center justify-center
                ${
                  props.checked
                    ? 'bg-blue-500 border-blue-500 dark:bg-blue-600 dark:border-blue-600'
                    : 'bg-white border-gray-300 dark:bg-slate-700 dark:border-slate-600 group-hover:border-blue-400 dark:group-hover:border-blue-500'
                }
                ${error ? 'border-blue-500 dark:border-blue-500' : ''}
                ${props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {props.checked && (
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          {label && (
            <div className="ml-3 flex-1">
              <span className={`text-sm font-medium ${props.disabled ? 'opacity-50' : ''} text-white dark:text-gray-200`}>
                {label}
              </span>
              {helperText && !error && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helperText}</p>
              )}
              {error && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">{error}</p>
              )}
            </div>
          )}
        </label>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;

