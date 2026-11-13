export type ExamTypeCategory = 'daily' | 'am' | 'asas_asat' | 'tryout' | 'assignment' | 'lainnya';

const EXAM_TYPE_LABELS: Record<ExamTypeCategory, string> = {
    daily: 'Ulangan Harian',
    am: 'Asesmen Madrasah',
    asas_asat: 'ASAS/ASAT',
    tryout: 'Try Out',
    assignment: 'Tugas',
    lainnya: 'Lainnya',
};

/**
 * Nama jenis bawaan yang diubah Admin di Pengaturan → Jenis Ujian. Diisi dari
 * katalog oleh layout dashboard dan disimpan di localStorage supaya label
 * yang benar langsung tampil pada pemuatan berikutnya.
 */
const LABEL_STORAGE_KEY = 'acca:exam-type-labels';
/** Nama bawaan yang diubah, ditambah nama semua jenis tambahan (untuk label folder). */
let labelOverrides: Partial<Record<string, string>> = (() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.localStorage.getItem(LABEL_STORAGE_KEY) || '{}') || {}; } catch { return {}; }
})();

export function applyExamTypeLabels(types: Array<{ code: string; label: string; builtin?: boolean }>): void {
    const next: Partial<Record<string, string>> = {};
    for (const type of types) {
        if (!type.builtin) next[type.code] = type.label;
        else if (type.code in EXAM_TYPE_LABELS && type.label !== EXAM_TYPE_LABELS[type.code as ExamTypeCategory]) {
            next[type.code] = type.label;
        }
    }
    labelOverrides = next;
    try { window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(next)); } catch { /* mode privat */ }
}

/** Nama jenis bawaan saat ini (nama dari Admin bila sudah diubah). */
export function builtinExamTypeLabel(category: ExamTypeCategory): string {
    return labelOverrides[category] || EXAM_TYPE_LABELS[category];
}

export function examTypeCategory(type?: string | null): ExamTypeCategory {
    if (type === 'asas_asat' || type === 'am' || type === 'daily' || type === 'pas' || type === 'pat' || type === 'tryout' || type === 'assignment') {
        return type === 'pas' || type === 'pat' ? 'asas_asat' : type;
    }
    return 'lainnya';
}

/** Label jenis; jenis kustom (Pengaturan → Jenis Ujian) memakai nama yang tersimpan di metadata ujian. */
export function examTypeLabel(type?: string | null, metadata?: Record<string, unknown> | null): string {
    const rule = metadata?.exam_type_rule as { label?: unknown } | undefined;
    const custom = typeof rule?.label === 'string' ? rule.label
        : typeof metadata?.exam_type_label === 'string' ? metadata.exam_type_label : null;
    return custom || builtinExamTypeLabel(examTypeCategory(type));
}

export function matchesExamType(type: string | null | undefined, category: string): boolean {
    return category === 'all' || examTypeCategory(type) === examTypeCategory(category);
}

/**
 * ASAS, ASAT dan AM diperlakukan sama: dibuat sebagai folder, memakai ruang &
 * sesi, pengawas, administrasi, dan tampilan folder ringkas. ASAS dan ASAT
 * adalah satu pilihan ("ASAS/ASAT"); `pat` hanya nilai lama yang tetap didukung.
 */
export const SEMESTER_ASSESSMENT_TYPES = ['pas', 'pat', 'am'] as const;

export function isSemesterAssessmentType(type?: string | null): boolean {
    return (SEMESTER_ASSESSMENT_TYPES as readonly string[]).includes((type || '').trim().toLowerCase());
}

/**
 * Label folder/jenis asesmen untuk tampilan: AM, ASAS/ASAT, atau nama jenis
 * tambahan berpola folder (`catalogType`, mis. "PTS").
 */
export function semesterAssessmentLabel(type?: string | null, short = false, catalogType?: string | null): string {
    if (catalogType && labelOverrides[catalogType]) return labelOverrides[catalogType]!;
    const normalized = (type || '').trim().toLowerCase();
    if (normalized === 'am') return labelOverrides.am || (short ? 'AM' : 'Asesmen Madrasah');
    if (normalized === 'pas' || normalized === 'pat') return builtinExamTypeLabel('asas_asat');
    if (normalized === 'pts') return 'PTS / UTS';
    if (normalized === 'pkn') return 'Asesmen Lainnya';
    return normalized.toUpperCase() || 'ASAS/ASAT';
}

export function isFolderExamCategory(category?: string | null): category is 'asas_asat' | 'am' {
    return category === 'asas_asat' || category === 'am';
}
