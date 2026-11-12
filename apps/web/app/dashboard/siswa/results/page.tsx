"use client";
import { selectedStudentScore, studentScoreType, STUDENT_SCORE_LABELS } from '@acca-cbt/shared';
import { getStudentResultsResult,type StudentResult } from '@/lib/api/students';
import { retryExamEvidence } from '@/lib/exam-evidence-outbox';
import { formatSchoolDateTime } from '@/lib/school-time';
import { useSchoolTimeZone } from '@/lib/useSchoolTimeZone';
import { getSessionUser } from '@/lib/session';
import { useMemoryState } from '@/lib/useMemoryState';
import { Award,ChevronRight,Clock,History,Loader2,TrendingUp } from 'lucide-react';
import { BannerStats, StudentBanner } from '@/app/components/student/StudentBanner';
import StudentAnalyticsPanel from '@/app/components/student/StudentAnalyticsPanel';
import { useRouter } from 'next/navigation';
import { useCallback,useEffect,useState } from 'react';

export default function StudentResultsPage() {
    const { timeZone, error: timeZoneError } = useSchoolTimeZone();
    const [results, setResults] = useMemoryState<StudentResult[]>('siswa_results_results', []);
    const [isLoading, setIsLoading] = useMemoryState('siswa_results_isLoading', true);
    const [, setFullName] = useState<string>('');
    const [loadError, setLoadError] = useState('');
    // Bawaan: riwayat (hasil terbaru langsung terlihat setelah ujian). Tautan lama /analytics membuka ?tab=analisis.
    const [tab, setTab] = useState<'analisis' | 'riwayat'>(() =>
        typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'analisis' ? 'analisis' : 'riwayat');
    const chooseTab = (value: 'analisis' | 'riwayat') => {
        setTab(value);
        window.history.replaceState(null, '', `?tab=${value}`);
    };
    const router = useRouter();

    const loadResults = useCallback(async () => {
        setIsLoading(true);
        setLoadError('');
        const user = await getSessionUser();
        if (user) {
            const response = await getStudentResultsResult();
            if (response.success) setResults(response.results);
            else setLoadError(response.error || 'Hasil ujian tidak dapat dimuat.');
            setFullName(user.fullName ?? '');
        } else {
            setLoadError('Sesi berakhir. Silakan login kembali.');
        }
        setIsLoading(false);
    }, [setFullName, setIsLoading, setResults]);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadResults(), 0);
        return () => window.clearTimeout(timer);
    }, [loadResults]);

    useEffect(() => {
        const retryEvidence = () => {
            for (const attemptId of new Set(results.map(result => result.id))) {
                void retryExamEvidence(attemptId);
            }
        };
        retryEvidence();
        window.addEventListener('online', retryEvidence);
        const timer = window.setInterval(retryEvidence, 15_000);
        return () => {
            window.removeEventListener('online', retryEvidence);
            window.clearInterval(timer);
        };
    }, [results]);

    const opened = results.filter(result => result.exams?.show_results === true).length;
    const pending = results.filter(result => result.needs_manual_grading).length;
    const tabs = [
        { value: 'riwayat' as const, label: 'Riwayat ujian', icon: History, count: results.length },
        { value: 'analisis' as const, label: 'Analisis', icon: TrendingUp },
    ];

    return (
        <div className="max-w-7xl mx-auto pb-24 space-y-6">
            {timeZoneError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{timeZoneError}</div>}

            <StudentBanner
                icon={Award}
                eyebrow="Hasil & analisis"
                title={isLoading ? 'Memuat hasil…' : results.length ? `${results.length} ujian selesai` : 'Belum ada hasil ujian'}
                description="Lihat nilai setiap ujian dan perkembangan kemampuanmu dari waktu ke waktu."
                aside={<BannerStats items={[
                    { label: 'Ujian selesai', value: results.length },
                    { label: 'Nilai dibuka', value: opened },
                    { label: 'Menunggu penilaian', value: pending },
                ]} />}
            />

            <div role="tablist" aria-label="Hasil dan analisis" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                {tabs.map(item => (
                    <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} onClick={() => chooseTab(item.value)}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === item.value
                            ? 'bg-[#030C4D] text-white shadow-sm dark:bg-blue-600'
                            : 'text-slate-600 hover:text-[#030C4D] dark:text-slate-300 dark:hover:text-white'}`}>
                        <item.icon size={15} />
                        {item.label}
                        {item.count !== undefined && <span className={`rounded-md px-1.5 text-xs tabular-nums ${tab === item.value ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{item.count}</span>}
                    </button>
                ))}
            </div>

            {tab === 'analisis' ? <StudentAnalyticsPanel /> : isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-3">
                    <Loader2 size={32} className="text-[#030C4D] animate-spin" />
                    <p className="text-slate-400 font-semibold text-xs">Memuat hasil ujian…</p>
                </div>
            ) : loadError ? (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
                    <p className="font-bold text-red-700">Hasil ujian gagal dimuat</p>
                    <p className="mt-1 text-sm text-red-600">{loadError}</p>
                    <button type="button" onClick={loadResults} className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold">Coba Lagi</button>
                </div>
            ) : results.length === 0 ? (
                <div className="py-16 px-6 text-center bg-white border border-slate-200/80 rounded-2xl max-w-xl mx-auto w-full flex flex-col items-center dark:border-slate-800 dark:bg-slate-900">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-[#030C4D] dark:bg-slate-800 dark:text-blue-300">
                        <Award size={26} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1 dark:text-slate-100">Belum ada hasil ujian</h3>
                    <p className="text-slate-500 text-sm max-w-sm dark:text-slate-400">Hasil akan muncul di sini setelah kamu mengumpulkan ujian pertamamu.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {results.map((attempt) => {
                        const displayedScore = attempt.display_score !== undefined ? attempt.display_score : selectedStudentScore(attempt, attempt.exams);
                        const scoreLabel = attempt.score_label || STUDENT_SCORE_LABELS[studentScoreType(attempt.exams)];
                        const canViewDetails = attempt.exams?.show_results === true;
                        const classical = (attempt.score_type || studentScoreType(attempt.exams)) === 'classical';

                        return (
                            <button
                                type="button"
                                key={attempt.id}
                                disabled={!canViewDetails}
                                aria-label={canViewDetails ? `Buka hasil ${attempt.exams?.title || 'ujian'}` : undefined}
                                onClick={() => canViewDetails ? router.push(`/dashboard/siswa/results/${attempt.id}`) : null}
                                className={`group flex w-full items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-all sm:p-5 dark:border-slate-800 dark:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#030C4D] ${canViewDetails ? 'hover:border-slate-300 hover:shadow-md' : 'cursor-default'}`}
                            >
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <h3 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 group-hover:text-[#030C4D] dark:text-slate-100">
                                        {attempt.exams?.title || 'Ujian Tidak Diketahui'}
                                    </h3>
                                    <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <Clock size={12} />
                                        {formatSchoolDateTime(attempt.finished_at, timeZone)}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {attempt.needs_manual_grading && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Menunggu penilaian</span>}
                                        {!canViewDetails && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Nilai belum dibuka guru</span>}
                                    </div>
                                </div>

                                {canViewDetails && (
                                    <div className="shrink-0 text-right">
                                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{scoreLabel}</p>
                                        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[#030C4D] dark:text-white">
                                            {displayedScore == null ? '—' : Number(displayedScore).toFixed(2)}
                                            <span className="ml-0.5 text-xs font-normal text-slate-400">{classical ? '/100' : ' 200–800'}</span>
                                        </p>
                                        {displayedScore == null && <p className="text-[11px] text-slate-500">{scoreLabel.startsWith('IRT') && !attempt.needs_manual_grading ? 'Menunggu perhitungan IRT' : 'Menunggu penilaian'}</p>}
                                    </div>
                                )}
                                {canViewDetails && <ChevronRight size={18} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#030C4D]" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
