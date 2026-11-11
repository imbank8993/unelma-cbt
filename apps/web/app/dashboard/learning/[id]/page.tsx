'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Info, PanelLeft, Pencil, Coins, Lock } from 'lucide-react';
import { MaterialPreview } from '@/app/components/learning/MaterialPreview';
import { LearningNavigation } from '@/app/components/learning/LearningNavigation';
import { ActivityPlayer } from '@/app/components/learning/ActivityPlayer';
import { learningRequest, type LearningMaterial } from '@/lib/learning-api';
import { learningGradeLabel } from '@/lib/learning-catalog';
import { openLearningHtmlInNewTab } from '@/lib/learning-preview';
import { learningDetailAge, loadLearningDetail, patchLearningDetail, peekLearningDetail, prefetchLearningDetail, type LearningDetail } from '@/lib/learning-reader-cache';
import { checkItemAccess, unlockItemWithTokens } from '@/lib/api/tokens';
import '@/app/components/learning/learning.css';

const READER_PATH = /\/dashboard\/learning\/([0-9a-f-]{36})\/?$/i;
// `locked` ikut kunci: setelah dibuka dengan token, isi lengkap dari server harus menggantikan tampilan terkunci.
const surfaceKey = (material: LearningMaterial) => `${material.id}:${material.content_version || 1}:${material.revision}${material.locked ? ':locked' : ''}`;
interface Surface { key: string; material: LearningMaterial; ready: boolean }

export default function LearningReader() {
    const { id } = useParams<{ id: string }>();
    return <LearningReaderContent initialId={id} />;
}

/**
 * Halaman baca. Berpindah subbab dari navigasi tidak memuat ulang halaman: URL diganti lewat
 * History API, detail diambil dari cache (umumnya sudah di-prefetch), dan isi lama tetap tampil
 * sampai isi baru selesai dimuat di belakangnya — tanpa layar putih atau loader.
 */
