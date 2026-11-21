import { useSyncExternalStore } from 'react';
import type { LearningMaterial } from './learning-api';
import { getSettings } from './api/settings';

/**
 * Program belajar (daftar/label): Sekolah, SNPDB, UTBK, CPNS, PPPK, dan program
 * tambahan dari Admin di Pengaturan → Pengaturan Daftar.
 *
 * Daftar yang sama menjadi:
 *  - filter program di Ruang Belajar dan Jadwal siswa,
 *  - label bahan ajar (`grade_level`: kelas 1–12 = "sekolah", '' = "umum",
 *    selain itu kode program),
 *  - label ujian (`metadata.program`),
 *  - pilihan tujuan belajar siswa.
 *
 * Daftar dimuat sekali oleh layout dashboard (`loadLearningProgramCatalog`) dan
 * disalin ke localStorage agar daftar yang benar langsung tampil pada pemuatan
 * berikutnya. Komponen yang menampilkannya memanggil `useLearningPrograms()`
 * supaya ikut diperbarui begitu daftar tersimpan dimuat.
 */
export type LearningProgram = string;
export const LEARNING_PROGRAM_CATALOG_SETTING_KEY = 'learning_program_catalog';
export const LEARNING_PROGRAM_CODE_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
/** "sekolah" (kelas 1–12) dan "umum" (tanpa tingkatan) tidak dapat dihapus. */
export const STRUCTURAL_LEARNING_PROGRAMS = ['sekolah', 'umum'];

export const LEARNING_PROGRAM_ICON_KEYS = [
    'graduation', 'school', 'target', 'landmark', 'briefcase', 'shield', 'languages', 'sparkles',
    'book', 'globe', 'award', 'calculator', 'flask', 'heart', 'laptop', 'music',
] as const;
export type LearningProgramIcon = (typeof LEARNING_PROGRAM_ICON_KEYS)[number];

export interface LearningProgramItem {
    value: LearningProgram;
    label: string;
    hint: string;
    icon: LearningProgramIcon;
    hue: number;
    active: boolean;
}
/** Bentuk yang disimpan di acca_settings. */
export interface LearningProgramDefinition {
    code: string; label: string; hint: string; icon: string; hue: number; active: boolean;
}

export const DEFAULT_LEARNING_PROGRAMS: LearningProgramItem[] = [
    { value: 'sekolah', label: 'Sekolah', hint: 'SD · SMP · SMA/SMK', icon: 'graduation', hue: 217, active: true },
    { value: 'snpdb', label: 'SNPDB/SPMB', hint: 'Seleksi masuk SMP/SMA · Tes Kemampuan Akademik', icon: 'school', hue: 175, active: true },
    { value: 'utbk', label: 'UTBK-SNBT', hint: 'TPS · Literasi · Penalaran Matematika', icon: 'target', hue: 262, active: true },
    { value: 'cpns', label: 'CPNS', hint: 'SKD: TWK · TIU · TKP, dan SKB', icon: 'landmark', hue: 160, active: true },
    { value: 'pppk', label: 'PPPK', hint: 'Teknis · Manajerial · Sosio-kultural · Wawancara', icon: 'briefcase', hue: 24, active: true },
    { value: 'kedinasan', label: 'Kedinasan', hint: 'PKN STAN · IPDN · STIS · Poltekip', icon: 'shield', hue: 200, active: true },
    { value: 'bahasa', label: 'Bahasa & TOEFL', hint: 'TOEFL · IELTS · Bahasa asing', icon: 'languages', hue: 330, active: true },
    { value: 'umum', label: 'Umum & Skill', hint: 'Literasi · Keterampilan · Pengembangan diri', icon: 'sparkles', hue: 45, active: true },
];

