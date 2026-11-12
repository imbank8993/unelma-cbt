"use client";
import { Spinner } from '@/app/components/ui/Spinner';
import { dashboardResultScore } from '@/lib/student-dashboard-score';
import { StudentScoreAverages } from '@/app/components/student/StudentScoreAverages';
import { getSetting,pickAnnouncements,type Announcement } from '@/lib/api/settings';
import {
    getStudentExamsResult,
    getStudentResultsAction,
    listStudentClasses,
    type StudentResult,
    type StudentScheduledExam,
} from '@/lib/api/students';
import { learningRequest, type LearningMaterial } from '@/lib/learning-api';
import { groupLearningChapters, learningProgramOf, learningPrograms, type LearningProgram } from '@/lib/learning-catalog';
import { daysUntil, loadLearningGoal, programLabel, saveLearningGoal, type LearningGoal } from '@/lib/learning-goal';
import { useToast } from '@/app/components/ui/Toast';
import { LearningGoalModal } from '@/app/components/student/LearningGoalModal';
import { PROGRAM_VISUALS } from '@/app/components/student/programVisuals';
import { BANNER_BUTTON, BannerStats, StudentBanner } from '@/app/components/student/StudentBanner';
import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { dashboardExams, recoveryActive, recoveryLabel, scheduleState } from '@/lib/student-schedule';
import { formatSchoolDate, formatSchoolDateTime, formatSchoolTimeRange, getSchoolTimeZoneLabel } from '@/lib/school-time';
import { useSchoolTimeZone } from '@/lib/useSchoolTimeZone';
import { linkifyText } from '@/lib/text-format';
import { REFRESH_INTERVAL,useAutoRefresh } from '@/lib/useAutoRefresh';
import {
AlertCircle,
ArrowRight,
BookOpen,
CalendarDays,
ChevronRight,
Clock,
Coins,
FileText,
Pencil,
Sparkles,
Rocket,
Target,
Timer,
TrendingUp,
Users,
Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback,useEffect,useRef,useState } from 'react';
import { getUserTokenBalance } from '@/lib/api/tokens';

import { needsTokenUnlock, unlockPaidExamBeforeStart } from '@/lib/paid-exam-gate';

/** Waktu server terkini dari jangkar jam (dibaca saat diklik, bukan saat render). */
function clockNow(clock: { time: number; tick: number } | null): number {
    return clock ? clock.time + performance.now() - clock.tick : NaN;
}

const NEXT_ACTION_CLASS = 'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#030C4D] px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-[#2563EB] active:scale-95 dark:bg-blue-600';

