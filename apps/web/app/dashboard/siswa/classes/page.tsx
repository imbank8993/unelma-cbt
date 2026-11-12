"use client";

import { useToast } from '@/app/components/ui/Toast';
import { joinClassAction, leaveClassAction, listStudentClasses, type StudentClass } from '@/lib/api/students';
import { getErrorMessage } from '@/lib/errors';
import { getSessionUser } from '@/lib/session';
import { useMemoryState } from '@/lib/useMemoryState';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertCircle,
    ArrowRight,
    BookOpen,
    CalendarDays,
    Check,
    Compass,
    GraduationCap,
    KeyRound,
    Loader2,
    LogOut,
    Plus,
    School,
    Users,
    X,
} from 'lucide-react';
import Link from 'next/link';
import { BANNER_BUTTON, StudentBanner } from '@/app/components/student/StudentBanner';
import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';

const CLASS_HUES = [222, 160, 262, 24, 330, 190, 45, 290];

/** Warna dan inisial yang selalu sama untuk satu kelas. */
function classMark(name: string): { initials: string; style: CSSProperties } {
    const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const initials = (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : (words[0] || '?').slice(0, 2)).toUpperCase();
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const hue = CLASS_HUES[hash % CLASS_HUES.length];
    return {
        initials,
        style: { background: `linear-gradient(135deg, hsl(${hue} 70% 42%), hsl(${(hue + 40) % 360} 75% 55%))` },
    };
}

