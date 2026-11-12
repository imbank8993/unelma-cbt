"use client";
import { Spinner } from '@/app/components/ui/Spinner';
import { getStudentExamsResult,type StudentScheduledExam } from '@/lib/api/students';
import { formatSchoolDate,formatSchoolDateTime,formatSchoolTimeRange,utcToSchoolLocalDateTime } from '@/lib/school-time';
import { useSchoolTimeZone } from '@/lib/useSchoolTimeZone';
import { getSessionUser } from '@/lib/session';
import { examTypeLabel } from '@/lib/exam-types';
import { REFRESH_INTERVAL,useAutoRefresh } from '@/lib/useAutoRefresh';
import { recoveryActive, recoveryLabel, scheduleState, scheduleCountdown } from '@/lib/student-schedule';
import { motion } from 'framer-motion';
import {
AlertCircle,
ArrowRight,
BookOpen,
CalendarClock,
CalendarDays,
CheckCircle2,
Clock,
Hourglass,
Lock,RefreshCw,
    Coins,
    Users,
    School,
    Search,
    Target,
    type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { EXAM_ACTION_BUTTON, StudentBanner } from '@/app/components/student/StudentBanner';
import { learningPrograms, type LearningProgram } from '@/lib/learning-catalog';
import { loadLearningGoal, programLabel } from '@/lib/learning-goal';
import { useRouter } from 'next/navigation';
import { useCallback,useEffect,useRef,useState } from 'react';

import { needsTokenUnlock, unlockPaidExamBeforeStart } from '@/lib/paid-exam-gate';

/** Waktu server terkini dari jangkar jam (dibaca saat diklik, bukan saat render). */
function clockNow(clock: { time: number; tick: number } | null): number {
    return clock ? clock.time + performance.now() - clock.tick : NaN;
}

/** Judul kelompok daftar ujian (Wajib / Tryout & latihan). */
function GroupHeading({ icon: Icon, title, note, count }: { icon: LucideIcon; title: string; note: string; count: number }) {
    return (
        <div className="flex items-start gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#030C4D] text-white dark:bg-blue-600"><Icon size={16} /></span>
            <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title} <span className="ml-1 text-xs font-medium text-slate-400">{count}</span></h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>
            </div>
        </div>
    );
}

