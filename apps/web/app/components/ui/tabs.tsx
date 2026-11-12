'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import './tabs.css';

export interface TabItem<T extends string = string> {
    key: T;
    label: string;
    shortLabel?: string;
    /** Tab rute: tautan biasa. Kosongkan bila memakai `onSelect` (tab dalam halaman). */
    href?: string;
    icon?: ReactNode;
    badge?: ReactNode;
    disabled?: boolean;
}

interface TabsProps<T extends string> {
    tabs: TabItem<T>[];
    activeTab: T;
    ariaLabel: string;
    className?: string;
    /** Tab dalam halaman: dipanggil saat tab dipilih (tanpa berpindah rute). */
    onSelect?: (key: T) => void;
}

/**
 * Satu komponen tab untuk seluruh aplikasi.
 * - Tab rute (`href`): tautan biasa dengan aria-current, riwayat browser tetap jalan.
 * - Tab dalam halaman (`onSelect`): tombol, untuk memecah satu halaman menjadi beberapa bagian.
 */
export function Tabs<T extends string>({ tabs, activeTab, ariaLabel, className = '', onSelect }: TabsProps<T>) {
    return (
        <nav aria-label={ariaLabel} className={`ui-tabs ${className}`}>
            <div className="ui-tabs-list">
                {tabs.map(tab => {
                    const active = tab.key === activeTab;
                    const className = `ui-tabs-item${active ? ' is-active' : ''}`;
                    const content = <>
                        {tab.icon && <span className="ui-tabs-icon" aria-hidden="true">{tab.icon}</span>}
                        <span className="ui-tabs-label">{tab.label}</span>
                        {tab.shortLabel && <span className="ui-tabs-short-label" aria-hidden="true">{tab.shortLabel}</span>}
                        {tab.badge !== undefined && <span className="ui-tabs-badge">{tab.badge}</span>}
                    </>;

                    if (tab.disabled) return <span key={tab.key} className={className} aria-disabled="true">{content}</span>;
                    if (onSelect || !tab.href) return (
                        <button key={tab.key} type="button" className={className} aria-current={active ? 'page' : undefined}
                            aria-label={tab.label} onClick={() => onSelect?.(tab.key)}>
                            {content}
                        </button>
                    );
                    return (
                        <Link key={tab.key} href={tab.href} className={className}
                            aria-current={active ? 'page' : undefined} aria-label={tab.label}>
                            {content}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
