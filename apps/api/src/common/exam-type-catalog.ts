import { BadRequestException } from '@nestjs/common';

/**
 * Katalog jenis ujian kustom yang dikelola Admin di Pengaturan → Jenis Ujian.
 *
 * Disimpan sebagai satu baris `acca_settings` (key `exam_type_catalog`). Jenis
 * bawaan (Ulangan Harian, ASAS/ASAT, AM, Try Out, Tugas, Lainnya) tetap
 * di-hardcode karena banyak alur bergantung pada kodenya; katalog ini hanya
 * menambah jenis baru beserta aturan kelulusannya, mis. SKD CPNS.
 *
 * Saat ujian dibuat, definisi jenisnya DISALIN ke `cbt_exams.metadata.exam_type_rule`
 * sehingga perubahan katalog di kemudian hari tidak menggeser status kelulusan
 * hasil yang sudah keluar.
 */
export const EXAM_TYPE_CATALOG_SETTING_KEY = 'exam_type_catalog';
export const EXAM_TYPE_RULE_METADATA_KEY = 'exam_type_rule';

/** Kode yang dipakai langsung oleh alur aplikasi; tidak boleh dipakai jenis kustom. */
export const BUILTIN_EXAM_TYPE_CODES = [
    'daily', 'pas', 'pat', 'am', 'pts', 'pkn', 'tryout', 'lainnya', 'assignment', 'quiz', 'asas_asat', 'all',
] as const;

export const EXAM_TYPE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const MAX_TYPES = 30;
const MAX_SUBTESTS = 10;
const MAX_ALIASES = 10;

export interface ExamSubtestRule {
    key: string;
    name: string;
    /** Materi kisi-kisi yang dipetakan ke subtes ini (tidak peka huruf besar/kecil). */
    materi: string[];
    passing_grade: number;
}

export type ExamPassRule =
    | { mode: 'none' }
    | { mode: 'kkm'; kkm: number }
    | { mode: 'passing_grade'; subtests: ExamSubtestRule[]; total_passing_grade: number | null };

/**
 * Cara nilai ditampilkan untuk jenis ini:
 *  - `scaled` : nilai 0–100 seperti biasa (proporsi skor diperoleh ÷ skor maksimum);
 *  - `raw`    : jumlah seluruh skor mentah yang diperoleh (mis. SKD: TWK/TIU 5 per
 *               soal benar, TKP 1–5 per soal). `total_score` 0–100 tetap tersimpan
 *               untuk analitik; skor mentah dihitung dari `cbt_answers.score`.
 */
export const EXAM_SCORE_MODES = ['scaled', 'raw'] as const;
export type ExamScoreMode = (typeof EXAM_SCORE_MODES)[number];

export interface ExamTypeDefinition {
    code: string;
    label: string;
    description: string;
    active: boolean;
    score_mode: ExamScoreMode;
    pass_rule: ExamPassRule;
}

export interface ExamTypeCatalog {
    types: ExamTypeDefinition[];
}

/** Salinan yang dibekukan pada metadata ujian. */
export interface ExamTypeRuleSnapshot {
    code: string;
    label: string;
    score_mode: ExamScoreMode;
    pass_rule: ExamPassRule;
}

export const DEFAULT_EXAM_TYPE_CATALOG: ExamTypeCatalog = {
    types: [{
        code: 'skd_cpns',
        label: 'SKD CPNS',
        description: 'Seleksi Kompetensi Dasar CPNS. Lulus bila setiap subtes mencapai passing grade.',
        active: true,
        score_mode: 'raw',
        pass_rule: {
            mode: 'passing_grade',
            subtests: [
                { key: 'twk', name: 'TWK (Tes Wawasan Kebangsaan)', materi: ['TWK'], passing_grade: 65 },
                { key: 'tiu', name: 'TIU (Tes Intelegensia Umum)', materi: ['TIU'], passing_grade: 80 },
                { key: 'tkp', name: 'TKP (Tes Karakteristik Pribadi)', materi: ['TKP'], passing_grade: 166 },
            ],
            total_passing_grade: null,
        },
    }],
};

export function isBuiltinExamType(code: string | null | undefined): boolean {
    return (BUILTIN_EXAM_TYPE_CODES as readonly string[]).includes((code || '').trim());
}

const fail = (message: string): never => { throw new BadRequestException(message); };

function text(value: unknown, field: string, max: number, required = true): string {
    if (value == null) value = '';
    if (typeof value !== 'string') fail(`${field} harus berupa teks.`);
    const trimmed = (value as string).trim().replace(/\s+/g, ' ');
    if (required && !trimmed) fail(`${field} wajib diisi.`);
    if (trimmed.length > max) fail(`${field} maksimal ${max} karakter.`);
    return trimmed;
}

function score(value: unknown, field: string, max: number): number {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number)) fail(`${field} harus berupa angka.`);
    if ((number as number) < 0 || (number as number) > max) fail(`${field} harus antara 0 dan ${max}.`);
    return Math.round((number as number) * 100) / 100;
}

