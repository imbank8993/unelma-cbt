"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Coins, Lock, Maximize2, ShieldCheck } from 'lucide-react';
import type { StudentExam } from '@/lib/api/students';
import { exitExamFullscreen, hasExamFullscreen, subscribeExamFullscreen, type FullscreenElement } from '@/lib/exam-fullscreen';
import { checkItemAccess, unlockItemWithTokens } from '@/lib/api/tokens';

export function ExamStartPreparation({ exam, onConfirm, onBack, screenShare }: {
    exam: StudentExam;
    screenShare?: { sharing: boolean; busy: boolean; error: string; supported?: boolean; unsupportedMessage?: string; request: () => Promise<void> };
    onConfirm: (fullscreenReady: boolean) => void;
    onBack: () => void;
}) {
    const [ready, setReady] = useState(false);
    const [unsupported, setUnsupported] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const confirmedRef = useRef(false);
    const leavingRef = useRef(false);

    // Token check state
    // Ujian berbayar tertutup sampai server memastikan sudah dibuka (gagal memeriksa = tetap tertutup).
    const isPaidExam = Boolean(exam.is_paid && (exam.token_price || 0) > 0);
    const [hasAccess, setHasAccess] = useState(!isPaidExam);
    const [accessInfo, setAccessInfo] = useState<{ tokenPrice: number; balance: number } | null>(null);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockError, setUnlockError] = useState('');

    useEffect(() => {
        if (exam.is_paid && (exam.token_price || 0) > 0) {
            void checkItemAccess('exam', exam.id).then(res => {
                if (res.success) {
                    setHasAccess(res.hasAccess);
                    setAccessInfo({ tokenPrice: res.tokenPrice, balance: res.balance || 0 });
                } else {
                    setHasAccess(false);
                    setUnlockError(res.error || 'Status akses ujian belum dapat diperiksa. Muat ulang halaman.');
                }
            });
        }
    }, [exam.id, exam.is_paid, exam.token_price]);

    const handleUnlock = async () => {
        if (unlocking) return;
        setUnlocking(true);
        setUnlockError('');
        try {
            const res = await unlockItemWithTokens('exam', exam.id);
            if (!res.success) {
                setUnlockError(res.error || 'Gagal membuka akses ujian.');
                return;
            }
            setHasAccess(true);
        } catch (err) {
            setUnlockError((err as Error).message);
        } finally {
            setUnlocking(false);
        }
    };

    useEffect(() => {
        const changed = () => {
            if (!hasExamFullscreen()) setReady(false);
        };
        return subscribeExamFullscreen(changed);
    }, []);

    async function activateFullscreen() {
        setError('');
        const el = document.documentElement as FullscreenElement;
        const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (!request) {
            setUnsupported(true);
            setReady(true);
            return;
        }
        setBusy(true);
        try {
            if (!hasExamFullscreen()) await request.call(el);
            if (leavingRef.current) { await exitExamFullscreen(); return; }
            if (!hasExamFullscreen()) throw new Error('fullscreen unavailable');
            setReady(true);
        } catch {
            setError('Layar penuh belum berhasil diaktifkan. Coba lagi dan izinkan layar penuh pada browser.');
        } finally {
            setBusy(false);
        }
    }

    function confirmStart() {
        if (confirmedRef.current || leavingRef.current || busy) return;
        if (exam.metadata?.screenshot_enabled === true && !screenShare?.sharing) {
            setError('Bagikan seluruh layar sebelum memulai ujian.');
            return;
        }
        if (!unsupported && !hasExamFullscreen()) {
            setReady(false);
            setError('Aktifkan kembali layar penuh sebelum memulai ujian.');
            return;
        }
        confirmedRef.current = true;
        onConfirm(true);
    }

    async function goBack() {
        if (leavingRef.current || confirmedRef.current || busy) return;
        leavingRef.current = true;
        setBusy(true);
        setError('');
        try {
            await exitExamFullscreen();
            onBack();
        } catch {
            leavingRef.current = false;
            setError('Layar penuh belum dapat ditutup. Tekan Esc atau gunakan tombol keluar layar penuh browser, lalu kembali ke jadwal.');
        } finally {
            setBusy(false);
        }
    }

    // Jika ujian berbayar dan belum di-unlock
    if (!hasAccess) {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-100 p-6 dark:bg-[#020718]">
                <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#0d1221] md:p-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40">
                        <Coins size={32} />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider mb-2 inline-block">
                        Ujian Berbayar
                    </span>
                    <h1 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {exam.title}
                    </h1>
                    <p className="mb-6 leading-relaxed text-slate-600 dark:text-slate-300 text-sm">
                        Ujian ini memerlukan <strong className="text-amber-600 font-bold">{accessInfo?.tokenPrice || exam.token_price || 1} Token</strong> untuk dapat dikerjakan. Saldo token Anda akan otomatis dipotong setelah dikonfirmasi.
                    </p>

                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 max-w-sm mx-auto mb-6 text-left dark:bg-slate-800/50 dark:border-slate-700">
                        <div className="flex justify-between items-center text-xs mb-1.5">
                            <span className="text-slate-500">Biaya Akses Ujian:</span>
                            <span className="font-bold text-amber-600">{accessInfo?.tokenPrice || exam.token_price || 1} Token</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Saldo Token Anda:</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{accessInfo?.balance ?? 0} Token</span>
                        </div>
                    </div>

                    {unlockError && (
                        <div className="mb-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl max-w-sm mx-auto">
                            {unlockError}
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        {(accessInfo?.balance ?? 0) >= (accessInfo?.tokenPrice || exam.token_price || 1) ? (
                            <button
                                disabled={unlocking}
                                onClick={handleUnlock}
                                className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-3 font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Coins size={16} />
                                {unlocking ? 'Membuka Akses...' : `Buka dengan ${accessInfo?.tokenPrice || exam.token_price || 1} Token`}
                            </button>
                        ) : (
                            <Link
                                href="/dashboard/siswa/tokens"
                                className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-3 font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Coins size={16} />
                                Saldo Tidak Cukup · Beli Token Sekarang
                            </Link>
                        )}
                        <button
                            onClick={onBack}
                            disabled={unlocking}
                            className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 transition-colors"
                        >
                            Kembali ke Jadwal
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-slate-100 p-6 dark:bg-[#020718]">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#0d1221] md:p-8">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                    {ready ? <ShieldCheck size={32} /> : <Maximize2 size={32} />}
                </div>
                <p className="mb-2 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">{exam.title}</p>
                <h1 className="mb-3 text-center text-2xl font-bold text-slate-800 dark:text-slate-100">
                    {ready ? 'Yakin ingin memulai ujian?' : 'Persiapan Ujian'}
                </h1>
                <p className="mb-5 text-center leading-relaxed text-slate-600 dark:text-slate-300">
                    {ready
                        ? 'Pastikan Anda sudah siap. Waktu akan mulai dihitung setelah Anda menekan “Ya, Mulai Ujian” dan server menerima permintaan.'
                        : 'Aktifkan layar penuh terlebih dahulu, lalu konfirmasikan bahwa Anda siap memulai ujian. Waktu pengerjaan belum berjalan.'}
                </p>
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle size={18} /> Durasi ujian: {exam.duration_minutes || 60} menit</p>
                    <p>Setelah dimulai, waktu terus berjalan meskipun halaman ditutup atau koneksi terputus. Waktu pengerjaan tetap dibatasi jadwal penutupan ujian.</p>
                </div>
                {exam.metadata?.screenshot_enabled === true && (
                    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <p className="font-semibold">Bagikan Seluruh Layar untuk ujian ini</p>
                        <p className="mt-1 text-xs">Berbagi layar wajib aktif sampai ujian selesai dan akan berhenti otomatis setelah pengumpulan dikonfirmasi. Jika terhenti, pengerjaan dikunci sementara dan waktu tetap berjalan.</p>
                        <p className="mt-1 text-xs">Screenshot hanya disimpan saat ada indikasi pelanggaran. Maksimal 10 gambar, masa simpan 7 hari, hanya dapat dibaca pengawas berwenang.</p>
                        {screenShare?.supported === false && <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-100 p-3 text-xs text-amber-900">{screenShare.unsupportedMessage || 'Browser/perangkat ini tidak menyediakan berbagi layar. Gunakan laptop atau komputer dengan browser desktop, atau minta pengawas memberi pengecualian. Halaman ini akan terbuka sendiri setelah pengecualian diberikan. Waktu ujian belum berjalan.'}</p>}
                        <button type="button" disabled={screenShare?.sharing || screenShare?.busy || screenShare?.supported === false} onClick={() => void screenShare?.request()}
                            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
                            {screenShare?.sharing ? 'Seluruh Layar sudah dibagikan' : screenShare?.busy ? 'Meminta izin...' : 'Bagikan Seluruh Layar'}
                        </button>
                        {screenShare?.error && <p role="alert" className="mt-2 text-xs text-red-600">{screenShare.error}</p>}
                    </div>
                )}
                {exam.metadata?.screen_share_exception === true && (
                    <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-semibold">Pengecualian berbagi layar diberikan pengawas</p>
                        <p className="mt-1 text-xs">Alasan: {String(exam.metadata.screen_share_exception_reason || 'perangkat tidak mendukung berbagi layar')}. Ketentuan ujian lainnya tetap berlaku.</p>
                    </div>
                )}
                {unsupported && <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Browser ini tidak mendukung layar penuh. Anda tetap dapat memulai ujian setelah konfirmasi.</p>}
                {error && <p role="alert" className="mb-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                {ready ? (
                    <div className="flex flex-col gap-3">
                        <button onClick={confirmStart} disabled={busy || (exam.metadata?.screenshot_enabled === true && !screenShare?.sharing)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60">Ya, Mulai Ujian</button>
                        <button onClick={() => void goBack()} disabled={busy} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300 disabled:opacity-60">Belum, Kembali ke Jadwal</button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <button onClick={() => void activateFullscreen()} disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Mengaktifkan Layar Penuh...' : 'Aktifkan Layar Penuh'}</button>
                        <button onClick={() => void goBack()} disabled={busy} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300 disabled:opacity-60">Kembali ke Jadwal</button>
                    </div>
                )}
            </div>
        </div>
    );
}