/** Semua program, termasuk yang disembunyikan (label data lama tetap terbaca). */
export const allLearningPrograms: LearningProgramItem[] = [];
/** Program yang ditampilkan: pilihan filter, label saat membuat bahan ajar/ujian, dan tujuan siswa. */
export const learningPrograms: LearningProgramItem[] = [];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Jenjang sekolah. Program "sekolah" tidak ditampilkan sebagai satu kategori;
 * materinya dikelompokkan per jenjang dari kelas yang tersimpan di `grade_level`
 * (1–6 SD, 7–9 SMP, 10–12 SMA), jadi data lama tidak perlu dimigrasi.
 * Kode memakai tanda hubung agar tidak bentrok dengan kode program dari Admin.
 */
export interface SchoolStage { value: string; label: string; hint: string; from: number; to: number }
export const SCHOOL_STAGES: SchoolStage[] = [
    { value: 'jenjang-sd', label: 'SD', hint: 'Kelas I–VI', from: 1, to: 6 },
    { value: 'jenjang-smp', label: 'SMP', hint: 'Kelas VII–IX', from: 7, to: 9 },
    { value: 'jenjang-sma', label: 'SMA', hint: 'Kelas X–XII · SMA/SMK/MA', from: 10, to: 12 },
];
const stageOfGrade = (grade: number) => SCHOOL_STAGES.find(stage => grade >= stage.from && grade <= stage.to);
const SCHOOL_GRADES = Array.from({ length: 12 }, (_, index) => index + 1)
    .map(grade => ({ value: String(grade), label: `Kelas ${ROMAN[grade - 1]}`, program: 'sekolah', stage: stageOfGrade(grade)!.label }));

export interface LearningGrade { value: string; label: string; program: LearningProgram; stage?: string }
/** Tingkatan yang tersimpan di `grade_level` untuk program yang ditampilkan. */
export const learningGrades: LearningGrade[] = [];
/** Pilihan label program/tingkatan di formulir bahan ajar, misalnya "SMA · Kelas X" atau "CPNS". */
export const learningGradeOptions: { value: string; label: string }[] = [];
let allGrades: LearningGrade[] = [];

function gradesOf(programs: LearningProgramItem[]): LearningGrade[] {
    return programs.flatMap(item => item.value === 'sekolah' ? SCHOOL_GRADES
        : [{ value: item.value === 'umum' ? '' : item.value, label: item.value === 'umum' ? 'Umum' : item.label, program: item.value }]);
}

const isIcon = (value: unknown): value is LearningProgramIcon => (LEARNING_PROGRAM_ICON_KEYS as readonly string[]).includes(String(value));

/** Rapikan daftar tersimpan; null bila tidak valid. Program struktural selalu ada. */
export function normalizeLearningProgramCatalog(raw: unknown): LearningProgramItem[] | null {
    const list = raw && typeof raw === 'object' ? (raw as { programs?: unknown }).programs : null;
    if (!Array.isArray(list)) return null;
    const seen = new Set<string>();
    const items: LearningProgramItem[] = [];
    for (const entry of list) {
        const row = (entry && typeof entry === 'object' ? entry : {}) as Partial<LearningProgramDefinition>;
        const code = String(row.code || '');
        if (!LEARNING_PROGRAM_CODE_PATTERN.test(code) || seen.has(code) || !String(row.label || '').trim()) continue;
        seen.add(code);
        const hue = Number(row.hue);
        items.push({
            value: code, label: String(row.label).trim(), hint: String(row.hint || ''),
            icon: isIcon(row.icon) ? row.icon : 'sparkles', hue: Number.isFinite(hue) ? hue : 220, active: row.active !== false,
        });
    }
    for (const code of STRUCTURAL_LEARNING_PROGRAMS) {
        if (!seen.has(code)) items.push({ ...DEFAULT_LEARNING_PROGRAMS.find(item => item.value === code)! });
    }
    return items;
}

export function toLearningProgramCatalog(items: LearningProgramItem[]): { programs: LearningProgramDefinition[] } {
    return { programs: items.map(item => ({ code: item.value, label: item.label, hint: item.hint, icon: item.icon, hue: item.hue, active: item.active })) };
}

