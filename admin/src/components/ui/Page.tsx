'use client';

import { ReactNode, HTMLAttributes, useEffect, useRef, useState } from 'react';
import Button, { ButtonProps } from './Button';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';

export interface ActionButtonsProps extends ButtonProps {
    label: string;
    href?: string;
}

export interface BackButtonProps {
    label: string;
    href: string;
}

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    title: string;
    description?: ReactNode | string;
    actions?: ActionButtonsProps[];
    backButton?: BackButtonProps;
}

export default function Page({
    children,
    title,
    description,
    actions = [],
    backButton,
    ...props
}: PageProps) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const visibleActions = actions.slice(0, 3);
    const hiddenActions = actions.slice(3);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="space-y-6" {...props}>
            {/* page header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className='space-y-1'>
                    {
                        (backButton && backButton.label) && (
                            <Button
                                href={backButton.href}
                                icon={ArrowLeft}
                                variant='ghost'
                                size='xs'
                            >
                                {backButton.label}
                            </Button>
                        )
                    }
                    {title && (
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                            {title}
                        </h1>
                    )}
                    {description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {description}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 flex-wrap">
                    {/* visible actions */}
                    {visibleActions.map((action, index) => (
                        <Button
                            {...action}
                            key={"visible-button" + index}
                            {...action}
                            size="md"
                            variant="outline"
                        >
                            {action.label}
                        </Button>
                    ))}

                    {/* more actions dropdown */}
                    {hiddenActions.length > 0 && (
                        <div className="relative" ref={menuRef}>
                            <Button
                                variant="outline"
                                size='md'
                                icon={MoreHorizontal}
                                iconOnly
                                ariaLabel="More actions"
                                onClick={() => setOpen(!open)}
                            />
                            <div>
                                {open && (
                                    <div className="absolute right-0 mt-2 min-w-[200px] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 p-2">
                                        {hiddenActions.map((action, idx) => (
                                            <button
                                                {...action}
                                                key={"absolute-button" + idx}
                                                onClick={(e) => {
                                                    action.onClick?.(e);
                                                    setOpen(false);
                                                }}
                                                disabled={action.disabled || action.loading}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50"
                                            >
                                                {action.icon && <action.icon className="h-4 w-4" />}
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* page body content */}
            <div className="relative">{children}</div>
        </div>
    );
}
