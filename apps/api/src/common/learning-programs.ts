import { BadRequestException } from '@nestjs/common';

/**
 * Daftar program belajar (Pengaturan → Pengaturan Daftar).
 *
 * Satu daftar dipakai bersama oleh:
 *  - filter program di Ruang Belajar dan Jadwal siswa,
 *  - label bahan ajar (`cbt_learning_materials.grade_level`: kelas 1–12 untuk
 *    "sekolah", '' untuk "umum", selain itu kode program),
 *  - label ujian (`cbt_exams.metadata.program`),
 *  - tujuan belajar siswa (`cbt_learning_goals.programs`).
 *
 * Disimpan sebagai satu baris `acca_settings` (key `learning_program_catalog`).
 * Belum pernah disimpan = daftar bawaan di bawah. Kode bersifat tetap setelah
 * dibuat karena tersimpan di data bahan ajar, ujian, dan tujuan siswa.
 */
export const LEARNING_PROGRAM_CATALOG_SETTING_KEY = 'learning_program_catalog';

/** Program bawaan; tetap diterima walau belum ada katalog tersimpan. */
export const LEARNING_PROGRAMS = ['sekolah', 'snpdb', 'utbk', 'cpns', 'pppk', 'kedinasan', 'bahasa', 'umum'] as const;
export type LearningProgramCode = string;

/** Kode program: huruf kecil/angka/garis bawah, diawali huruf (tidak bentrok dengan kelas 1–12). */
export const LEARNING_PROGRAM_CODE_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
/** Tingkatan bahan ajar: '' (umum), kelas 1–12, atau kode program. */
export const LEARNING_GRADE_LEVEL_PATTERN = /^(?:|[1-9]|1[0-2]|[a-z][a-z0-9_]{1,31})$/;
/** Dua program struktural: "sekolah" memakai kelas 1–12, "umum" memakai tingkatan kosong. */
export const STRUCTURAL_LEARNING_PROGRAMS = ['sekolah', 'umum'] as const;
export const MAX_LEARNING_PROGRAMS = 40;
/** Batas label program pada satu ujian (`metadata.programs`). */
export const MAX_EXAM_PROGRAMS = 10;

/**
 * Label program ujian. Ujian baru menyimpan `metadata.programs` (bisa lebih dari
 * satu) dan `metadata.program` = label pertama untuk pembaca lama. Kosong = "umum".
 */
export function examProgramsFromDto(dto: { program?: string; programs?: string[] }, existing: { program?: unknown; programs?: unknown }): string[] | null {
    const valid = (list: unknown[]) => [...new Set(list.filter((item): item is string => typeof item === 'string' && LEARNING_PROGRAM_CODE_PATTERN.test(item)))].slice(0, MAX_EXAM_PROGRAMS);
    if (dto.programs) return valid(dto.programs);
    if (dto.program) return valid([dto.program]);
    if (Array.isArray(existing.programs)) return valid(existing.programs);
    if (typeof existing.program === 'string') return valid([existing.program]);
    return null;
}

/** Bidang metadata dari daftar label: `{ program, programs }`, atau kosong bila belum pernah diberi label. */
export function examProgramMetadata(programs: string[] | null): { program?: string; programs?: string[] } {
    if (!programs) return {};
    const list = programs.length ? programs : ['umum'];
    return { program: list[0], programs: list };
}

export const LEARNING_PROGRAM_ICONS = [
    'graduation', 'school', 'target', 'landmark', 'briefcase', 'shield', 'languages', 'sparkles',
    'book', 'globe', 'award', 'calculator', 'flask', 'heart', 'laptop', 'music',
] as const;

export interface LearningProgramDefinition {
    code: string;
    label: string;
    hint: string;
    icon: string;
    hue: number;
    active: boolean;
}
export interface LearningProgramCatalog {
    programs: LearningProgramDefinition[];
}