const STORAGE_KEY = 'acca:learning-program-catalog';
/** Salinan baru setiap kali daftar berubah, agar useMemo/useEffect di komponen ikut menghitung ulang. */
let snapshot: LearningProgramItem[] = [];
let serverSnapshot: LearningProgramItem[] | null = null;
const listeners = new Set<() => void>();

function replace<T>(target: T[], next: T[]) { target.splice(0, target.length, ...next); }

/** Terapkan daftar ke seluruh aplikasi (dipanggil layout dashboard dan halaman Pengaturan Daftar). */
export function applyLearningProgramCatalog(items: LearningProgramItem[], options: { persist?: boolean } = {}) {
    replace(allLearningPrograms, items);
    replace(learningPrograms, items.filter(item => item.active));
    allGrades = gradesOf(items);
    replace(learningGrades, gradesOf(learningPrograms));
    replace(learningGradeOptions, learningGrades.map(item => ({ value: item.value, label: item.stage ? `${item.stage} · ${item.label}` : item.label })));
    if (options.persist !== false && typeof window !== 'undefined') {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toLearningProgramCatalog(items))); } catch { /* mode privat */ }
    }
    snapshot = [...learningPrograms];
    serverSnapshot ??= snapshot;
    listeners.forEach(listener => listener());
}

applyLearningProgramCatalog(DEFAULT_LEARNING_PROGRAMS, { persist: false });

let loading: Promise<void> | null = null;
/**
 * Muat daftar dari server sekali per muat halaman (atau paksa dengan `refresh`).
 * Salinan perangkat diterapkan lebih dulu, setelah hidrasi, agar tidak menunggu jaringan.
 */