function slug(value: string): string {
    return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** Kode dari nama: "Ujian TO" → "ujian_to", "2026" → "jenis_2026" (sama dengan form web). */
export function codeFromLabel(label: string): string {
    const code = slug(label);
    return /^[a-z][a-z0-9_]{1,39}$/.test(code) ? code : `jenis_${code}`.replace(/_+$/, '').slice(0, 40);
}

export function normalizeMateri(value: string | null | undefined): string {
    return (value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizePassRule(value: unknown, label: string, scoreMode: ExamScoreMode): ExamPassRule {
    const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const mode = raw.mode ?? 'none';
    if (mode === 'none') return { mode: 'none' };
    if (mode === 'kkm') return { mode: 'kkm', kkm: score(raw.kkm, `KKM ${label}`, scoreMode === 'raw' ? 1_000_000 : 100) };
    if (mode !== 'passing_grade') fail(`Aturan kelulusan ${label} tidak dikenal.`);

    if (!Array.isArray(raw.subtests) || raw.subtests.length === 0) fail(`${label}: tambahkan minimal satu subtes.`);
    const subtests = raw.subtests as unknown[];
    if (subtests.length > MAX_SUBTESTS) fail(`${label}: maksimal ${MAX_SUBTESTS} subtes.`);
    const keys = new Set<string>();
    const claimed = new Map<string, string>();
    const normalized = subtests.map((entry, index) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const name = text(row.name, `${label}: nama subtes ${index + 1}`, 80);
        const key = slug(typeof row.key === 'string' && row.key.trim() ? row.key : name) || `subtes_${index + 1}`;
        if (keys.has(key)) fail(`${label}: subtes "${name}" ganda.`);
        keys.add(key);
        const rawMateri = Array.isArray(row.materi) ? row.materi
            : typeof row.materi === 'string' ? row.materi.split(',') : [];
        const materi = [...new Set(rawMateri
            .map(item => text(item, `${label}: materi subtes ${name}`, 120, false))
            .filter(Boolean))];
        if (!materi.length) fail(`${label}: isi materi kisi-kisi untuk subtes "${name}".`);
        if (materi.length > MAX_ALIASES) fail(`${label}: maksimal ${MAX_ALIASES} materi per subtes.`);
        for (const item of materi) {
            const owner = claimed.get(normalizeMateri(item));
            if (owner) fail(`${label}: materi "${item}" dipakai oleh subtes "${owner}" dan "${name}".`);
            claimed.set(normalizeMateri(item), name);
        }
        return { key, name, materi, passing_grade: score(row.passing_grade, `${label}: passing grade ${name}`, 100_000) };
    });
    const total = raw.total_passing_grade;
    return {
        mode: 'passing_grade',
        subtests: normalized,
        total_passing_grade: total == null || total === '' ? null : score(total, `${label}: passing grade total`, 1_000_000),
    };
}

/** Validasi ketat untuk penyimpanan dari halaman Pengaturan. */
export function normalizeExamTypeCatalog(value: unknown): ExamTypeCatalog {
    const raw = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
    if (!Array.isArray(raw.types)) fail('Daftar jenis ujian tidak valid.');
    const list = raw.types as unknown[];
    if (list.length > MAX_TYPES) fail(`Maksimal ${MAX_TYPES} jenis ujian kustom.`);
    const codes = new Set<string>();
    const labels = new Set<string>();
    const types = list.map((entry, index) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const label = text(row.label, `Nama jenis ujian ${index + 1}`, 60);
        const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim().toLowerCase() : codeFromLabel(label);
        if (!EXAM_TYPE_CODE_PATTERN.test(code)) {
            fail(`Kode jenis ujian "${label}" hanya boleh huruf kecil, angka, dan garis bawah (2–40 karakter, diawali huruf).`);
        }
        if (isBuiltinExamType(code)) fail(`Kode "${code}" sudah dipakai jenis ujian bawaan.`);
        if (codes.has(code)) fail(`Kode jenis ujian "${code}" ganda.`);
        if (labels.has(label.toLowerCase())) fail(`Nama jenis ujian "${label}" ganda.`);
        codes.add(code); labels.add(label.toLowerCase());
        const scoreMode = row.score_mode ?? 'scaled';
        if (!(EXAM_SCORE_MODES as readonly unknown[]).includes(scoreMode)) fail(`Mode nilai ${label} tidak dikenal.`);
        return {
            code, label,
            description: text(row.description, `Deskripsi ${label}`, 300, false),
            active: row.active !== false,
            score_mode: scoreMode as ExamScoreMode,
            pass_rule: normalizePassRule(row.pass_rule, label, scoreMode as ExamScoreMode),
        };
    });
    return { types };
}

/**
 * Pembacaan longgar: baris yang belum pernah disimpan berarti katalog bawaan
 * (SKD CPNS); isi rusak tidak boleh menjatuhkan form pembuatan ujian.
 */
export function parseExamTypeCatalog(value: unknown): ExamTypeCatalog {
    if (value == null) return DEFAULT_EXAM_TYPE_CATALOG;
    try {
        return normalizeExamTypeCatalog(value);
    } catch {
        return { types: [] };
    }
}

export function examTypeRuleSnapshot(definition: ExamTypeDefinition): ExamTypeRuleSnapshot {
    return { code: definition.code, label: definition.label, score_mode: definition.score_mode, pass_rule: definition.pass_rule };
}

/** Aturan yang dibekukan pada ujian, atau null bila ujian tidak memakai jenis kustom. */
export function examTypeRule(exam: { exam_type?: string | null; metadata?: Record<string, unknown> | null } | null | undefined): ExamTypeRuleSnapshot | null {
    const stored = exam?.metadata?.[EXAM_TYPE_RULE_METADATA_KEY] as ExamTypeRuleSnapshot | undefined;
    if (!stored || typeof stored !== 'object' || !stored.pass_rule || typeof stored.code !== 'string') return null;
    if (exam?.exam_type && stored.code !== exam.exam_type) return null;
    return { ...stored, score_mode: stored.score_mode === 'raw' ? 'raw' : 'scaled' };
}