export default function SiswaClassesPage() {
    const [classes, setClasses] = useMemoryState<StudentClass[]>('siswa_classes_classes', []);
    const [isLoading, setIsLoading] = useMemoryState('siswa_classes_isLoading', true);

    // State Gabung Kelas Modal
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State Keluar Kelas
    const [userId, setUserId] = useState<string | null>(null);
    const [leavingClassId, setLeavingClassId] = useState<string | null>(null);
    const [classToLeave, setClassToLeave] = useState<{ id: string; name: string } | null>(null);

    const toast = useToast();

    const loadData = useCallback(async () => {
        const user = await getSessionUser();
        if (user) {
            setUserId(user.id);
            setClasses(await listStudentClasses());
        }
        setIsLoading(false);
    }, [setClasses, setIsLoading]);

    useEffect(() => {
        const initialLoad = window.setTimeout(() => void loadData(), 0);
        const handleFocus = () => void loadData();
        window.addEventListener('focus', handleFocus);
        return () => {
            window.clearTimeout(initialLoad);
            window.removeEventListener('focus', handleFocus);
        };
    }, [loadData]);

    const handleJoinClass = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = joinCode.trim();
        if (!userId || !code) return;

        setIsSubmitting(true);
        try {
            const result = await joinClassAction(code);
            if (result.success) {
                toast.success('Berhasil Bergabung', `Anda telah masuk ke kelas: ${result.className}`);
                setJoinCode('');
                setIsJoinModalOpen(false);
                void loadData();
            } else {
                toast.error('Gagal Bergabung', result.error || 'Kode kelas tidak valid.');
            }
        } catch (err) {
            toast.error('Terjadi Kesalahan', getErrorMessage(err) || 'Gagal menghubungi server.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmLeave = async () => {
        if (!classToLeave) return;
        setLeavingClassId(classToLeave.id);
        try {
            const result = await leaveClassAction(classToLeave.id);
            if (result.success) {
                toast.success('Berhasil Keluar', `Anda telah keluar dari kelas: ${result.className}`);
                void loadData();
            } else {
                toast.error('Gagal Keluar', result.error || 'Tidak dapat keluar dari kelas.');
            }
        } catch (err) {
            toast.error('Terjadi Kesalahan', getErrorMessage(err) || 'Gagal menghubungi server.');
        } finally {
            setLeavingClassId(null);
            setClassToLeave(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto pb-24 space-y-6 px-1 sm:px-2">

            {/* ── Banner ── */}
            <StudentBanner
                icon={Users}
                eyebrow="Ruang kolaborasi bersama guru"
                title={isLoading ? 'Kelasku' : classes.length ? `${classes.length} kelas aktif` : 'Belum bergabung di kelas'}
                description={isLoading ? 'Memuat kelas Anda…' : classes.length
                    ? `Kamu tergabung di ${classes.length} kelas. Ujian dan materi dari guru otomatis muncul di Jadwal dan Ruang Belajar.`
                    : 'Gabung ke kelas gurumu dengan kode akses agar ujian dan materi kelas muncul otomatis.'}
                actions={<button type="button" onClick={() => setIsJoinModalOpen(true)} className={BANNER_BUTTON}><Plus size={16} />Gabung Kelas</button>}
            />

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                    <Loader2 size={24} className="animate-spin text-[#030C4D]" />
                    <p className="text-slate-400 font-semibold text-xs tracking-wide uppercase">Memuat kelas Anda...</p>
                </div>
            ) : classes.length === 0 ? (
                /* ── Belum punya kelas: gabung langsung dari halaman ── */
                <div className="grid gap-4 lg:grid-cols-5">
                    <form onSubmit={handleJoinClass} className="lg:col-span-3 rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-8">
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#030C4D] dark:bg-slate-800 dark:text-blue-300">
                            <GraduationCap size={24} />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Gabung ke kelas gurumu</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Masukkan kode akses yang dibagikan guru atau proktor.</p>
                        <label htmlFor="inline-join-code" className="sr-only">Kode kelas</label>
                        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                            <input
                                id="inline-join-code"
                                required
                                type="text"
                                autoComplete="off"
                                placeholder="KODE KELAS"
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                className="h-12 flex-1 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-center font-mono text-lg font-bold uppercase tracking-[0.35em] text-slate-800 outline-none transition-all placeholder:tracking-[0.2em] placeholder:text-slate-300 focus:border-[#030C4D] focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-400"
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting || !joinCode.trim()}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#030C4D] px-6 text-sm font-bold text-white shadow-md shadow-[#030C4D]/20 transition-all hover:bg-[#2563EB] active:scale-95 disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                                Gabung
                            </button>
                        </div>
                        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                            {[
                                { title: 'Minta kode', text: 'Guru atau proktor membagikan kode kelas.' },
                                { title: 'Masukkan kode', text: 'Ketik kode di atas, lalu tekan Gabung.' },
                                { title: 'Mulai belajar', text: 'Ujian dan materi kelas langsung muncul.' },
                            ].map((step, index) => (
                                <li key={step.title} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#030C4D] text-[11px] font-bold text-white dark:bg-blue-500">{index + 1}</span>
                                    <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">{step.title}</p>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </form>
                    <div className="lg:col-span-2 flex flex-col justify-between rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-left dark:border-slate-700 dark:from-slate-900 dark:to-slate-900">
                        <div>
                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-xs dark:bg-slate-800">
                                <Compass size={24} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Belum punya kelas?</h2>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                                Kamu tetap bisa belajar mandiri: materi sekolah, UTBK, CPNS, PPPK, dan kedinasan tersedia di Ruang Belajar.
                            </p>
                        </div>
                        <Link href="/dashboard/learning" className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95">
                            Jelajahi Ruang Belajar <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {classes.map((cls, index) => {
                        const isReguler = cls.type === 'reguler';
                        const mark = classMark(cls.name);

                        return (
                            <motion.article
                                key={cls.id || index}
                                layout
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18, delay: index * 0.03 }}
                                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                            >
                                {/* Banner kelas */}
                                <div className="relative h-24 px-5 pt-4 text-white" style={mark.style}>
                                    <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/15" />
                                    <div className="relative flex items-start justify-between gap-2">
                                        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
                                            {isReguler ? 'Kelas sekolah' : 'Kelas tambahan'}
                                        </span>
                                        {!isReguler ? (
                                            <button
                                                type="button"
                                                onClick={() => setClassToLeave({ id: cls.id, name: cls.name })}
                                                title="Keluar dari kelas ini"
                                                aria-label={`Keluar dari kelas ${cls.name}`}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-rose-500 active:scale-90"
                                            >
                                                <LogOut size={13} />
                                            </button>
                                        ) : (
                                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15"><School size={14} /></span>
                                        )}
                                    </div>
                                </div>
                                <div className="relative flex flex-1 flex-col px-5 pb-4">
                                    <span className="-mt-7 mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white bg-white text-lg font-black text-slate-800 shadow-md dark:border-slate-900 dark:bg-slate-800 dark:text-slate-100">
                                        {mark.initials}
                                    </span>
                                    <h2 className="text-base font-bold leading-snug text-slate-800 line-clamp-2 dark:text-slate-100">{cls.name}</h2>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                        {cls.program || (isReguler ? 'Program reguler sekolah' : 'Bimbingan & pengayaan')}
                                    </p>
                                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                        <Link href="/dashboard/siswa/schedule" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#030C4D] hover:text-white dark:bg-slate-800 dark:text-slate-200">
                                            <CalendarDays size={14} /> Jadwal
                                        </Link>
                                        <Link href="/dashboard/learning" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-[#030C4D] hover:text-white dark:bg-slate-800 dark:text-slate-200">
                                            <BookOpen size={14} /> Materi
                                        </Link>
                                    </div>
                                </div>
                            </motion.article>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setIsJoinModalOpen(true)}
                        className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-transparent p-6 text-slate-500 transition-colors hover:border-[#030C4D] hover:text-[#030C4D] dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-blue-300"
                    >
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"><Plus size={22} /></span>
                        <span className="text-sm font-bold">Gabung kelas lain</span>
                        <span className="text-xs">Punya kode dari guru lain?</span>
                    </button>
                </div>
            )}

            {/* ── 4. Modal Gabung Kelas (Clean & Focused) ── */}
            <AnimatePresence>
                {isJoinModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-xs">
                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 40 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-left"
                        >
                            {/* Mobile Drag Indicator */}
                            <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-[#030C4D]/10 text-[#030C4D] flex items-center justify-center shrink-0 border border-blue-100/60 dark:border-[#030C4D]/20">
                                        <KeyRound size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                            Gabung Kelas
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Masukkan kode akses dari Guru
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsJoinModalOpen(false);
                                        setJoinCode('');
                                    }}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleJoinClass} className="space-y-3.5 pt-1">
                                <input
                                    required
                                    autoFocus
                                    type="text"
                                    placeholder="CONTOH: X9A"
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                    className="w-full bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D] outline-none font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono tracking-wider uppercase transition-all text-xs"
                                />

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsJoinModalOpen(false);
                                            setJoinCode('');
                                        }}
                                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !joinCode.trim()}
                                        className="flex-1 bg-[#030C4D] hover:bg-[#2563EB] text-white font-semibold py-2 px-4 rounded-xl shadow-xs shadow-[#030C4D]/20 transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 text-xs"
                                    >
                                        {isSubmitting ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <Check size={14} />
                                        )}
                                        <span>Bergabung</span>
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── 5. Modal Konfirmasi Keluar Kelas ── */}
            <AnimatePresence>
                {classToLeave && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-xs">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 text-left"
                        >
                            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center border border-rose-100 dark:border-rose-800/40">
                                <AlertCircle size={20} />
                            </div>

                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                                    Keluar dari Kelas?
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                    Anda akan keluar dari kelas tambahan <strong className="text-slate-700 dark:text-slate-200 font-semibold">&quot;{classToLeave.name}&quot;</strong>. Ujian yang ditugaskan ke kelas ini tidak akan muncul lagi di daftar ujian Anda.
                                </p>
                            </div>

                            <div className="flex gap-2 justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => setClassToLeave(null)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    disabled={leavingClassId === classToLeave.id}
                                    onClick={handleConfirmLeave}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                                >
                                    {leavingClassId === classToLeave.id && <Loader2 size={13} className="animate-spin" />}
                                    <span>Keluar Kelas</span>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
}
