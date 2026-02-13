'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, AnchorHTMLAttributes } from 'react';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    children?: ReactNode;
    external?: boolean;
    label?: string;
    href: string;
    color?: string;
}

export default function LinkComponent({ children, href, label, external, color, ...props }: LinkProps) {
    return (
        <Link
            href={href}
            className={`${color?`text-${color}`:"text-purple-600 dark:text-purple-400"} hover:underline flex items-center space-x-1 cursor-pointer`}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            {...props}
        >
            {label ? <span>{label}</span> : children}
            {external && (<ExternalLink className="h-3 w-3" />)}
        </Link>
    );
}

export const Href = LinkComponent;
