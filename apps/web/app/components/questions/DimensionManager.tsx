"use client";
import { deleteConfirmDialog, notify } from '@/lib/confirm-dialog';
import {
createDimension,
createDimensionInterpretation,
deleteDimension,
deleteDimensionInterpretation,
DimensionInterpretationItem,
DimensionItem,
getDimensionInterpretationsByBank,
getDimensionsByBank,
updateDimension,
updateDimensionInterpretation,
} from '@/lib/api/questions';
import { AlertTriangle,BarChart2,Edit3,Plus,Settings2,Sparkles,Trash2,X } from 'lucide-react';
import type { QuestionRecord } from '@/lib/api/questions';
import { dimensionScoreRange, generateInterpretations, uncoveredScores, type DimensionScoreRange } from '@/lib/dimension-score-range';
import { useCallback,useEffect,useState } from 'react';
import { BankChildSelectionBar, useBankChildSelection } from './useBankChildSelection';
import { decodeEntities } from '@/lib/word-images';

interface DimensionManagerProps {
    bankId: string;
    onItemsChange?: (items: DimensionItem[]) => void;
    /** Soal bank ini; dipakai menghitung kemungkinan skor tiap dimensi. */
    questions?: QuestionRecord[];
}

/** Ringkas daftar skor yang belum tercakup: [3,4,5,9] → "3–5, 9". */
function formatScoreList(scores: number[]): string {
    const parts: string[] = [];
    for (let i = 0; i < scores.length; i += 1) {
        let j = i;
        while (j + 1 < scores.length && scores[j + 1] === scores[j] + 1) j += 1;
        parts.push(i === j ? `${scores[i]}` : `${scores[i]}–${scores[j]}`);
        i = j;
    }
    return parts.join(', ');
}

