import { Briefcase, GraduationCap, Landmark, Languages, ShieldCheck, Sparkles, Target, type LucideIcon } from 'lucide-react';
import type { LearningProgram } from '@/lib/learning-catalog';

/** Ikon dan warna kartu tiap program belajar di beranda siswa. */
export const PROGRAM_VISUALS: Record<LearningProgram, { icon: LucideIcon; tile: string }> = {
    sekolah: { icon: GraduationCap, tile: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
    utbk: { icon: Target, tile: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
    cpns: { icon: Landmark, tile: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
    pppk: { icon: Briefcase, tile: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
    kedinasan: { icon: ShieldCheck, tile: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
    bahasa: { icon: Languages, tile: 'bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300' },
    umum: { icon: Sparkles, tile: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
};