const SchedulePage = () => {
    const { timeZone, error: timeZoneError } = useSchoolTimeZone();
    const [exams, setExams] = useState<StudentScheduledExam[]>([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());
    const [loadError, setLoadError] = useState('');
    const router = useRouter();
    const generation = useRef(0);
    const inFlight = useRef(false);
    const clock = useRef<{ time: number; tick: number } | null>(null);
    const opening = useRef(false);
    const [historyLimit, setHistoryLimit] = useState(10);
    const [filter, setFilter] = useState<'all' | 'open' | 'upcoming' | 'closed'>('all');
    const [goalPrograms, setGoalPrograms] = useState<LearningProgram[]>([]);
    const [programFilter, setProgramFilter] = useState<'untukmu' | 'all' | LearningProgram>('untukmu');
    const [query, setQuery] = useState('');
    const goalUser = useRef<string | null>(null);

    const loadData = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        const request = ++generation.current;
        setLoading(true); setLoadError('');
        try {
            const user = await getSessionUser({ refresh: true });
            if (!user) throw new Error('Sesi berakhir. Silakan login kembali.');
            // Tujuan belajar dimuat sekali per akun untuk filter "Untukmu".
            if (goalUser.current !== user.id) {
                goalUser.current = user.id;
                void loadLearningGoal(user.id).then(goal => { if (goalUser.current === user.id) setGoalPrograms(goal?.programs ?? []); });
            }
            const response = await getStudentExamsResult();
            if (request !== generation.current) return;
            if (!response.success) throw new Error(response.error || 'Jadwal ujian tidak dapat dimuat.');
            if (response.userId !== user.id) throw new Error('Sesi akun berubah. Muat ulang halaman.');
            const time = Date.parse(response.serverTime);
            if (!Number.isFinite(time)) throw new Error('Waktu server belum dapat diverifikasi. Coba lagi.');
            clock.current = { time, tick: performance.now() };
            setNow(new Date(time)); setExams(response.exams);
        } catch (err) {
            if (request === generation.current) { setExams([]); clock.current = null; setLoadError(err instanceof Error ? err.message : 'Jadwal ujian gagal dimuat.'); }
        } finally {
            if (request === generation.current) { inFlight.current = false; setLoading(false); }
        }
    }, []);

    // Ujian berbayar dibayar dan disetujui DI SINI, sebelum halaman ujian dibuka.
    const openExam = useCallback(async (exam: StudentScheduledExam) => {
        if (opening.current) return;
        const time = clockNow(clock.current);
        if (scheduleState(exam, time) === 'open' && !inFlight.current) {
            opening.current = true;
            try {
                if (await unlockPaidExamBeforeStart(exam, () => router.push('/dashboard/siswa/tokens'))) {
                    router.push(`/dashboard/siswa/exam/${exam.id}`);
                }
            } finally {
                opening.current = false;
            }
        } else void loadData();
    }, [loadData, router]);

    useEffect(() => {
        const initialLoad = window.setTimeout(() => void loadData(), 0);
        const interval = setInterval(() => {
            if (clock.current) setNow(new Date(clock.current.time + performance.now() - clock.current.tick));
        }, 1000);
        return () => { window.clearTimeout(initialLoad); clearInterval(interval); generation.current++; inFlight.current = false; };
    }, [loadData]);

    // Jadwal ujian disegarkan berkala; langganan realtime Supabase sudah tidak ada.
    useAutoRefresh(loadData, REFRESH_INTERVAL.dashboard);

    const getStatus = (exam: StudentScheduledExam) => {
        if (scheduleState(exam, now.getTime()) === 'invalid') return { label: 'Jadwal tidak valid', color: 'text-red-500', bg: 'bg-red-50 border-red-100', icon: AlertCircle, enabled: false };
        if (exam.status === 'archived') return { label: 'Diarsipkan', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', icon: Lock, enabled: false };
        // Must be published
        if (!exam.is_published) {
            return { label: 'Belum Publikasi', color: 'text-slate-400', bg: 'bg-slate-50 border-slate-200', icon: Lock, enabled: false };
        }

        // Check if completed
        if (exam.isCompleted && !exam.canRetake) {
            return { label: 'Selesai', color: 'text-[#4B78B8]', bg: 'bg-[#EFF5FD] border-[#C6D9F3]', icon: CheckCircle2, enabled: false };
        }

        const startTime = exam.start_time ? new Date(exam.start_time) : null;
        const endTime = exam.end_time ? new Date(exam.end_time) : null;
        const isBeforeStart = startTime && now < startTime;
        const isAfterEnd = endTime && now > endTime;

        // Window not yet open
        if (isBeforeStart) {
            return { label: 'Belum Mulai', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: Clock, enabled: false };
        }

        // Window closed
        if (isAfterEnd) {
            return { label: 'Waktu Habis', color: 'text-red-500', bg: 'bg-red-50 border-red-100', icon: AlertCircle, enabled: false };
        }

        // Window open — student can start
        if (exam.isCompleted && !exam.isInProgress) {
            return { label: 'Kerjakan Ulang', color: 'text-[#030C4D]', bg: 'bg-[#F8A01B] hover:bg-[#E8900A]', icon: ArrowRight, enabled: true };
        }
        return { label: 'Kerjakan Sekarang', color: 'text-[#030C4D]', bg: 'bg-[#F8A01B] hover:bg-[#E8900A]', icon: ArrowRight, enabled: true };
    };

    const formatDay = (date: string | null | undefined) => formatSchoolDate(date, timeZone);
    const formatTimeRange = (start: string | null | undefined, end: string | null | undefined) =>
        formatSchoolTimeRange(start, end, timeZone);

    const formatTimeUntil = (date: string) => scheduleCountdown(date, now.getTime());
    const isOpenNow = (exam: StudentScheduledExam) => scheduleState(exam, now.getTime()) === 'open';

    // Sort exams: yang benar-benar sedang terbuka lebih dulu, lalu waktu mulai.
    const allSortedExams = [...(loading || loadError ? [] : exams)].sort((a, b) => {
        const aOpen = isOpenNow(a);
        const bOpen = isOpenNow(b);
        if (aOpen && !bOpen) return -1;
        if (!aOpen && bOpen) return 1;
        const aStart = a.start_time ? new Date(a.start_time).getTime() : Infinity;
        const bStart = b.start_time ? new Date(b.start_time).getTime() : Infinity;
        return aStart - bStart;
    });

    // Ujian dari kelas/siswa = wajib (selalu tampil); ujian umum = pilihan (disaring per program).
    const isRequired = (exam: StudentScheduledExam) => exam.metadata?.is_public !== true;
    const programOf = (exam: StudentScheduledExam): LearningProgram =>
        learningPrograms.some(item => item.value === exam.metadata?.program) ? exam.metadata?.program as LearningProgram : 'umum';
    const keyword = query.trim().toLocaleLowerCase('id-ID');
    const matchesQuery = (exam: StudentScheduledExam) => !keyword || exam.title.toLocaleLowerCase('id-ID').includes(keyword);
    const matchesFocus = (exam: StudentScheduledExam) => {
        const program = programOf(exam);
        if (programFilter === 'all') return true;
        if (programFilter === 'untukmu') return !goalPrograms.length || program === 'umum' || goalPrograms.includes(program);
        return program === programFilter;
    };
    const optionalAll = allSortedExams.filter(exam => !isRequired(exam));
    const requiredShown = allSortedExams.filter(exam => isRequired(exam) && matchesQuery(exam));
    const optionalShown = optionalAll.filter(exam => matchesQuery(exam) && matchesFocus(exam));
    const hiddenOptional = optionalAll.filter(matchesQuery).length - optionalShown.length;
    const sortedExams = allSortedExams.filter(exam => requiredShown.includes(exam) || optionalShown.includes(exam));
    const openExams = sortedExams.filter(isOpenNow);
    const upcomingExams = sortedExams.filter(e => scheduleState(e, now.getTime()) === 'upcoming');
    const closedExams = sortedExams.filter(e => ['closed', 'invalid'].includes(scheduleState(e, now.getTime())));
    const nextExam = openExams[0] || upcomingExams[0];
    const nextOpen = Boolean(openExams[0]);

    const splitByState = (list: StudentScheduledExam[]): [StudentScheduledExam[], StudentScheduledExam[], StudentScheduledExam[]] => [
        list.filter(isOpenNow),
        list.filter(e => scheduleState(e, now.getTime()) === 'upcoming'),
        list.filter(e => ['closed', 'invalid'].includes(scheduleState(e, now.getTime()))),
    ];
    const renderSections = (openList: StudentScheduledExam[], upcomingList: StudentScheduledExam[], closedList: StudentScheduledExam[]) => (
        <>
            {/* Open / Available exams */}
            {openList.length > 0 && (filter === 'all' || filter === 'open') && (
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <div className="w-2 h-2 bg-[#6B9FE8] rounded-full animate-pulse" />
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Tersedia Sekarang</h3>
                    </div>
                    <div className="space-y-3">
                        {openList.map((exam) => {
                            return (
                                <motion.div
                                    key={exam.id}
                                    whileHover={{ x: 4, y: -2 }}
                                    className="p-5 bg-white border border-slate-100 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 group cursor-pointer transition-all shadow-sm hover:shadow-lg relative overflow-hidden"
                                    role="link" tabIndex={0}
                                    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.click(); }}
                                    onClick={() => { void openExam(exam); }}
                                >
                                    <div className="absolute left-0 top-0 h-full w-1 bg-[#6B9FE8]" />
                                    
                                    <div className="flex items-center gap-4 flex-1 w-full min-w-0 pl-1.5">
                                        <div className="w-12 h-12 bg-[#EFF5FD] border border-[#D8E6F8] rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#DCE9FA] group-hover:border-[#C6D9F3] transition-all text-[#4B78B8]">
                                            <Clock size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <h3 className="font-bold text-slate-800 text-base truncate group-hover:text-[#030C4D] transition-colors">{exam.title}</h3>
                                                {exam.exam_type && exam.exam_type !== 'daily' && (
                                                    <span className="px-2.5 py-0.5 bg-violet-50 text-violet-600 text-[9px] font-bold uppercase rounded-md border border-violet-100/50">{examTypeLabel(exam.exam_type, exam.metadata)}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium font-sans">
                                                {recoveryActive(exam, now.getTime()) ? (
                                                    <span className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 font-bold text-amber-700">
                                                        <Clock size={12} /> {recoveryLabel(exam).badge}: {recoveryLabel(exam).action.toLowerCase()} sebelum {formatSchoolDateTime(exam.recoveryUntil, timeZone)}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={12} className="text-slate-400" /> {formatTimeRange(exam.start_time, exam.end_time)}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1 text-[#030C4D] font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/30">
                                                    <RefreshCw size={11} /> {exam.duration_minutes || 60} menit
                                                </span>
                                                {exam.is_paid && (exam.token_price ?? 0) > 0 && (
                                                    <span className={`flex items-center gap-1 font-bold px-2 py-0.5 rounded-lg border ${exam.isUnlocked ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                        <Coins size={11} /> {exam.isUnlocked ? 'Sudah dibuka' : `${exam.token_price} Token`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-auto">
                                        <div className="bg-[#F8A01B] text-[#030C4D] font-bold text-xs px-5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-[#F8A01B]/20 group-hover:bg-[#E8900A] group-hover:shadow-lg group-hover:shadow-[#F8A01B]/30 transition-all active:scale-95">
                                            {recoveryActive(exam, now.getTime()) ? recoveryLabel(exam).button : exam.isInProgress ? 'Lanjutkan Ujian' : needsTokenUnlock(exam) ? 'Bayar & Kerjakan' : exam.canRetake ? 'Kerjakan Ulang' : 'Kerjakan'} <ArrowRight size={14} />
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Upcoming */}
            {upcomingList.length > 0 && (filter === 'all' || filter === 'upcoming') && (
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Akan Datang</h3>
                    </div>
                    <div className="space-y-3">
                        {upcomingList.map((exam) => {
                            const until = formatTimeUntil(exam.start_time || '');
                            return (
                                <div key={exam.id}
                                    className="p-5 bg-white border border-slate-100 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden shadow-sm opacity-80"
                                >
                                    <div className="absolute left-0 top-0 h-full w-1 bg-blue-400" />
                                    
                                    <div className="flex items-center gap-4 flex-1 w-full min-w-0 pl-1.5">
                                        <div className="w-12 h-12 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shrink-0 text-blue-500">
                                            <CalendarDays size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <h3 className="font-bold text-slate-800 text-base truncate">{exam.title}</h3>
                                                {exam.exam_type && exam.exam_type !== 'daily' && (
                                                    <span className="px-2.5 py-0.5 bg-violet-50 text-violet-600 text-[9px] font-bold uppercase rounded-md border border-violet-100/50">{examTypeLabel(exam.exam_type, exam.metadata)}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium font-sans">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays size={12} className="text-slate-400" /> {formatDay(exam.start_time)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} className="text-slate-400" /> {formatTimeRange(exam.start_time, exam.end_time)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-auto text-right">
                                        <div className="text-blue-600 font-bold text-xs px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl inline-flex items-center gap-1.5">
                                            <Clock size={13} /> {until}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Completed */}
            {closedList.length > 0 && (filter === 'all' || filter === 'closed') && (
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <CheckCircle2 size={14} className="text-slate-400" />
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Selesai / Waktu Habis</h3>
                    </div>
                    <div className="space-y-3">
                        {closedList.slice(0, historyLimit).map((exam) => {
                            const status = getStatus(exam);
                            const Icon = status.icon || CheckCircle2;
                            return (
                                <div key={exam.id}
                                    className="p-4 bg-white border border-slate-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-200 relative overflow-hidden shadow-sm"
                                >
                                    <div className="absolute left-0 top-0 h-full w-1 bg-slate-300" />
                                    
                                    <div className="flex items-center gap-4 flex-1 w-full min-w-0 pl-1.5">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${status.bg} ${status.color}`}>
                                            <Icon size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-slate-700 text-sm truncate mb-0.5">{exam.title}</h3>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-sans">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays size={12} className="text-slate-300" /> {formatDay(exam.start_time)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="shrink-0 mt-2 sm:mt-0">
                                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border inline-flex items-center gap-1.5 ${status.bg} ${status.color}`}>
                                            <Icon size={11} />
                                            {status.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {closedList.length > historyLimit && (filter === 'all' || filter === 'closed') && <button onClick={() => setHistoryLimit(value => value + 10)} className="rounded-lg border px-4 py-2 text-sm">Tampilkan riwayat lainnya</button>}
        </>
    );
    return (
        <div className="max-w-7xl mx-auto pb-24 space-y-6">
            {timeZoneError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{timeZoneError}</div>}

            {/* Banner agenda: ujian terdekat, hitung mundur, dan strip 7 hari */}
            <StudentBanner
                icon={CalendarClock}
                eyebrow={nextOpen ? 'Sedang berlangsung' : nextExam ? 'Ujian terdekat' : 'Agenda ujian'}
                title={loading ? 'Memuat agenda…' : nextExam ? nextExam.title : 'Belum ada ujian terjadwal'}
                description={nextExam ? `${formatDay(nextExam.start_time)} · ${formatTimeRange(nextExam.start_time, nextExam.end_time)}` : 'Ujian dari sekolah, kelas, dan tryout akan muncul di sini.'}
                actions={nextExam && (nextOpen ? (
                    <button type="button" onClick={() => { void openExam(nextExam); }} className={EXAM_ACTION_BUTTON}>
                        Kerjakan sekarang <ArrowRight size={16} />
                    </button>
                ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-2.5 text-left dark:border-amber-500/20 dark:bg-amber-500/10">
                        <Hourglass size={20} className="text-amber-600 dark:text-amber-300" />
                        <div>
                            <p className="text-xs font-medium text-amber-700/80 dark:text-amber-300/80">Dimulai dalam</p>
                            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{formatTimeUntil(nextExam.start_time || '').replace(/ lagi$/, '')}</p>
                        </div>
                    </div>
                ))}
            >
                {/* Strip 7 hari ke depan; titik menandai hari yang punya ujian. */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {Array.from({ length: 7 }, (_, offset) => {
                        const day = new Date(now.getTime() + offset * 86_400_000);
                        const key = utcToSchoolLocalDateTime(day.toISOString(), timeZone).slice(0, 10);
                        const count = sortedExams.filter(exam => exam.start_time && utcToSchoolLocalDateTime(exam.start_time, timeZone).slice(0, 10) === key).length;
                        const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'short', timeZone }).format(day);
                        const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', timeZone }).format(day);
                        const month = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone }).format(day).replace('.', '');
                        return (
                            <div key={offset} className={`flex flex-col items-center rounded-xl py-2 ${offset === 0 ? 'bg-[#030C4D] text-white shadow-sm dark:bg-blue-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                <span className={`text-[10px] font-medium ${offset === 0 ? 'text-blue-100' : 'text-slate-400'}`}>{offset === 0 ? 'Hari ini' : weekday}</span>
                                <span className="mt-0.5 text-base font-semibold tabular-nums">{date}</span>
                                <span className={`text-[10px] font-medium ${offset === 0 ? 'text-blue-100' : 'text-slate-400'}`}>{month}</span>
                                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${count ? 'bg-[#F8A01B]' : 'bg-transparent'}`} title={count ? `${count} ujian` : undefined} />
                            </div>
                        );
                    })}
                </div>
            </StudentBanner>

            {/* Filter status: menggantikan empat kartu angka. */}
            <div role="group" aria-label="Filter jadwal" className="flex gap-2 overflow-x-auto pb-1">
                {([
                    { value: 'all', label: 'Total Jadwal', count: sortedExams.length },
                    { value: 'open', label: 'Tersedia', count: openExams.length },
                    { value: 'upcoming', label: 'Akan Datang', count: upcomingExams.length },
                    { value: 'closed', label: 'Selesai', count: closedExams.length },
                ] as const).map(item => (
                    <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all ${filter === item.value
                            ? 'border-[#030C4D] bg-[#030C4D] text-white shadow-md shadow-[#030C4D]/15'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
                        {item.label}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${filter === item.value ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{loadError ? '—' : item.count}</span>
                    </button>
                ))}
            </div>

            {/* Fokus program & pencarian */}
            {!loading && !loadError && exams.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div role="group" aria-label="Fokus program" className="flex gap-2 overflow-x-auto pb-1">
                        {[
                            ...(goalPrograms.length ? [{ value: 'untukmu', label: 'Untukmu' }] : []),
                            { value: 'all', label: 'Semua program' },
                            ...learningPrograms.filter((item) => optionalAll.some((exam) => programOf(exam) === item.value)),
                        ].map((item) => (
                            <button key={item.value} type="button" aria-pressed={programFilter === item.value} onClick={() => setProgramFilter(item.value as 'untukmu' | 'all' | LearningProgram)}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${programFilter === item.value
                                    ? 'border-[#2563EB] bg-blue-50 text-[#1D4ED8] dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
                                {item.value === 'untukmu' && <Target size={13} />}
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <label className="relative block w-full sm:w-64">
                        <span className="sr-only">Cari ujian</span>
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari ujian…"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-[#2563EB] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                    </label>
                </div>
            )}

            {/* Kelompok 1: ujian wajib dari sekolah/kelas, selalu tampil */}
            {requiredShown.length > 0 && (
                <section className="space-y-4">
                    <GroupHeading icon={School} title="Wajib dari sekolah / kelas" note="Ditugaskan guru atau proktor untuk kelasmu." count={requiredShown.length} />
                    {renderSections(...splitByState(requiredShown))}
                </section>
            )}

            {/* Kelompok 2: tryout & latihan pilihan, disaring sesuai fokus program */}
            {(optionalShown.length > 0 || hiddenOptional > 0) && (
                <section className="space-y-4">
                    <GroupHeading icon={Target} title="Tryout & latihan"
                        note={programFilter === 'untukmu' && goalPrograms.length
                            ? `Sesuai tujuanmu: ${goalPrograms.map(programLabel).join(', ')}.`
                            : programFilter === 'all' ? 'Semua program.' : `Program ${programLabel(programFilter as LearningProgram)}.`}
                        count={optionalShown.length} />
                    {renderSections(...splitByState(optionalShown))}
                    {hiddenOptional > 0 && (
                        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:text-slate-400">
                            <span>{hiddenOptional} tryout dari program lain disembunyikan.</span>
                            <button type="button" onClick={() => setProgramFilter('all')} className="font-semibold text-[#2563EB] hover:underline dark:text-blue-300">Tampilkan semua</button>
                        </div>
                    )}
                </section>
            )}

            {/* Empty state */}
            {loading ? (
                <div className="p-16 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col items-center justify-center space-y-3">
                    <Spinner variant="buble" size={32} />
                    <p className="text-slate-400 font-bold text-xs tracking-wider uppercase font-sans">Memuat jadwal ujian...</p>
                </div>
            ) : loadError ? (
                <div role="alert" className="p-10 bg-rose-50 border border-rose-200 rounded-2xl text-center max-w-xl mx-auto w-full flex flex-col items-center">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 border border-rose-100">
                        <AlertCircle size={28} className="text-rose-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-1">Jadwal Belum Dapat Dimuat</h3>
                    <p className="text-slate-600 text-sm max-w-sm mb-5">{loadError}</p>
                    <button type="button" onClick={loadData}
                        className="px-5 py-2.5 bg-[#030C4D] text-white rounded-xl font-bold text-xs hover:bg-[#2563EB] flex items-center gap-2 transition-all">
                        <RefreshCw size={13} /> Coba Lagi
                    </button>
                </div>
            ) : exams.length === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#030C4D] dark:bg-slate-800 dark:text-blue-300"><Users size={22} /></div>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Ujian datang dari kelasmu</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gabung ke kelas guru dengan kode akses agar ujian dan tryout kelas otomatis tampil di agenda ini.</p>
                        <Link href="/dashboard/siswa/classes" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#030C4D] px-4 py-2 text-xs font-bold text-white transition-all hover:bg-[#2563EB] active:scale-95">Gabung kelas <ArrowRight size={14} /></Link>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-slate-800"><BookOpen size={22} /></div>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Manfaatkan waktu luang</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Belum ada ujian. Saat yang tepat untuk mencicil materi di Ruang Belajar.</p>
                        <Link href="/dashboard/learning" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-amber-600 active:scale-95">Mulai belajar <ArrowRight size={14} /></Link>
                    </div>
                </div>
            ) : (filter === 'open' && !openExams.length) || (filter === 'upcoming' && !upcomingExams.length) || (filter === 'closed' && !closedExams.length) ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    Tidak ada ujian di kategori ini.
                </div>
            ) : null}

        </div>
    );
};

export default SchedulePage;