export default function DimensionManager({ bankId, onItemsChange, questions = [] }: DimensionManagerProps) {
    const [dimensions, setDimensions] = useState<DimensionItem[]>([]);
    const [interpretations, setInterpretations] = useState<DimensionInterpretationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Interpretations Editor
    const [isInterpEditorOpen, setIsInterpEditorOpen] = useState(false);
    const [interpDimensionId, setInterpDimensionId] = useState<string | null>(null);
    const [editingInterpId, setEditingInterpId] = useState<string | null>(null);
    const [iMin, setIMin] = useState('');
    const [iMax, setIMax] = useState('');
    const [iTitle, setITitle] = useState('');
    const [iDesc, setIDesc] = useState('');

    const loadData = useCallback(async () => {
        const [dimData, interpData] = await Promise.all([
            getDimensionsByBank(bankId),
            getDimensionInterpretationsByBank(bankId)
        ]);
        setDimensions(dimData || []);
        onItemsChange?.(dimData || []);
        setInterpretations(interpData || []);
        setIsLoading(false);
    }, [bankId, onItemsChange]);

    useEffect(() => {
        let active = true;

        void Promise.all([
            getDimensionsByBank(bankId),
            getDimensionInterpretationsByBank(bankId),
        ]).then(([dimData, interpData]) => {
            if (!active) return;
            setDimensions(dimData || []);
            onItemsChange?.(dimData || []);
            setInterpretations(interpData || []);
            setIsLoading(false);
        });

        return () => {
            active = false;
        };
    }, [bankId, onItemsChange]);

    const handleOpenEditor = (d: DimensionItem | null = null) => {
        if (d) {
            setEditingId(d.id);
            // Nama hasil impor bisa tersimpan sebagai entitas HTML (mis. &amp;).
            setName(decodeEntities(d.name || ''));
            setDescription(d.description || '');
        } else {
            setEditingId(null);
            setName('');
            setDescription('');
        }
        setIsEditorOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) return void notify("Nama dimensi tidak boleh kosong");
        setIsSubmitting(true);
        if (editingId) {
            await updateDimension(editingId, name, description);
        } else {
            await createDimension(bankId, name, description);
        }
        setIsSubmitting(false);
        setIsEditorOpen(false);
        void loadData();
    };

    const handleDelete = async (id: string) => {
        if (!await deleteConfirmDialog('Hapus Dimensi?', 'Yakin ingin menghapus dimensi ini? Soal yang terhubung akan kehilangan dimensi ini.')) return;
        await deleteDimension(id);
        void loadData();
    };

    // --- Interpretations ---

    const handleOpenInterpEditor = (dimId: string, i: DimensionInterpretationItem | null = null) => {
        setInterpDimensionId(dimId);
        if (i) {
            setEditingInterpId(i.id);
            setIMin(i.min_score.toString());
            setIMax(i.max_score.toString());
            setITitle(i.title || '');
            setIDesc(i.interpretation || '');
        } else {
            setEditingInterpId(null);
            setIMin('');
            setIMax('');
            setITitle('');
            setIDesc('');
        }
        setIsInterpEditorOpen(true);
    };

    const handleSaveInterp = async () => {
        if (!interpDimensionId) return;
        if (!iMin || !iMax || !iTitle.trim() || !iDesc.trim()) return void notify("Semua kolom harus diisi");
        setIsSubmitting(true);
        if (editingInterpId) {
            await updateDimensionInterpretation(editingInterpId, Number(iMin), Number(iMax), iTitle, iDesc);
        } else {
            await createDimensionInterpretation(interpDimensionId, Number(iMin), Number(iMax), iTitle, iDesc);
        }
        setIsSubmitting(false);
        setIsInterpEditorOpen(false);
        void loadData();
    };

    /** Ganti rentang dimensi dengan tingkat Rendah/Sedang/Tinggi dari kemungkinan skornya. */
    const handleAutoInterp = async (dimension: DimensionItem, range: DimensionScoreRange, existing: DimensionInterpretationItem[]) => {
        const name = decodeEntities(dimension.name || '');
        const levels = generateInterpretations(name, range);
        if (existing.length > 0 && !await deleteConfirmDialog(
            'Ganti rentang interpretasi?',
            `${existing.length} rentang ${name} yang ada akan dihapus dan diganti ${levels.length} rentang baru (skor ${range.min}–${range.max}). Narasi yang sudah ditulis akan hilang.`,
        )) return;
        setIsSubmitting(true);
        try {
            for (const item of existing) await deleteDimensionInterpretation(item.id);
            for (const level of levels) {
                const result = await createDimensionInterpretation(dimension.id, level.min_score, level.max_score, level.title, level.interpretation);
                if (!result.success) throw new Error(result.error || 'Rentang gagal disimpan.');
            }
            notify(`${levels.length} rentang dibuat untuk ${name}. Sesuaikan narasinya bila perlu.`);
        } catch (error) {
            notify((error as Error).message || 'Rentang otomatis gagal dibuat.');
        } finally {
            setIsSubmitting(false);
            void loadData();
        }
    };

    const handleDeleteInterp = async (id: string) => {
        if (!await deleteConfirmDialog('Hapus Interpretasi?', 'Hapus interpretasi ini?')) return;
        await deleteDimensionInterpretation(id);
        void loadData();
    };

    const selection = useBankChildSelection({
        bankId, items: dimensions, label: 'dimensi',
        consequence: 'Soal yang terhubung akan kehilangan dimensinya.',
        remove: deleteDimension, reload: loadData,
    });

    if (isLoading) {
        return <div className="p-8 text-center text-slate-400">Memuat dimensi...</div>;
    }

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-800">Manajemen Kepribadian</h2>
                    <p className="text-sm text-slate-500">Buat dimensi pengukuran dan atur rentang interpretasi kesimpulannya.</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                        onClick={() => handleOpenEditor()}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2 shadow-sm shadow-indigo-200 transition-colors"
                    >
                        <Plus size={16} /> Tambah Dimensi
                    </button>
                </div>
            </div>

            <BankChildSelectionBar label="dimensi" visibleIds={dimensions.map(item => item.id)}
                selectedIds={selection.selectedIds} isDeleting={selection.isDeleting}
                onToggleVisible={selection.toggleVisible} onClear={selection.clear} onDelete={selection.deleteSelected} />

            {/* ── List ── */}
            {dimensions.length === 0 ? (
                <div className="text-center p-12 bg-white rounded-xl border border-slate-200 border-dashed">
                    <p className="text-slate-400">Belum ada dimensi di bank soal ini.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5">
                    {dimensions.map(d => {
                        const dimsInterps = interpretations.filter(i => i.dimension_id === d.id);
                        const scoreRange = dimensionScoreRange(questions, d.id);
                        const gaps = scoreRange ? uncoveredScores(scoreRange, dimsInterps) : [];
                        return (
                            <div key={d.id} className={`rounded-xl border shadow-sm overflow-hidden flex flex-col ${selection.selectedIds.has(d.id) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                                {/* Dimension Header */}
                                <div className="p-5 flex flex-col md:flex-row gap-4 justify-between bg-slate-50/50">
                                    <input type="checkbox" checked={selection.selectedIds.has(d.id)} disabled={selection.isDeleting}
                                        onChange={() => selection.toggle(d.id)} aria-label={`Pilih dimensi ${decodeEntities(d.name || '')}`}
                                        className="mt-2 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                                                <BarChart2 size={16} />
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-800">{decodeEntities(d.name || '')}</h3>
                                        </div>
                                        {d.description && (
                                            <p className="text-sm text-slate-500 mt-2 ml-10">
                                                {decodeEntities(d.description)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-start gap-2 shrink-0">
                                        <button onClick={() => handleOpenEditor(d)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                                            <Edit3 size={14} /> Edit Dimensi
                                        </button>
                                        <button onClick={() => handleDelete(d.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100">
                                            <Trash2 size={14} /> Hapus
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Interpretations Section */}
                                <div className="p-5 border-t border-slate-100">
                                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                                        <div>
                                            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                <Settings2 size={14} className="text-indigo-500" /> Rentang Interpretasi
                                            </h4>
                                            <p className="mt-1 text-[11px] text-slate-500">
                                                {scoreRange
                                                    ? <>Kemungkinan skor <b className="text-slate-700">{scoreRange.min}–{scoreRange.max}</b> dari {scoreRange.questionCount} soal (jumlah poin semua soalnya).</>
                                                    : 'Belum ada soal yang terhubung ke dimensi ini, jadi kemungkinan skornya belum bisa dihitung.'}
                                            </p>
                                            {scoreRange && dimsInterps.length > 0 && gaps.length > 0 && (
                                                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                                    <AlertTriangle size={12} /> Skor {formatScoreList(gaps)} belum punya interpretasi.
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => scoreRange && void handleAutoInterp(d, scoreRange, dimsInterps)}
                                                disabled={!scoreRange || isSubmitting}
                                                title={scoreRange ? 'Bagi kemungkinan skor menjadi tingkat Rendah, Sedang, dan Tinggi' : 'Hubungkan soal ke dimensi ini terlebih dahulu'}
                                                className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <Sparkles size={12} /> Buat Otomatis
                                            </button>
                                            <button
                                                onClick={() => handleOpenInterpEditor(d.id)}
                                                className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
                                            >
                                                + Tambah Rentang
                                            </button>
                                        </div>
                                    </div>

                                    {dimsInterps.length === 0 ? (
                                        <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center">
                                            <p className="text-xs text-slate-400">Belum ada interpretasi normatif untuk dimensi ini. Laporan siswa akan menggunakan narasi standar.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {dimsInterps.map((interp) => (
                                                <div key={interp.id} className="relative p-4 rounded-lg border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-colors group">
                                                    <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleOpenInterpEditor(d.id, interp)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-md shadow-sm border border-transparent hover:border-slate-200 transition-all">
                                                            <Edit3 size={12} />
                                                        </button>
                                                        <button onClick={() => handleDeleteInterp(interp.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-white rounded-md shadow-sm border border-transparent hover:border-slate-200 transition-all">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                    <div className="inline-block px-2 py-0.5 rounded text-[10px] font-black tracking-widest text-indigo-600 bg-indigo-100 border border-indigo-200 mb-2">
                                                        SKOR: {interp.min_score} - {interp.max_score}
                                                    </div>
                                                    <h5 className="font-bold text-slate-800 text-sm mb-1">{interp.title}</h5>
                                                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{interp.interpretation}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Dimension Editor Modal ── */}
            {isEditorOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h3 className="font-bold text-slate-800 text-lg">
                                {editingId ? 'Edit Dimensi' : 'Tambah Dimensi Baru'}
                            </h3>
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama Dimensi</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Misal: Integritas, Kepemimpinan..."
                                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Deskripsi Singkat</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Jelaskan karakteristik dimensi ini..."
                                    rows={4}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none"
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                            <button onClick={() => setIsEditorOpen(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                                Batal
                            </button>
                            <button onClick={handleSave} disabled={isSubmitting} className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50">
                                {isSubmitting ? 'Menyimpan...' : 'Simpan Dimensi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Interpretation Editor Modal ── */}
            {isInterpEditorOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
                            <h3 className="font-bold text-slate-800 text-lg">
                                {editingInterpId ? 'Edit Interpretasi' : 'Tambah Interpretasi'}
                            </h3>
                            <button onClick={() => setIsInterpEditorOpen(false)} className="p-2 hover:bg-indigo-100 rounded-lg text-slate-400 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Skor Minimum</label>
                                    <input
                                        type="number"
                                        value={iMin}
                                        onChange={e => setIMin(e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Skor Maksimum</label>
                                    <input
                                        type="number"
                                        value={iMax}
                                        onChange={e => setIMax(e.target.value)}
                                        placeholder="20"
                                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Judul Karakter</label>
                                <input
                                    type="text"
                                    value={iTitle}
                                    onChange={e => setITitle(e.target.value)}
                                    placeholder="Contoh: Sangat Disiplin, Kurang Peduli, dsb."
                                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Paragraf Analisis / Saran</label>
                                <textarea
                                    value={iDesc}
                                    onChange={e => setIDesc(e.target.value)}
                                    placeholder="Tuliskan analisis psikologis mendetail yang akan dibaca siswa jika mereka mendapatkan skor di rentang ini..."
                                    rows={5}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none leading-relaxed"
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                            <button onClick={() => setIsInterpEditorOpen(false)} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                                Batal
                            </button>
                            <button onClick={handleSaveInterp} disabled={isSubmitting} className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                                {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