export function loadLearningProgramCatalog(options: { refresh?: boolean } = {}): Promise<void> {
    if (!loading || options.refresh) {
        if (!loading && typeof window !== 'undefined') {
            try {
                const cached = normalizeLearningProgramCatalog(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'));
                if (cached) applyLearningProgramCatalog(cached, { persist: false });
            } catch { /* salinan rusak: pakai bawaan */ }
        }
        loading = getSettings(options.refresh ? { refresh: true } : {}).then(result => {
            if (!result.success) { loading = null; return; }
            const row = result.settings.find(item => item.key === LEARNING_PROGRAM_CATALOG_SETTING_KEY);
            applyLearningProgramCatalog(row ? normalizeLearningProgramCatalog(row.value) ?? DEFAULT_LEARNING_PROGRAMS : DEFAULT_LEARNING_PROGRAMS);
        }).catch(() => { loading = null; });
    }
    return loading;
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Render ulang komponen saat daftar program berubah; mengembalikan program yang ditampilkan. */
export function useLearningPrograms(): LearningProgramItem[] {
    return useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot ?? snapshot);
}

export const learningProgramInfo = (program?: string | null) => allLearningPrograms.find(item => item.value === program);
export const isActiveLearningProgram = (program?: string | null) => learningPrograms.some(item => item.value === program);
/** Nama program; kode tak dikenal ditampilkan apa adanya. */
export const learningProgramLabel = (program?: string | null) => learningProgramInfo(program)?.label || program || 'Umum';
/** Label program ujian (`metadata.program`); kosong/tak dikenal = "umum". */
export const examProgramOf = (program?: unknown): LearningProgram =>
    typeof program === 'string' && LEARNING_PROGRAM_CODE_PATTERN.test(program) ? program : 'umum';
/**
 * Semua label program sebuah ujian: `metadata.programs` (bisa lebih dari satu),
 * atau `metadata.program` untuk ujian lama. Tanpa label = ['umum'].
 */
export function examProgramsOf(metadata?: { program?: unknown; programs?: unknown } | null): LearningProgram[] {
    const list = Array.isArray(metadata?.programs)
        ? [...new Set(metadata.programs.filter((item): item is string => typeof item === 'string' && LEARNING_PROGRAM_CODE_PATTERN.test(item)))]
        : [];
    return list.length ? list : [examProgramOf(metadata?.program)];
}

/** Program tempat sebuah tingkatan berada: kelas 1–12 = sekolah, '' = umum, selain itu kode program. */
export const learningProgramOf = (grade?: string): LearningProgram => {
    const value = grade || '';
    if (!value) return 'umum';
    if (/^\d+$/.test(value)) return 'sekolah';
    return allGrades.find(item => item.value === value)?.program || value;
};
/** Jenjang sekolah sebuah tingkatan (kelas 1–12); undefined untuk program lain. */
export const schoolStageOf = (grade?: string) => /^\d+$/.test(grade || '') ? stageOfGrade(Number(grade)) : undefined;

/**
 * Kategori tampilan Ruang Belajar: jenjang SD/SMP/SMA untuk kelas 1–12,
 * selain itu kode program (mis. "utbk", "umum").
 */
export const learningCategoryOf = (grade?: string): string => schoolStageOf(grade)?.value || learningProgramOf(grade);

export interface LearningCategory { value: string; label: string; hint: string; program: LearningProgram }
/** Daftar kategori dari program: "sekolah" dipecah menjadi SD, SMP, SMA; program lain apa adanya. */
export function learningCategoriesOf(programs: Pick<LearningProgramItem, 'value' | 'label' | 'hint'>[]): LearningCategory[] {
    return programs.flatMap(item => item.value === 'sekolah'
        ? SCHOOL_STAGES.map(stage => ({ value: stage.value, label: stage.label, hint: stage.hint, program: item.value }))
        : [{ value: item.value, label: item.label, hint: item.hint, program: item.value }]);
}

/** Label kelompok tingkatan, mis. "SMA · Kelas X"; program lain memakai namanya. */
export const learningGradeHeading = (grade?: string) => {
    const stage = schoolStageOf(grade);
    return stage ? `${stage.label} · ${learningGradeLabel(grade)}` : learningGradeLabel(grade);
};

export const learningKey = (value?: string) => (value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
export const learningGradeLabel = (grade?: string) => {
    const known = allGrades.find(item => item.value === (grade || ''));
    if (known) return known.label;
    return /^\d+$/.test(grade || '') ? `Kelas ${grade}` : learningProgramLabel(grade);
};
export const chapterKey = (item: Pick<LearningMaterial, 'grade_level' | 'subject' | 'topic'>) =>
    JSON.stringify([item.grade_level || '', learningKey(item.subject), learningKey(item.topic)]);
export function compareSubchapters(a: LearningMaterial, b: LearningMaterial) {
    const order = (a.subtopic_order || Number.MAX_SAFE_INTEGER) - (b.subtopic_order || Number.MAX_SAFE_INTEGER);
    return order || (a.subtopic || a.title).localeCompare(b.subtopic || b.title, 'id', { numeric: true }) || a.id.localeCompare(b.id);
}
export interface LearningChapter {
    key: string; grade: string; subject: string; title: string; items: LearningMaterial[]; completed: number;
}
export function groupLearningChapters(materials: LearningMaterial[]): LearningChapter[] {
    const chapters = new Map<string, LearningChapter>();
    for (const item of materials) {
        const key = chapterKey(item);
        if (!chapters.has(key)) chapters.set(key, { key, grade: item.grade_level || '', subject: item.subject?.trim() || 'Umum', title: item.topic?.trim() || 'Belum dikelompokkan', items: [], completed: 0 });
        const chapter = chapters.get(key)!;
        chapter.items.push(item);
        if (item.completed) chapter.completed++;
    }
    const rank = (grade: string) => { const index = allGrades.findIndex(item => item.value === grade); return index < 0 ? allGrades.length : index; };
    return [...chapters.values()].map(chapter => ({ ...chapter, items: chapter.items.sort(compareSubchapters) }))
        .sort((a, b) => rank(a.grade) - rank(b.grade) || a.grade.localeCompare(b.grade, 'id', { numeric: true }) || a.subject.localeCompare(b.subject, 'id') || a.title.localeCompare(b.title, 'id', { numeric: true }));
}