export const DEFAULT_LEARNING_PROGRAM_CATALOG: LearningProgramCatalog = {
    programs: [
        { code: 'sekolah', label: 'Sekolah', hint: 'SD · SMP · SMA/SMK', icon: 'graduation', hue: 217, active: true },
        { code: 'snpdb', label: 'SNPDB/SPMB', hint: 'Seleksi masuk SMP/SMA · Tes Kemampuan Akademik', icon: 'school', hue: 175, active: true },
        { code: 'utbk', label: 'UTBK-SNBT', hint: 'TPS · Literasi · Penalaran Matematika', icon: 'target', hue: 262, active: true },
        { code: 'cpns', label: 'CPNS', hint: 'SKD: TWK · TIU · TKP, dan SKB', icon: 'landmark', hue: 160, active: true },
        { code: 'pppk', label: 'PPPK', hint: 'Teknis · Manajerial · Sosio-kultural · Wawancara', icon: 'briefcase', hue: 24, active: true },
        { code: 'kedinasan', label: 'Kedinasan', hint: 'PKN STAN · IPDN · STIS · Poltekip', icon: 'shield', hue: 200, active: true },
        { code: 'bahasa', label: 'Bahasa & TOEFL', hint: 'TOEFL · IELTS · Bahasa asing', icon: 'languages', hue: 330, active: true },
        { code: 'umum', label: 'Umum & Skill', hint: 'Literasi · Keterampilan · Pengembangan diri', icon: 'sparkles', hue: 45, active: true },
    ],
};

const fail = (message: string): never => { throw new BadRequestException(message); };
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/**
 * Validasi daftar dari Admin. Program "sekolah" dan "umum" selalu ada (boleh
 * diganti nama/disembunyikan, tidak boleh dihapus) karena tingkatan kelas dan
 * bahan ajar tanpa tingkatan bergantung padanya.
 */
export function normalizeLearningProgramCatalog(value: unknown): LearningProgramCatalog {
    const raw = (value && typeof value === 'object' ? (value as { programs?: unknown }).programs : null);
    if (!Array.isArray(raw)) fail('Daftar program tidak valid.');
    const list = raw as unknown[];
    if (list.length > MAX_LEARNING_PROGRAMS) fail(`Maksimal ${MAX_LEARNING_PROGRAMS} program.`);
    const seen = new Set<string>();
    const programs: LearningProgramDefinition[] = [];
    for (const item of list) {
        const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const code = text(row.code, 32).toLowerCase();
        const label = text(row.label, 40);
        if (!LEARNING_PROGRAM_CODE_PATTERN.test(code)) fail(`Kode program "${code || '(kosong)'}" tidak valid. Gunakan huruf kecil, angka, atau garis bawah (2–32 karakter, diawali huruf).`);
        if (seen.has(code)) fail(`Kode program "${code}" dipakai lebih dari sekali.`);
        if (!label) fail(`Nama program "${code}" wajib diisi.`);
        seen.add(code);
        const hue = Number(row.hue);
        programs.push({
            code, label,
            hint: text(row.hint, 120),
            icon: (LEARNING_PROGRAM_ICONS as readonly string[]).includes(String(row.icon)) ? String(row.icon) : 'sparkles',
            hue: Number.isFinite(hue) ? Math.min(359, Math.max(0, Math.round(hue))) : 220,
            active: row.active !== false,
        });
    }
    for (const code of STRUCTURAL_LEARNING_PROGRAMS) {
        if (!seen.has(code)) programs.push({ ...DEFAULT_LEARNING_PROGRAM_CATALOG.programs.find(item => item.code === code)! });
    }
    return { programs };
}

export function parseLearningProgramCatalog(value: unknown): LearningProgramCatalog {
    if (value == null) return DEFAULT_LEARNING_PROGRAM_CATALOG;
    try { return normalizeLearningProgramCatalog(value); } catch { return DEFAULT_LEARNING_PROGRAM_CATALOG; }
}
