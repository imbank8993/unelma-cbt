/**
 * Jenis ujian kustom (Pengaturan → Jenis Ujian). Bentuknya sama dengan
 * `apps/api/src/common/exam-type-catalog.ts`; validasi akhir ada di API.
 */
export type ExamScoreMode = 'scaled' | 'raw';

export interface ExamSubtestRule {
    key: string;
    name: string;
    materi: string[];
    passing_grade: number;
}

export type ExamPassRule =
    | { mode: 'none' }
    | { mode: 'kkm'; kkm: number }
    | { mode: 'passing_grade'; subtests: ExamSubtestRule[]; total_passing_grade: number | null };

/** Cara kerja jenis di aplikasi. Jenis bawaan berpola tetap; jenis tambahan selalu `regular`. */
export type ExamTypePattern = 'regular' | 'folder' | 'assignment';
/** `staff` = Admin, Guru, dan Proktor; `admin` = hanya Admin. Folder selalu `admin`. */
export type ExamTypeCreators = 'staff' | 'admin';

export interface ExamTypeDefinition {
    code: string;
    label: string;
    description: string;
    active: boolean;
    score_mode: ExamScoreMode;
    pass_rule: ExamPassRule;
    pattern: ExamTypePattern;
    creators: ExamTypeCreators;
    /** Jenis bawaan: kode dan pola tetap, tidak dapat dihapus. */
    builtin: boolean;
}

export const EXAM_TYPE_PATTERN_LABELS: Record<ExamTypePattern, string> = {
    regular: 'Ujian biasa',
    folder: 'Folder ujian (ruang, sesi, pengawas)',
    assignment: 'Tugas',
};

export interface ExamTypeCatalog {
    types: ExamTypeDefinition[];
}

export const EXAM_TYPE_CATALOG_SETTING_KEY = 'exam_type_catalog';

export const SCORE_MODE_LABELS: Record<ExamScoreMode, string> = {
    scaled: 'Skala 0–100',
    raw: 'Jumlah skor mentah',
};

export type ExamPassState = 'passed' | 'failed' | 'pending' | 'unmapped' | 'none';

export interface ExamSubtestResult {
    key: string;
    name: string;
    score: number;
    max_score: number;
    passing_grade: number;
    passed: boolean;
    question_count: number;
}

/** `pass_result` pada hasil siswa dan baris monitoring. */
export interface ExamPassResult {
    type_code: string;
    type_label: string;
    score_mode: ExamScoreMode;
    mode: 'none' | 'kkm' | 'passing_grade';
    status: ExamPassState;
    score: number | null;
    max_score: number | null;
    raw_score: number;
    raw_max_score: number;
    kkm?: number;
    total_passing_grade?: number | null;
    subtests?: ExamSubtestResult[];
    unmapped_question_count?: number;
}

export const PASS_STATE_LABELS: Record<ExamPassState, string> = {
    passed: 'Lulus',
    failed: 'Tidak Lulus',
    pending: 'Menunggu Penilaian',
    unmapped: 'Subtes Belum Dipetakan',
    none: '',
};

export function formatScore(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/** Kode baru dari nama: "Ujian TO" → "ujian_to". */
export function examTypeCodeFromLabel(label: string): string {
    const code = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return /^[a-z][a-z0-9_]{1,39}$/.test(code) ? code : `jenis_${code}`.replace(/_+$/, '').slice(0, 40);
}

/** Label jenis kustom yang dibekukan pada metadata ujian, bila ada. */
export function customExamTypeLabel(exam?: { exam_type?: string | null; metadata?: Record<string, unknown> | null } | null): string | null {
    const rule = exam?.metadata?.exam_type_rule as { code?: string; label?: string } | undefined;
    if (!rule?.label || (exam?.exam_type && rule.code !== exam.exam_type)) return null;
    return rule.label;
}
