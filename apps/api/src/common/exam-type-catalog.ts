import { BadRequestException } from '@nestjs/common';

/**
 * Katalog jenis ujian yang dikelola Admin di Pengaturan → Jenis Ujian.
 *
 * Disimpan sebagai satu baris `acca_settings` (key `exam_type_catalog`).
 * Katalog memuat SEMUA jenis: jenis bawaan (Ulangan Harian, ASAS/ASAT, AM,
 * Try Out, Tugas, Lainnya) dan jenis tambahan (mis. SKD CPNS). Kode dan pola
 * jenis bawaan tetap karena banyak alur bergantung padanya; nama, deskripsi,
 * status tampil, siapa yang boleh membuat, cara penilaian, dan aturan
 * kelulusannya dapat diatur. Jenis bawaan tidak dapat dihapus.
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

/**
 * Pola = cara kerja jenis di aplikasi. Label tidak mengubah perilaku apa pun.
 *  - `regular`   : ujian biasa (satu bank soal, jadwal, peserta);
 *  - `folder`    : folder ujian dengan ruang, sesi, pengawas, dan administrasi;
 *  - `assignment`: tugas (instruksi, unggah berkas, bank soal opsional).
 * Jenis tambahan saat ini selalu `regular`.
 */
export const EXAM_TYPE_PATTERNS = ['regular', 'folder', 'assignment'] as const;
export type ExamTypePattern = (typeof EXAM_TYPE_PATTERNS)[number];

/** Siapa yang boleh membuat ujian jenis ini. Pola folder selalu `admin`. */
export const EXAM_TYPE_CREATORS = ['staff', 'admin'] as const;
export type ExamTypeCreators = (typeof EXAM_TYPE_CREATORS)[number];

