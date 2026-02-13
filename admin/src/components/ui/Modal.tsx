'use client';

import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button, { ButtonProps } from './Button';

export interface ModalAction extends ButtonProps {
  onClick?: (e: any) => void;
  type?: "button" | "submit" | "reset";
  href?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  footer?: ReactNode;
  actions?: ModalAction[];
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-full mx-4',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  actions = [],
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!isOpen || !portalTarget) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[2147483000] overflow-y-auto isolate">
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex min-h-full items-start sm:items-center justify-center p-4 sm:py-8">
        <div
          className={`relative bg-white dark:bg-slate-800 rounded-lg shadow-xl ${sizeStyles[size]} w-full flex flex-col`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
              {title && (
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-4 text-gray-900 dark:text-gray-100">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end space-x-3">
              {footer}
            </div>
          )}

          {/* Actions */}
          {
            !footer && actions.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-end space-x-3">
                {actions.map((action, index) => (
                  <Button
                    key={'modal-butto-' + index}
                    {...action}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )
          }

        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalTarget);
}

// Alert Modal Component
export interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: 'info' | 'success' | 'warning' | 'error';
  confirmText?: string;
  onConfirm?: () => void;
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  variant = 'info',
  confirmText = 'OK',
  onConfirm,
}: AlertModalProps) {
  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="py-4">
        <p className="text-white dark:text-gray-300">{message}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleConfirm} variant={variant === 'error' ? 'danger' : 'primary'}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

// Confirmation Modal Component
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
}

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="py-4">
        <p className="text-white dark:text-gray-300">{message}</p>
      </div>
      <div className="flex justify-end space-x-3">
        <Button onClick={onClose} variant="outline">
          {cancelText}
        </Button>
        <Button onClick={handleConfirm} variant={variant === 'danger' ? 'danger' : 'primary'}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}

