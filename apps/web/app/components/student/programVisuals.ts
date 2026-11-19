import type { CSSProperties } from 'react';
import { Award, BookOpen, Briefcase, Calculator, FlaskConical, Globe, GraduationCap, Heart, Landmark, Languages, Laptop, Music, School, ShieldCheck, Sparkles, Target, type LucideIcon } from 'lucide-react';
import { learningProgramInfo, type LearningProgramIcon } from '@/lib/learning-catalog';

/** Ikon yang bisa dipilih Admin untuk program di Pengaturan Daftar. */
export const PROGRAM_ICONS: Record<LearningProgramIcon, { icon: LucideIcon; label: string }> = {
    graduation: { icon: GraduationCap, label: 'Toga' },
    school: { icon: School, label: 'Sekolah' },
    target: { icon: Target, label: 'Target' },
    landmark: { icon: Landmark, label: 'Instansi' },
    briefcase: { icon: Briefcase, label: 'Kerja' },
    shield: { icon: ShieldCheck, label: 'Perisai' },
    languages: { icon: Languages, label: 'Bahasa' },
    sparkles: { icon: Sparkles, label: 'Bintang' },
    book: { icon: BookOpen, label: 'Buku' },
    globe: { icon: Globe, label: 'Dunia' },
    award: { icon: Award, label: 'Penghargaan' },
    calculator: { icon: Calculator, label: 'Hitung' },
    flask: { icon: FlaskConical, label: 'Sains' },
    heart: { icon: Heart, label: 'Kesehatan' },
    laptop: { icon: Laptop, label: 'Teknologi' },
    music: { icon: Music, label: 'Seni' },
};

/**
 * Ikon dan warna sebuah program. Pakai `style` bersama kelas `program-tile`
 * (globals.css) untuk kotak ikon berwarna yang juga menyesuaikan mode gelap.
 */
export function programVisual(program: string): { icon: LucideIcon; hue: number; style: CSSProperties } {
    const info = learningProgramInfo(program);
    const hue = info?.hue ?? 220;
    return { icon: PROGRAM_ICONS[info?.icon ?? 'sparkles'].icon, hue, style: { '--mark-hue': hue } as CSSProperties };
}