export interface ExamTypeDefinition {
    code: string;
    label: string;
    description: string;
    active: boolean;
    score_mode: ExamScoreMode;
    pass_rule: ExamPassRule;
    pattern: ExamTypePattern;
    creators: ExamTypeCreators;
    /** Dihitung server; jenis bawaan tidak dapat dihapus dan kodenya tetap. */
    builtin: boolean;
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

type BuiltinSeed = Pick<ExamTypeDefinition, 'code' | 'label' | 'description' | 'pattern' | 'creators'>;

/** Jenis bawaan, urutan awalnya di katalog. `asas_asat` mewakili kode ujian `pas` dan `pat`. */
export const BUILTIN_EXAM_TYPES: readonly BuiltinSeed[] = [
    { code: 'daily', label: 'Ulangan Harian', description: 'Ujian biasa untuk satu atau beberapa kelas.', pattern: 'regular', creators: 'staff' },
    { code: 'asas_asat', label: 'ASAS/ASAT', description: 'Asesmen akhir semester/tahun dengan ruang, sesi, dan pengawas.', pattern: 'folder', creators: 'admin' },
    { code: 'am', label: 'Asesmen Madrasah', description: 'Asesmen akhir jenjang dengan ruang, sesi, dan pengawas.', pattern: 'folder', creators: 'admin' },
    { code: 'tryout', label: 'Try Out', description: 'Latihan ujian.', pattern: 'regular', creators: 'staff' },
    { code: 'assignment', label: 'Tugas', description: 'Tugas dengan instruksi, unggah berkas, dan bank soal opsional.', pattern: 'assignment', creators: 'staff' },
    { code: 'lainnya', label: 'Lainnya', description: 'Ujian biasa yang tidak masuk jenis lain.', pattern: 'regular', creators: 'staff' },
];
const BUILTIN_BY_CODE = new Map(BUILTIN_EXAM_TYPES.map(seed => [seed.code, seed]));

function builtinDefinition(seed: BuiltinSeed): ExamTypeDefinition {
    return { ...seed, active: true, score_mode: 'scaled', pass_rule: { mode: 'none' }, builtin: true };
}

/** Kode katalog untuk kode jenis yang tersimpan pada ujian/folder. */
export function catalogCodeForExamType(examType: string | null | undefined): string {
    const code = (examType || '').trim().toLowerCase();
    return code === 'pas' || code === 'pat' ? 'asas_asat' : code;
}

export function findExamTypeDefinition(catalog: ExamTypeCatalog, examType: string | null | undefined): ExamTypeDefinition | null {
    const code = catalogCodeForExamType(examType);
    return catalog.types.find(type => type.code === code) || null;
}

export const DEFAULT_EXAM_TYPE_CATALOG: ExamTypeCatalog = {
    types: [...BUILTIN_EXAM_TYPES.map(builtinDefinition), {
        code: 'skd_cpns',
        label: 'SKD CPNS',
        description: 'Seleksi Kompetensi Dasar CPNS. Lulus bila setiap subtes mencapai passing grade.',
        active: true,
        score_mode: 'raw',
        pattern: 'regular',
        creators: 'staff',
        builtin: false,
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
    if (list.length > MAX_TYPES + BUILTIN_EXAM_TYPES.length) fail(`Maksimal ${MAX_TYPES} jenis ujian tambahan.`);
    const codes = new Set<string>();
    const labels = new Set<string>();
    const types: ExamTypeDefinition[] = list.map((entry, index) => {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const label = text(row.label, `Nama jenis ujian ${index + 1}`, 60);
        const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim().toLowerCase() : codeFromLabel(label);
        if (!EXAM_TYPE_CODE_PATTERN.test(code)) {
            fail(`Kode jenis ujian "${label}" hanya boleh huruf kecil, angka, dan garis bawah (2–40 karakter, diawali huruf).`);
        }
        const seed = BUILTIN_BY_CODE.get(code);
        if (!seed && isBuiltinExamType(code)) fail(`Kode "${code}" sudah dipakai jenis ujian bawaan.`);
        if (codes.has(code)) fail(`Kode jenis ujian "${code}" ganda.`);
        if (labels.has(label.toLowerCase())) fail(`Nama jenis ujian "${label}" ganda.`);
        codes.add(code); labels.add(label.toLowerCase());
        const scoreMode = row.score_mode ?? 'scaled';
        if (!(EXAM_SCORE_MODES as readonly unknown[]).includes(scoreMode)) fail(`Mode nilai ${label} tidak dikenal.`);
        if (!seed && row.pattern !== undefined && row.pattern !== 'regular') {
            fail(`${label}: jenis tambahan saat ini hanya dapat berpola ujian biasa.`);
        }
        const pattern: ExamTypePattern = seed ? seed.pattern : 'regular';
        const creators = row.creators ?? (seed ? seed.creators : 'staff');
        if (!(EXAM_TYPE_CREATORS as readonly unknown[]).includes(creators)) fail(`${label}: pilihan pembuat ujian tidak dikenal.`);
        return {
            code, label,
            description: text(row.description, `Deskripsi ${label}`, 300, false),
            active: row.active !== false,
            score_mode: scoreMode as ExamScoreMode,
            pass_rule: normalizePassRule(row.pass_rule, label, scoreMode as ExamScoreMode),
            pattern,
            // Folder ujian memakai ruang, sesi, dan pengawas sekolah: selalu Admin.
            creators: pattern === 'folder' ? 'admin' : creators as ExamTypeCreators,
            builtin: Boolean(seed),
        };
    });
    if (types.filter(type => !type.builtin).length > MAX_TYPES) fail(`Maksimal ${MAX_TYPES} jenis ujian tambahan.`);
    // Jenis bawaan tidak dapat dihapus: yang tidak terkirim (mis. katalog lama) diisi bawaannya di depan.
    const missing = BUILTIN_EXAM_TYPES.filter(seed => !codes.has(seed.code)).map(seed => {
        if (labels.has(seed.label.toLowerCase())) fail(`Nama jenis ujian "${seed.label}" sudah dipakai jenis bawaan.`);
        return builtinDefinition(seed);
    });
    return { types: [...missing, ...types] };
}

/**
 * Pembacaan longgar: baris yang belum pernah disimpan berarti katalog bawaan
 * (jenis bawaan + SKD CPNS); isi rusak tidak boleh menjatuhkan form pembuatan
 * ujian, jadi jatuh ke jenis bawaan saja.
 */
export function parseExamTypeCatalog(value: unknown): ExamTypeCatalog {
    if (value == null) return DEFAULT_EXAM_TYPE_CATALOG;
    try {
        return normalizeExamTypeCatalog(value);
    } catch {
        return { types: BUILTIN_EXAM_TYPES.map(builtinDefinition) };
    }
}

/**
 * Aturan yang dibekukan pada ujian ber-jenis bawaan, dengan kode = kode ujian
 * sebenarnya (`pas`/`pat`/`am`/…). `null` bila jenis itu masih berperilaku
 * bawaan (nama asli, skala 0–100, tanpa status kelulusan), supaya ujiannya
 * tetap persis seperti sebelum jenis bawaan dapat diatur.
 */
export function builtinExamTypeRule(catalog: ExamTypeCatalog, examType: string): ExamTypeRuleSnapshot | null {
    const definition = findExamTypeDefinition(catalog, examType);
    const seed = definition && BUILTIN_BY_CODE.get(definition.code);
    if (!definition || !seed) return null;
    if (definition.score_mode === 'scaled' && definition.pass_rule.mode === 'none' && definition.label === seed.label) return null;
    return { ...examTypeRuleSnapshot(definition), code: examType };
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
