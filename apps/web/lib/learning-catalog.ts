import type { LearningMaterial } from './learning-api';

/**
 * Program belajar: bahan ajar bukan hanya untuk SMA, tetapi juga SD/SMP,
 * persiapan UTBK, CPNS, PPPK, sekolah kedinasan, bahasa, dan keterampilan umum.
 */
export type LearningProgram = 'sekolah' | 'snpdb' | 'utbk' | 'cpns' | 'pppk' | 'kedinasan' | 'bahasa' | 'umum';
export const learningPrograms: { value: LearningProgram; label: string; hint: string }[] = [
    { value: 'sekolah', label: 'Sekolah', hint: 'SD · SMP · SMA/SMK' },
    { value: 'snpdb', label: 'SNPDB/SPMB', hint: 'Seleksi masuk SMP/SMA · Tes Kemampuan Akademik' },
    { value: 'utbk', label: 'UTBK-SNBT', hint: 'TPS · Literasi · Penalaran Matematika' },
    { value: 'cpns', label: 'CPNS', hint: 'SKD: TWK · TIU · TKP, dan SKB' },
    { value: 'pppk', label: 'PPPK', hint: 'Teknis · Manajerial · Sosio-kultural · Wawancara' },
    { value: 'kedinasan', label: 'Kedinasan', hint: 'PKN STAN · IPDN · STIS · Poltekip' },
    { value: 'bahasa', label: 'Bahasa & TOEFL', hint: 'TOEFL · IELTS · Bahasa asing' },
    { value: 'umum', label: 'Umum & Skill', hint: 'Literasi · Keterampilan · Pengembangan diri' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const stageOf = (grade: number) => grade <= 6 ? 'SD' : grade <= 9 ? 'SMP' : 'SMA/SMK';

/** Tingkatan yang tersimpan di `grade_level`: kelas 1–12, kode program persiapan, atau '' (umum). */
export const learningGrades: { value: string; label: string; program: LearningProgram; stage?: string }[] = [
    ...[10, 11, 12, 7, 8, 9, 1, 2, 3, 4, 5, 6].map(grade => ({ value: String(grade), label: `Kelas ${ROMAN[grade - 1]}`, program: 'sekolah' as const, stage: stageOf(grade) })),
    { value: 'snpdb', label: 'SNPDB/SPMB', program: 'snpdb' }, { value: 'utbk', label: 'UTBK-SNBT', program: 'utbk' }, { value: 'cpns', label: 'CPNS', program: 'cpns' },
    { value: 'pppk', label: 'PPPK', program: 'pppk' }, { value: 'kedinasan', label: 'Kedinasan', program: 'kedinasan' },
    { value: 'bahasa', label: 'Bahasa & TOEFL', program: 'bahasa' }, { value: '', label: 'Umum', program: 'umum' },
];
/** Program tempat sebuah tingkatan berada; nilai tak dikenal dianggap kelas sekolah. */
export const learningProgramOf = (grade?: string): LearningProgram =>
    learningGrades.find(item => item.value === (grade || ''))?.program || 'sekolah';
/** Label pilihan tingkatan di formulir, misalnya "Kelas X · SMA/SMK" atau "CPNS". */
export const learningGradeOptions = learningGrades.map(item => ({ value: item.value, label: item.stage ? `${item.label} · ${item.stage}` : item.label }));
export const learningKey = (value?: string) => (value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
export const learningGradeLabel = (grade?: string) => learningGrades.find(item => item.value === (grade || ''))?.label || `Kelas ${grade}`;
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
    const rank = (grade: string) => { const index = learningGrades.findIndex(item => item.value === grade); return index < 0 ? learningGrades.length : index; };
    return [...chapters.values()].map(chapter => ({ ...chapter, items: chapter.items.sort(compareSubchapters) }))
        .sort((a, b) => rank(a.grade) - rank(b.grade) || a.grade.localeCompare(b.grade, 'id', { numeric: true }) || a.subject.localeCompare(b.subject, 'id') || a.title.localeCompare(b.title, 'id', { numeric: true }));
}
