/**
 * Program belajar yang dipakai bersama oleh tujuan belajar siswa, bahan ajar,
 * dan ujian (metadata.program). Harus sama dengan `learningPrograms` di web
 * (apps/web/lib/learning-catalog.ts) dan constraint `cbt_learning_goals`.
 */
export const LEARNING_PROGRAMS = ['sekolah', 'snpdb', 'utbk', 'cpns', 'pppk', 'kedinasan', 'bahasa', 'umum'] as const;
export type LearningProgramCode = (typeof LEARNING_PROGRAMS)[number];
