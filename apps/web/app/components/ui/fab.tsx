'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { registerPageFab, unregisterPageFab } from '@/app/components/mobile/page-fab';
import './fab.css';

/**
 * Tombol aksi utama halaman (mis. "Tambah Paket Token").
 * Desktop: tombol bulat melayang di kanan bawah. HP: didaftarkan ke FAB tengah
 * BottomNav, jadi satu komponen ini cukup untuk keduanya.
 */
export function FloatingActionButton({ label, icon, mobileIcon = 'plus', onClick }: {
    label: string;
    icon: ReactNode;
    /** Nama ikon Bootstrap untuk FAB BottomNav di HP. */
    mobileIcon?: string;
    onClick: () => void;
}) {
    const handler = useRef(onClick);
    useEffect(() => { handler.current = onClick; }, [onClick]);

    useEffect(() => {
        const token = {};
        registerPageFab(token, { label, icon: mobileIcon, run: () => handler.current() });
        return () => unregisterPageFab(token);
    }, [label, mobileIcon]);

    return (
        <button type="button" className="ui-fab" onClick={onClick} aria-label={label} title={label}>
            <span className="ui-fab-icon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
        </button>
    );
}
