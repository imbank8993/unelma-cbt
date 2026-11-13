"use client";

import { useEffect, useState } from 'react';
import { getMyCreationLimits, type CreationLimits } from '@/lib/api/commissions';

/**
 * Akses membuat ujian/bahan ajar dan sisa kuota gratis (Komisi → Proktor).
 * `null` selama memuat atau bila gagal dimuat: pemanggil menampilkan perilaku
 * biasa, karena API tetap menolak pembuatan yang tidak diizinkan.
 */
export function useCreationLimits(enabled = true): { limits: CreationLimits | null; reload: () => void } {
    const [limits, setLimits] = useState<CreationLimits | null>(null);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        void getMyCreationLimits().then(result => {
            if (active && result.success) {
                const { unlimited, canCreateExams, canCreateMaterials, freeExam, freeMaterial } = result;
                setLimits({ unlimited, canCreateExams, canCreateMaterials, freeExam, freeMaterial });
            }
        });
        return () => { active = false; };
    }, [enabled, version]);
    return { limits, reload: () => setVersion(value => value + 1) };
}

/** Kuota gratis habis: konten baru wajib berbayar. */
export const freeQuotaExhausted = (quota: CreationLimits['freeExam'] | undefined): boolean =>
    Boolean(quota && quota.remaining !== null && quota.remaining <= 0);