export default function SiswaDashboard() {
    const { timeZone, error: timeZoneError } = useSchoolTimeZone();
    const [exams, setExams] = useState<StudentScheduledExam[]>([]);
    const [results, setResults] = useState<StudentResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [now, setNow] = useState(NaN);
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [tokenBalance, setTokenBalance] = useState<number>(0);
    const [userId, setUserId] = useState<string | null>(null);
    const [firstName, setFirstName] = useState('');
    const [materials, setMaterials] = useState<LearningMaterial[]>([]);
    const [classCount, setClassCount] = useState<number | null>(null);
    const [goal, setGoal] = useState<LearningGoal | null>(null);
    const [goalOpen, setGoalOpen] = useState(false);
    const router = useRouter();
    const inFlight = useRef(false);
    const clock = useRef<{ time: number; tick: number } | null>(null);
    const opening = useRef(false);
    const goalUser = useRef<string | null>(null);
    const toast = useToast();

    const loadData = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const user = await getSessionUser({ refresh: true });
            if (!user) {
                router.replace('/');
                return;
            }
            setUserId(user.id);
            setFirstName((user.fullName || '').trim().split(/\s+/)[0] || '');
            // Tujuan belajar cukup dimuat sekali per akun, bukan pada setiap penyegaran berkala.
            if (goalUser.current !== user.id) {
                goalUser.current = user.id;
                void loadLearningGoal(user.id).then(loaded => { if (goalUser.current === user.id) setGoal(loaded); });
            }
            const response = await getStudentExamsResult();
            if (!response.success) throw new Error(response.error || 'Daftar ujian belum dapat dimuat.');
            if (response.userId !== user.id) throw new Error('Sesi akun berubah. Muat ulang halaman.');
            const serverTime = Date.parse(response.serverTime);
            if (!Number.isFinite(serverTime)) throw new Error('Waktu server belum dapat diverifikasi. Coba lagi.');
            clock.current = { time: serverTime, tick: performance.now() };
            setNow(serverTime);
            setExams(response.exams);
            setLoadError('');

            const [resultResponse, announcementResponse, tokenResponse, learningResponse, classResponse] = await Promise.allSettled([
                getStudentResultsAction(),
                getSetting<Announcement | Announcement[]>('announcement_config'),
                getUserTokenBalance(),
                learningRequest<{ materials: LearningMaterial[] }>(''),
                listStudentClasses(),
            ]);
            if (learningResponse.status === 'fulfilled') setMaterials(learningResponse.value.materials || []);
            if (classResponse.status === 'fulfilled') setClassCount(classResponse.value.length);
            if (resultResponse.status === 'fulfilled') setResults(resultResponse.value);
            if (announcementResponse.status === 'fulfilled') {
                setAnnouncements(pickAnnouncements(announcementResponse.value, 'show_siswa'));
            }
            if (tokenResponse.status === 'fulfilled' && tokenResponse.value.success) {
                // API mengirim `token_balance`; `tokenBalance` tidak pernah ada sehingga saldo tampil kosong.
                setTokenBalance(Number(tokenResponse.value.token_balance) || 0);
            }
        } catch (error) {
            clock.current = null;
            setNow(NaN);
            setExams([]);
            setLoadError(error instanceof Error ? error.message : 'Daftar ujian belum dapat dimuat.');
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    }, [router]);

    // Ujian berbayar dibayar dan disetujui DI SINI, sebelum halaman ujian dibuka.
    const openExam = useCallback(async (exam: StudentScheduledExam) => {
        if (opening.current) return;
        const currentTime = clockNow(clock.current);
        if (scheduleState(exam, currentTime) === 'open') {
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
        const refresh = () => { void loadData(); };
        const timer = window.setTimeout(refresh, 0);
        const ticker = window.setInterval(() => {
            if (clock.current) setNow(clock.current.time + performance.now() - clock.current.tick);
        }, 1000);
        window.addEventListener('exam-submission-synced', refresh);
        return () => {
            window.clearTimeout(timer);
            window.clearInterval(ticker);
            window.removeEventListener('exam-submission-synced', refresh);
        };
    }, [loadData]);

    // Jadwal dan hasil disegarkan berkala. Dulu keduanya didorong langganan
    // realtime Supabase yang menyebut tabel `exams` dan `exam_attempts` — nama
    // sebelum seluruh tabel CBT diberi awalan `cbt_`, jadi langganan itu sudah
    // tidak menerima apa pun bahkan sebelum Supabase ditinggalkan.
    useAutoRefresh(loadData, REFRESH_INTERVAL.dashboard);



    const getDayNum = (dateStr: string | null | undefined) => {
        if (!dateStr) return '--';
        const formatted = formatSchoolDate(dateStr, timeZone);
        return formatted === 'TBA' ? '--' : formatted.split(' ')[0];
    };

    const getMonthName = (dateStr: string | null | undefined) => {
        if (!dateStr) return 'TBA';
        return formatSchoolDate(dateStr, timeZone).split(' ')[1]?.toUpperCase() || 'TBA';
    };

    const formatTime = (startStr: string | null | undefined, endStr: string | null | undefined) => {
        if (!startStr) return `--:-- ${getSchoolTimeZoneLabel(timeZone)}`;
        return formatSchoolTimeRange(startStr, endStr, timeZone);
    };


    const completedExamsCount = results.filter(r => r.status === 'submitted' || r.status === 'auto_submitted').length;
    const visibleExams = dashboardExams(exams, now);
    const activeExam = visibleExams.find(exam => scheduleState(exam, now) === 'open');

    // Ruang belajar: progres dan subbab berikutnya, diutamakan dari program tujuan siswa.
    const goalPrograms = goal?.programs ?? [];
    const inGoal = (grade: string) => !goalPrograms.length || goalPrograms.includes(learningProgramOf(grade));
    const chapters = groupLearningChapters(materials);
    const completedMaterials = materials.filter(item => item.completed).length;
    const continueChapters = [
        ...chapters.filter(chapter => chapter.completed > 0 && chapter.completed < chapter.items.length),
        ...chapters.filter(chapter => chapter.completed === 0 && inGoal(chapter.grade)),
    ].slice(0, 3);
    const programCards = (goalPrograms.length ? learningPrograms.filter(item => goalPrograms.includes(item.value)) : learningPrograms.slice(0, 4))
        .map(item => ({ ...item, chapters: chapters.filter(chapter => learningProgramOf(chapter.grade) === item.value).length }));
    const daysLeft = daysUntil(goal?.targetDate, now);
    const hour = Number.isFinite(now) ? new Date(now).getHours() : 8;
    const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
    const saveGoal = async (next: LearningGoal) => {
        setGoal(next);
        setGoalOpen(false);
        if (!userId) return;
        const result = await saveLearningGoal(userId, next);
        if (result.synced) toast.success('Tujuan tersimpan', 'Beranda dan materi kini menyesuaikan tujuanmu.');
        else toast.error('Tersimpan di perangkat ini saja', result.error || 'Server belum dapat dihubungi. Coba simpan lagi nanti.');
    };
    const learnHref = (program?: LearningProgram) => program ? `/dashboard/learning?program=${program}` : '/dashboard/learning';
    // Langkah berikutnya: satu aksi paling penting saat ini.
    const resume = continueChapters[0];
    const resumeItem = resume?.items.find(item => !item.completed) || resume?.items[0];
    const nextStep: { icon: typeof Zap; tone: string; label: string; title: string; sub?: string; action: string; href: string } = activeExam
        ? { icon: Zap, tone: 'from-rose-500 to-orange-500', label: 'Ujian sedang berlangsung', title: activeExam.title, action: 'Kerjakan sekarang', href: '/dashboard/siswa/schedule' }
        : resume && resumeItem
            ? { icon: BookOpen, tone: 'from-[#2563EB] to-sky-500', label: resume.completed ? 'Lanjutkan belajar' : 'Rekomendasi untukmu', title: resumeItem.subtopic || resumeItem.title, sub: `${resume.subject} · ${resume.title}`, action: resume.completed ? 'Lanjutkan' : 'Mulai', href: `/dashboard/learning/${resumeItem.id}` }
            : classCount === 0
                ? { icon: Users, tone: 'from-violet-500 to-fuchsia-500', label: 'Langkah pertama', title: 'Gabung ke kelas gurumu', sub: 'Ujian dan materi kelas akan muncul otomatis.', action: 'Gabung kelas', href: '/dashboard/siswa/classes' }
                : { icon: Rocket, tone: 'from-amber-500 to-orange-500', label: 'Siap belajar?', title: goalPrograms.length ? `Jelajahi materi ${programLabel(goalPrograms[0])}` : 'Jelajahi Ruang Belajar', sub: 'Pelajari materi dulu sebelum ujian berikutnya.', action: 'Jelajahi', href: learnHref(goalPrograms[0]) };


    const renderExamCard = (exam: StudentScheduledExam, i: number) => {
        const isReady = scheduleState(exam, now) === 'open';
        const inRecovery = recoveryActive(exam, now);
        const recovery = recoveryLabel(exam);
        return (
            <div
                key={exam.id || i}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-indigo-100/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 relative overflow-hidden group shadow-sm hover:shadow-md"
            >
                <div className={`absolute left-0 top-0 h-full w-1 ${isReady ? 'bg-[#030C4D]' : 'bg-blue-400'}`} />
                
                <div className="flex items-center gap-3.5 flex-1 pl-1 min-w-0 text-left">
                    {/* Date Badge */}
                    <div className="w-10 h-10 bg-indigo-50 border border-indigo-100/30 rounded-xl flex flex-col items-center justify-center shrink-0 group-hover:bg-[#030C4D] group-hover:border-[#030C4D] transition-colors text-indigo-600 group-hover:text-white">
                        {getDayNum(exam.start_time) === '--' ? (
                            <Zap size={16} />
                        ) : (
                            <>
                                <p className="text-sm font-bold leading-none">{getDayNum(exam.start_time)}</p>
                                <p className="text-[8px] font-bold uppercase mt-0.5 opacity-80">{getMonthName(exam.start_time)}</p>
                            </>
                        )}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            {inRecovery ? (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 leading-none">
                                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                                    {recovery.badge}
                                </span>
                            ) : isReady ? (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-50 text-[#030C4D] border border-blue-100 flex items-center gap-1 leading-none">
                                    <span className="w-1 h-1 rounded-full bg-[#030C4D] animate-pulse"></span>
                                    Aktif
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100 leading-none">
                                    Terjadwal
                                </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-50 text-[#030C4D] border border-blue-100/30 flex items-center gap-1 leading-none">
                                <Timer size={10} />
                                {exam.duration_minutes} Menit
                            </span>
                            {exam.is_paid && (exam.token_price ?? 0) > 0 && (
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border flex items-center gap-1 leading-none ${exam.isUnlocked ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                    <Coins size={10} />
                                    {exam.isUnlocked ? 'Sudah dibuka' : `${exam.token_price} Token`}
                                </span>
                            )}
                        </div>

                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm group-hover:text-[#030C4D] transition-colors line-clamp-1 leading-snug">{exam.title}</h3>
                        
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 font-sans font-medium">
                            <Clock size={12} className="text-slate-300" />
                            {inRecovery
                                ? `${recovery.action} sebelum ${formatSchoolDateTime(exam.recoveryUntil, timeZone)}`
                                : formatTime(exam.start_time, exam.end_time) === `--:-- ${getSchoolTimeZoneLabel(timeZone)}` ? 'Waktu Fleksibel' : formatTime(exam.start_time, exam.end_time)}
                        </p>
                    </div>
                </div>

                <div className="shrink-0 mt-2 sm:mt-0 z-10 pl-1">
                    {isReady ? (
                        <button
                            onClick={() => { void openExam(exam); }}
                            className="w-full sm:w-auto bg-[#030C4D] hover:bg-[#2563EB] text-white text-[10px] font-bold px-3.5 py-1.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm active:scale-95"
                        >
                            {inRecovery ? recovery.button : exam.isInProgress ? 'Lanjutkan' : needsTokenUnlock(exam) ? 'Bayar & Mulai' : 'Mulai'} <ArrowRight size={12} />
                        </button>
                    ) : (
                        <div className="text-[9px] font-bold text-slate-500 uppercase px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100">Belum mulai</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto pb-24 space-y-6">
            {timeZoneError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{timeZoneError}</div>}

            {announcements.length > 0 && (
                <div className="space-y-4">
                    {announcements.map((ann, idx) => (
                        <div key={ann.id || idx} className="bg-blue-50/50 border border-blue-200/60 rounded-2xl p-4 flex items-start gap-4">
                            <div className="bg-blue-100/80 text-blue-600 p-2 rounded-xl mt-0.5 shrink-0">
                                <AlertCircle size={18} />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-blue-900 mb-0.5 text-sm">{ann.title}</h3>
                                <p className="text-xs md:text-sm text-blue-800 whitespace-pre-wrap leading-relaxed font-sans font-medium" dangerouslySetInnerHTML={{ __html: linkifyText(ann.content || '') }}></p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Banner: sapaan, tujuan belajar, dan ringkasan ── */}
            <StudentBanner
                icon={Sparkles}
                eyebrow={`${greeting}${firstName ? ',' : ''}`}
                title={firstName || 'Pejuang ilmu'}
                description={goal ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><Target size={14} className="text-[#F8A01B]" />Tujuan</span>
                        {goal.programs.map((program, index) => (
                            <span key={program} className="inline-flex items-center gap-2">
                                {index > 0 && <span className="text-slate-300 dark:text-slate-600">·</span>}
                                <Link href={learnHref(program)} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-[#030C4D] transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-blue-200 dark:hover:bg-slate-700">{programLabel(program)}</Link>
                            </span>
                        ))}
                        {daysLeft !== null && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{daysLeft === 0 ? 'Hari ini' : `${daysLeft} hari lagi`}</span>}
                        <button type="button" onClick={() => setGoalOpen(true)} aria-label="Ubah tujuan belajar"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#030C4D] dark:text-slate-400 dark:hover:text-white">
                            <Pencil size={12} /> Ubah
                        </button>
                        {goal.target && <p className="w-full text-slate-500 dark:text-slate-400">{goal.target}</p>}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <span>Pilih tujuan belajarmu agar beranda dan materi menyesuaikan.</span>
                        <button type="button" onClick={() => setGoalOpen(true)} className={`${BANNER_BUTTON} self-start`}>
                            <Target size={15} /> Tentukan tujuan
                        </button>
                    </div>
                )}
                aside={<BannerStats items={[
                    { label: 'Ujian selesai', value: completedExamsCount },
                    { label: 'Subbab dipelajari', value: <>{completedMaterials}<span className="text-sm font-normal text-slate-400">/{materials.length}</span></> },
                    {
                        label: 'Token',
                        value: tokenBalance,
                        action: <button type="button" onClick={() => router.push('/dashboard/siswa/tokens')} className="block font-semibold text-[#2563EB] hover:underline sm:ml-1.5 sm:inline dark:text-blue-300">Top up</button>,
                    },
                ]} />}
            />

            {/* ── Langkah berikutnya: satu aksi paling penting saat ini ── */}
            {!loading && (
                <section className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:p-5">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${nextStep.tone} text-white shadow-md`}><nextStep.icon size={22} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{nextStep.label}</p>
                        <p className="truncate text-base font-bold text-slate-800 dark:text-slate-100">{nextStep.title}</p>
                        {nextStep.sub && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{nextStep.sub}</p>}
                    </div>
                    {activeExam
                        ? <button type="button" onClick={() => { void openExam(activeExam); }} className={NEXT_ACTION_CLASS}>{nextStep.action} <ArrowRight size={14} /></button>
                        : <Link href={nextStep.href} className={NEXT_ACTION_CLASS}>{nextStep.action} <ArrowRight size={14} /></Link>}
                </section>
            )}

            {/* ── Ujian & nilai ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <div className="text-left">
                            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                                <CalendarDays size={16} className="text-[#2563EB]" />
                                Ujian & Tryout
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-400">Yang sedang berlangsung dan akan datang</p>
                        </div>
                        <button
                            onClick={() => router.push('/dashboard/siswa/schedule')}
                            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[#030C4D] transition-all hover:bg-[#030C4D] hover:text-white active:scale-95 dark:bg-slate-800 dark:text-blue-300"
                        >
                            Lihat agenda <ChevronRight size={13} />
                        </button>
                    </div>

                    <div className="space-y-3 p-4">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-12">
                                <Spinner variant="buble" size={32} />
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Memuat daftar ujian...</p>
                            </div>
                        ) : loadError ? (
                            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center">
                                <AlertCircle size={24} className="mx-auto mb-3 text-rose-500" />
                                <p className="text-sm font-bold text-slate-700">Daftar ujian belum dapat dimuat</p>
                                <p className="mt-1 text-xs text-slate-500">{loadError}</p>
                                <button type="button" onClick={() => void loadData()} className="mt-4 text-xs font-bold text-blue-600 hover:underline">Coba lagi</button>
                            </div>
                        ) : visibleExams.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/60 px-6 py-10 text-center dark:from-slate-800/40 dark:to-slate-800/20">
                                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#2563EB] shadow-sm dark:bg-slate-800"><CalendarDays size={26} /></span>
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Belum ada ujian dalam waktu dekat</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Waktu yang pas untuk mencicil materi. Ujian baru akan muncul di sini.</p>
                                </div>
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Link href={learnHref(goalPrograms[0])} className="inline-flex items-center gap-1.5 rounded-xl bg-[#030C4D] px-4 py-2 text-xs font-bold text-white hover:bg-[#2563EB]"><BookOpen size={14} /> Belajar sekarang</Link>
                                    {classCount === 0 && <Link href="/dashboard/siswa/classes" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><Users size={14} /> Gabung kelas</Link>}
                                </div>
                            </div>
                        ) : (
                            visibleExams.map((exam, i) => renderExamCard(exam, i))
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-4 text-left dark:border-slate-800">
                        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                            <TrendingUp size={16} className="text-emerald-500" />
                            Progres Nilai
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-400">Performa ujian terakhirmu</p>
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-5">
                        <div className="space-y-4">
                            {results.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <FileText size={24} className="mx-auto mb-2 text-slate-300" />
                                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Grafik nilaimu akan tumbuh di sini</p>
                                    <p className="mt-1 text-xs text-slate-400">Selesaikan ujian pertamamu untuk melihat perkembangan.</p>
                                </div>
                            ) : (
                                <>
                                    <StudentScoreAverages results={results} />
                                    {results.slice(0, 4).map((res, i) => {
                                        const displayedScore = dashboardResultScore(res);
                                        const gradingPending = displayedScore === null;
                                        const score = displayedScore ?? 0;
                                        const pendingLabel = !res.exams?.show_results ? 'Nilai belum dibuka'
                                            : res.score_type?.startsWith('irt_') && !res.needs_manual_grading
                                                ? 'Menunggu perhitungan IRT' : 'Menunggu penilaian';
                                        const textColorClass = gradingPending ? 'text-slate-400' : 'text-[#030C4D] dark:text-blue-300';

                                        return (
                                            <div key={res.id || i} className="space-y-1.5 text-left">
                                                <div className="flex items-start justify-between">
                                                    <p className="truncate pr-2 text-xs font-semibold leading-none text-slate-700 dark:text-slate-200">{res.exams?.title || 'Ujian'}</p>
                                                    <p className="shrink-0 text-[10px] leading-none text-slate-400">
                                                        <span className={`font-mono text-xs font-black ${textColorClass}`}>{gradingPending ? pendingLabel : score.toFixed(2)}</span>{!gradingPending && (res.score_type?.startsWith('irt_') ? ' (200–800)' : '/100')}
                                                    </p>
                                                </div>
                                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                    {/* Skala IRT 200–800 dipetakan ke lebar 0–100%. */}
                                                    <div className="h-full rounded-full bg-gradient-to-r from-[#030C4D] to-[#2563EB]" style={{ width: `${Math.min(100, Math.max(0, res.score_type?.startsWith('irt_') ? (score - 200) / 6 : score))}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                        <button
                            onClick={() => router.push('/dashboard/siswa/results')}
                            className="group mt-6 flex w-full items-center justify-center gap-1 border-t border-slate-100 pt-4 text-center text-xs font-bold text-[#030C4D] transition-colors hover:text-[#2563EB] active:scale-[0.98] dark:border-slate-800 dark:text-blue-300"
                        >
                            Laporan Lengkap
                            <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Jelajah program sesuai tujuan ── */}
            <section className="space-y-3">
                <div className="flex items-end justify-between gap-3 px-1 text-left">
                    <div>
                        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{goalPrograms.length ? 'Materi untuk tujuanmu' : 'Jelajahi program belajar'}</h2>
                        <p className="text-xs text-slate-400">Dari pelajaran sekolah hingga persiapan seleksi ASN</p>
                    </div>
                    <Link href="/dashboard/learning" className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#2563EB] hover:underline">Semua materi <ChevronRight size={13} /></Link>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {programCards.map(item => {
                        const visual = PROGRAM_VISUALS[item.value];
                        const Icon = visual.icon;
                        return (
                            <Link key={item.value} href={learnHref(item.value)}
                                className="group flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${visual.tile}`}><Icon size={20} /></span>
                                <span>
                                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{item.label}</span>
                                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 line-clamp-2 dark:text-slate-400">{item.hint}</span>
                                </span>
                                <span className="mt-auto inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB]">
                                    {item.chapters ? `${item.chapters} BAB tersedia` : 'Segera hadir'} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>

            <LearningGoalModal open={goalOpen} initial={goal} onClose={() => setGoalOpen(false)} onSave={next => { void saveGoal(next); }} />
        </div>
    );
}
