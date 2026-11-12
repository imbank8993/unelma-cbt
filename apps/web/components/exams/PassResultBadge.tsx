import React from 'react';
import { formatScore, PASS_STATE_LABELS, type ExamPassResult } from '@/lib/exam-type-catalog';

/**
 * Status kelulusan jenis ujian kustom (Pengaturan → Jenis Ujian).
 * Dipakai di hasil siswa dan tabel monitoring staf.
 */
const STATE_CLASS: Record<ExamPassResult['status'], string> = {
    passed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
    failed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
    pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
    unmapped: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    none: '',
};

export function PassResultBadge({ result, className = '' }: { result?: ExamPassResult | null; className?: string }) {
    if (!result || result.status === 'none') return null;
    const title = result.status === 'unmapped'
        ? 'Ada subtes tanpa soal. Periksa materi kisi-kisi soal dan pemetaan di Pengaturan → Jenis Ujian.'
        : undefined;
    return (
        <span title={title} className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATE_CLASS[result.status]} ${className}`}>
            {PASS_STATE_LABELS[result.status]}
        </span>
    );
}

/** Ringkasan satu baris: "Skor 412/550 · TWK 90 · TIU 120 · TKP 202". */
export function passResultSummary(result?: ExamPassResult | null): string | null {
    if (!result) return null;
    const parts: string[] = [];
    if (result.score_mode === 'raw') parts.push(`Skor ${formatScore(result.raw_score)}/${formatScore(result.raw_max_score)}`);
    if (result.mode === 'kkm' && result.kkm != null) parts.push(`KKM ${formatScore(result.kkm)}`);
    for (const subtest of result.subtests || []) {
        parts.push(`${subtest.name.split(' (')[0]} ${formatScore(subtest.score)}/${formatScore(subtest.passing_grade)}`);
    }
    return parts.length ? parts.join(' · ') : null;
}

/** Rincian per subtes untuk halaman hasil. */
export function PassResultDetail({ result }: { result?: ExamPassResult | null }) {
    if (!result) return null;
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{result.type_label}</p>
                    {result.score_mode === 'raw' && (
                        <p className="text-lg font-semibold tabular-nums text-[#030C4D] dark:text-white">
                            {formatScore(result.raw_score)}
                            <span className="ml-1 text-xs font-normal text-slate-400">/ {formatScore(result.raw_max_score)} skor mentah</span>
                        </p>
                    )}
                    {result.mode === 'kkm' && result.kkm != null && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">KKM {formatScore(result.kkm)}</p>
                    )}
                </div>
                <PassResultBadge result={result} className="text-xs" />
            </div>
            {!!result.subtests?.length && (
                <table className="mt-3 w-full text-xs">
                    <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400">
                            <th className="py-1 font-medium">Subtes</th>
                            <th className="py-1 font-medium text-right">Skor</th>
                            <th className="py-1 font-medium text-right">Passing Grade</th>
                            <th className="py-1 font-medium text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {result.subtests.map(subtest => (
                            <tr key={subtest.key} className="border-t border-slate-100 dark:border-slate-800">
                                <td className="py-1.5 text-slate-700 dark:text-slate-200">{subtest.name}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatScore(subtest.score)} / {formatScore(subtest.max_score)}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatScore(subtest.passing_grade)}</td>
                                <td className={`py-1.5 text-right font-semibold ${subtest.question_count === 0 ? 'text-slate-400' : subtest.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {subtest.question_count === 0 ? 'Tanpa soal' : subtest.passed ? 'Memenuhi' : 'Belum'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {result.total_passing_grade != null && (
                        <tfoot>
                            <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
                                <td className="py-1.5">Total</td>
                                <td className="py-1.5 text-right tabular-nums">{formatScore(result.subtests.reduce((sum, row) => sum + row.score, 0))}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatScore(result.total_passing_grade)}</td>
                                <td />
                            </tr>
                        </tfoot>
                    )}
                </table>
            )}
        </div>
    );
}