function LearningReaderContent({ initialId }: { initialId: string }) {
    const [id, setId] = useState(initialId);
    const [detail, setDetail] = useState<LearningDetail | null>(() => peekLearningDetail(initialId));
    const [surfaces, setSurfaces] = useState<Surface[]>([]);
    const [navigationOpen, setNavigationOpen] = useState(false);
    const navigationToggle = useRef<HTMLButtonElement>(null);
    const closeNavigation = useCallback(() => { setNavigationOpen(false); navigationToggle.current?.focus(); }, []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [showInfo, setShowInfo] = useState(false);
    const completed = detail?.completed ?? false;
    const materialUpdated = detail?.materialUpdated ?? false;
    // `material` = subbab yang dituju (untuk aksi); `shown` = data terakhir yang tersedia (untuk tampilan).
    const material = detail?.material.id === id ? detail.material : null;
    const shown = detail?.material ?? null;

    // Token access state
    const [hasAccess, setHasAccess] = useState(true);
    const [accessInfo, setAccessInfo] = useState<{ tokenPrice: number; balance: number } | null>(null);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockError, setUnlockError] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setNavigationOpen(window.matchMedia('(min-width: 761px)').matches), 0);
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeNavigation(); };
        window.addEventListener('keydown', escape);
        return () => { clearTimeout(timer); window.removeEventListener('keydown', escape); };
    }, [closeNavigation]);

    // Check token access
    useEffect(() => {
        if (!material || detail?.canEdit) {
            setHasAccess(true);
            return;
        }
        if (material.locked || (material.is_paid && (material.token_price || 0) > 0)) {
            // Tertutup sampai terbukti terbuka: server sudah menahan isi materi terkunci.
            if (material.locked) setHasAccess(false);
            void checkItemAccess('material', material.id).then(res => {
                if (res.success) {
                    setHasAccess(res.hasAccess && !material.locked);
                    setAccessInfo({ tokenPrice: res.tokenPrice, balance: res.balance || 0 });
                }
            });
        } else {
            setHasAccess(true);
        }
    }, [material, detail?.canEdit]);

    const handleUnlock = async () => {
        if (!material || unlocking) return;
        setUnlocking(true);
        setUnlockError('');
        try {
            const res = await unlockItemWithTokens('material', material.id, accessInfo?.tokenPrice || material.token_price || 1);
            if (!res.success) {
                setUnlockError(res.error || 'Gagal membuka akses bahan ajar.');
                // Harga atau saldo mungkin berubah: tampilkan nilai terbaru.
                const fresh = await checkItemAccess('material', material.id);
                if (fresh.success) setAccessInfo({ tokenPrice: fresh.tokenPrice, balance: fresh.balance || 0 });
                return;
            }
            setHasAccess(true);
            // Ambil ulang dari server: isi materi baru dikirim setelah dibuka.
            load(material.id, true);
        } catch (err) {
            setUnlockError((err as Error).message);
        } finally {
            setUnlocking(false);
        }
    };

    // Tombol Back/Forward peramban mengikuti subbab yang dibuka lewat navigasi.
    useEffect(() => {
        const onPop = () => { const match = window.location.pathname.match(READER_PATH); if (match) setId(match[1]); };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const show = useCallback((next: LearningDetail) => {
        setDetail(next);
        setSurfaces(previous => {
            const key = surfaceKey(next.material);
            const existing = previous.find(surface => surface.key === key);
            if (existing?.ready) return previous.length === 1 ? previous : [existing];
            if (existing) return [...previous.filter(surface => surface.ready).slice(-1), existing];
            // Pertahankan isi yang sedang tampil; isi baru dimuat di belakangnya.
            return [...previous.filter(surface => surface.ready).slice(-1), { key, material: next.material, ready: false }];
        });
    }, []);

    const load = useCallback((target: string, fresh = false) => {
        setError('');
        const cached = peekLearningDetail(target);
        if (cached && !fresh) show(cached);
        // Data cache tetap dipakai seketika, lalu divalidasi ulang bila sudah agak lama.
        const revalidate = fresh || learningDetailAge(target) > 30_000;
        if (cached && !revalidate) return () => undefined;
        let alive = true;
        loadLearningDetail(target, revalidate)
            .then(result => { if (alive) show(result); })
            .catch(err => { if (alive) setError((err as Error).message); });
        return () => { alive = false; };
    }, [show]);
    useEffect(() => {
        let cancel: (() => void) | undefined;
        const timer = window.setTimeout(() => { cancel = load(id); }, 0);
        return () => { window.clearTimeout(timer); cancel?.(); };
    }, [id, load]);

    const markReady = useCallback((key: string) => setSurfaces(previous => {
        const index = previous.findIndex(surface => surface.key === key);
        if (index < 0 || previous[index].ready && index === 0) return previous;
        // Isi yang siap menggantikan isi lama; isi yang lebih baru (klik cepat beruntun) tetap menunggu.
        return [{ ...previous[index], ready: true }, ...previous.slice(index + 1)];
    }), []);

    const select = useCallback((target: string) => {
        if (target === id) return;
        prefetchLearningDetail(target);
        window.history.pushState(window.history.state, '', `/dashboard/learning/${target}`);
        setShowInfo(false);
        setId(target);
    }, [id]);

    const mark = async () => {
        if (!material || busy) return;
        setBusy(true); setError('');
        try {
            const result = await learningRequest<{ completed: boolean }>(`/${material.id}/progress`, { method: 'PUT', body: JSON.stringify({ completed: !completed, contentVersion: material.content_version }) });
            // A late response for the previous subchapter must not change the newly opened one.
            setDetail(current => current?.material.id === material.id && current.material.content_version === material.content_version
                ? { ...current, completed: result.completed, materialUpdated: false } : current);
            patchLearningDetail(material.id, { completed: result.completed, materialUpdated: false });
        }
        catch (err) { setError((err as Error).message); }
        finally { setBusy(false); }
    };
    const openDirectly = () => {
        if (material?.content_html) openLearningHtmlInNewTab(material.content_html, material.title);
    };
    const canEdit = !!material && !!detail?.canEdit;
    const switching = !!surfaces.length && !surfaces.some(surface => surface.ready && surface.material.id === id);

    return <main className="learning learn-fullpage">
        <header className="learn-reader-toolbar">
            <Link className="learn-button" href="/dashboard/learning" aria-label="Kembali ke semua bahan ajar" title="Kembali ke semua bahan ajar"><ArrowLeft size={18} /></Link>
            <button ref={navigationToggle} aria-label="Navigasi bahan ajar" title="Tampilkan atau sembunyikan daftar bahan ajar" aria-expanded={navigationOpen} aria-controls="learning-navigation" onClick={() => setNavigationOpen(value => !value)}><PanelLeft size={18} /></button>
            <div className="learn-reader-title"><h1>{shown?.subtopic || shown?.title || 'Bahan ajar'}</h1>{material?.status === 'draft' && <span className="learn-status">Draf · hanya pengelola</span>}</div>
            {material && <div className="learn-reader-actions">
                <button aria-label="Informasi bahan ajar" title="Informasi bahan ajar" aria-expanded={showInfo} aria-controls="learning-reader-info" onClick={() => setShowInfo(value => !value)}><Info size={18} /></button>
                {material.format === 'html' && material.content_html && (
                    <button className="learn-button" aria-label="Buka langsung di tab baru" title="Buka langsung di tab baru" onClick={openDirectly}>
                        <ExternalLink size={18} />
                    </button>
                )}
                {material.hasFile && <a className="learn-button" href={`/api/learning/${material.id}/file`} download aria-label="Unduh berkas asli" title="Unduh berkas asli"><Download size={18} /></a>}
                {material.hasRenderedPdf && <a className="learn-button" href={`/api/learning/${material.id}/pdf`} download aria-label="Unduh PDF hasil LaTeX" title="Unduh PDF hasil LaTeX">PDF</a>}
                {canEdit && <Link className="learn-button" href={`/dashboard/learning/${material.id}/edit`} aria-label="Edit materi" title="Edit materi"><Pencil size={18} /></Link>}
                {material.status === 'published' && hasAccess && <button className={completed ? '' : 'learn-primary'} disabled={busy} onClick={() => void mark()} aria-label={completed ? 'Tandai belum selesai' : 'Tandai selesai'} title={completed ? 'Materi sudah dipelajari. Tandai belum selesai' : 'Tandai selesai'}><CheckCircle2 size={18} /><span>{busy ? 'Menyimpan…' : completed ? 'Selesai' : 'Tandai selesai'}</span></button>}
            </div>}
        </header>
        {error && <div className="learn-error" role="alert">{error}<button onClick={() => void load(id, true)}>Muat ulang</button></div>}
        {material && materialUpdated && <div className="learn-activity-status">Materi diperbarui sejak terakhir kamu selesaikan. Pelajari versi terbaru sebelum menandai selesai.</div>}
        {shown && <div className="learn-reader-breadcrumb" aria-label="Lokasi subbab">{[learningGradeLabel(shown.grade_level), shown.subject, shown.topic, shown.subtopic || shown.title].filter(Boolean).join(' / ')}</div>}
        {showInfo && material && <section id="learning-reader-info" className="learn-reader-info"><strong>{material.subject || 'Bahan ajar'} · {material.format.toUpperCase()}</strong><p>{[learningGradeLabel(material.grade_level), material.topic, material.subtopic].filter(Boolean).join(' / ')}</p><p>{material.description}</p><p>{completed ? 'Materi sudah kamu pelajari. ' : ''}Progres tersimpan di akunmu.</p></section>}
        <div className="learn-reader-layout">
        <LearningNavigation current={shown} open={navigationOpen} close={closeNavigation} select={select}
            navigate={() => { if (window.matchMedia('(max-width: 760px)').matches) closeNavigation(); }} />
        <div className="learn-reader-content">
            <div className="learn-reader-stage" aria-busy={switching}>
                {!hasAccess && !canEdit ? (
                    <div className="flex flex-col items-center justify-center min-h-[450px] p-6 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm m-4">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-4 shadow-sm">
                            <Coins size={32} />
                        </div>
                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold uppercase tracking-wider mb-2">
                            Bahan Ajar Berbayar
                        </span>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">
                            {shown?.title || 'Bahan Ajar Terkunci'}
                        </h2>
                        <p className="text-xs md:text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
                            Materi ini memerlukan <strong className="text-amber-600 font-bold">{accessInfo?.tokenPrice || material?.token_price || 1} Token</strong> untuk dapat diakses. Token Anda akan dipotong otomatis setelah konfirmasi.
                        </p>

                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 max-w-xs w-full mb-6 text-left">
                            <div className="flex justify-between items-center text-xs mb-1.5">
                                <span className="text-slate-500">Biaya Akses:</span>
                                <span className="font-bold text-amber-600">{accessInfo?.tokenPrice || material?.token_price || 1} Token</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Saldo Token Anda:</span>
                                <span className="font-bold text-slate-700">{accessInfo?.balance ?? 0} Token</span>
                            </div>
                        </div>

                        {unlockError && (
                            <div className="mb-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl max-w-xs w-full">
                                {unlockError}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            {(accessInfo?.balance ?? 0) >= (accessInfo?.tokenPrice || material?.token_price || 1) ? (
                                <button
                                    disabled={unlocking}
                                    onClick={handleUnlock}
                                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs md:text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                                >
                                    <Coins size={16} />
                                    {unlocking ? 'Membuka Akses...' : `Buka dengan ${accessInfo?.tokenPrice || material?.token_price || 1} Token`}
                                </button>
                            ) : (
                                <Link
                                    href="/dashboard/siswa/tokens"
                                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs md:text-sm rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                                >
                                    <Coins size={16} />
                                    Saldo Tidak Cukup · Top Up Token
                                </Link>
                            )}
                            <Link
                                href="/dashboard/learning"
                                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs md:text-sm rounded-xl transition-colors"
                            >
                                Kembali
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {switching && <div className="learn-reader-progress" role="progressbar" aria-label="Memuat subbab" />}
                        {surfaces.map(surface => <div key={surface.key} className={`learn-reader-surface ${surface.ready ? 'is-shown' : 'is-pending'}`} aria-hidden={!surface.ready || undefined} inert={!surface.ready || undefined}>
                            {surface.material.format === 'html' && surface.material.status === 'published'
                                ? <ActivityPlayer material={surface.material} onReady={() => markReady(surface.key)} />
                                : <MaterialPreview material={surface.material} fullPage onReady={() => markReady(surface.key)} />}
                        </div>)}
                        {!surfaces.length && !error && <div className="learn-loading">Memuat bahan ajar…</div>}
                    </>
                )}
            </div>
        </div></div>
    </main>;
}
