"use client";

import React, { useEffect, useState } from 'react';
import { ClipboardList, FolderOpen, NotebookPen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { InlineSelect } from '@/app/components/ui/inlineselect';
import { Modal, ModalBody, ModalFooter } from '@/app/components/ui/modal';
import { getExamTypeCatalog, saveExamTypeCatalog } from '@/lib/api/settings';
import { deleteConfirmDialog } from '@/lib/confirm-dialog';
import { applyExamTypeLabels } from '@/lib/exam-types';
import {
    BUILTIN_EXAM_TYPE_SEEDS,
    EXAM_TYPE_PATTERN_LABELS,
    examTypeCodeFromLabel,
    SCORE_MODE_LABELS,
    type ExamTypeCreators,
    type ExamTypePattern,
    type ExamPassRule,
    type ExamScoreMode,
    type ExamSubtestRule,
    type ExamTypeDefinition,
} from '@/lib/exam-type-catalog';

/**
 * Pengaturan → Jenis Ujian.
 *
 * Semua jenis ujian dalam satu daftar. Admin mengatur nama, tampil/tidak saat
 * membuat ujian, siapa yang boleh membuat, cara penilaian (skala 0–100 atau
 * jumlah skor mentah), dan aturan kelulusan (tanpa aturan, KKM, atau passing
 * grade per subtes). Jenis baru memilih polanya: Ujian Biasa, Folder Ujian, atau
 * Tugas. Semua jenis dapat dihapus; jenis bawaan yang dihapus dapat dipulihkan.
 * Aturan disalin ke ujian saat ujian dibuat, jadi perubahan di sini hanya
 * berlaku untuk ujian baru atau ujian yang jenisnya dipilih ulang.
 */

type DraftSubtest = Omit<ExamSubtestRule, 'materi' | 'passing_grade'> & { materi: string; passing_grade: string };
interface DraftType {
    uid: string;
    isNew: boolean;
    builtin: boolean;
    pattern: ExamTypePattern;
    creators: ExamTypeCreators;
    code: string;
    label: string;
    description: string;
    active: boolean;
    score_mode: ExamScoreMode;
    pass_mode: ExamPassRule['mode'];
    kkm: string;
    total_passing_grade: string;
    subtests: DraftSubtest[];
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 outline-none focus:border-[#030C4D] bg-white';
const labelClass = 'block text-xs font-medium text-slate-700 mb-1';

const CREATOR_OPTIONS = [
    { value: 'staff', label: 'Admin, Guru, dan Proktor' },
    { value: 'admin', label: 'Hanya Admin' },
];
const SCORE_MODE_OPTIONS = [
    { value: 'scaled', label: `${SCORE_MODE_LABELS.scaled} (proporsi skor ÷ skor maksimum)` },
    { value: 'raw', label: `${SCORE_MODE_LABELS.raw} (jumlah semua skor yang diperoleh)` },
];
const PASS_MODE_OPTIONS = [
    { value: 'none', label: 'Tanpa status kelulusan' },
    { value: 'kkm', label: 'KKM (satu ambang nilai)' },
    { value: 'passing_grade', label: 'Passing grade per subtes' },
];

/** Pilihan pola saat menambah jenis. */
const PATTERN_CHOICES: Array<{ pattern: ExamTypePattern; title: string; text: string; icon: typeof FolderOpen }> = [
    { pattern: 'regular', title: 'Ujian Biasa', icon: ClipboardList,
        text: 'Satu bank soal, jadwal, dan peserta. Cocok untuk ulangan, kuis, try out, atau seleksi seperti SKD.' },
    { pattern: 'folder', title: 'Folder Ujian', icon: FolderOpen,
        text: 'Banyak bank soal dalam satu folder dengan ruang, sesi, pengawas, dan administrasi. Cocok untuk PTS, PAS, atau asesmen sekolah. Hanya Admin yang membuat.' },
    { pattern: 'assignment', title: 'Tugas', icon: NotebookPen,
        text: 'Instruksi, unggah berkas, dan batas waktu pengumpulan; bank soal opsional.' },
];

let uidCounter = 0;
const uid = () => `t${Date.now()}_${uidCounter++}`;

function toDraft(type: ExamTypeDefinition): DraftType {
    const rule = type.pass_rule;
    return {
        uid: uid(), isNew: false, builtin: type.builtin === true, pattern: type.pattern || 'regular', creators: type.creators || 'staff',
        code: type.code, label: type.label, description: type.description || '',
        active: type.active, score_mode: type.score_mode || 'scaled', pass_mode: rule.mode,
        kkm: rule.mode === 'kkm' ? String(rule.kkm) : '',
        total_passing_grade: rule.mode === 'passing_grade' && rule.total_passing_grade != null ? String(rule.total_passing_grade) : '',
        subtests: rule.mode === 'passing_grade'
            ? rule.subtests.map(subtest => ({ ...subtest, materi: subtest.materi.join(', '), passing_grade: String(subtest.passing_grade) }))
            : [],
    };
}

/** Kosong → NaN (terkirim sebagai null) supaya API menolaknya, bukan diam-diam 0. */
const num = (value: string) => (value.trim() === '' ? NaN : Number(value));

function fromDraft(draft: DraftType): ExamTypeDefinition {
    const pass_rule: ExamPassRule = draft.pass_mode === 'kkm'
        ? { mode: 'kkm', kkm: num(draft.kkm) }
        : draft.pass_mode === 'passing_grade'
            ? {
                mode: 'passing_grade',
                total_passing_grade: draft.total_passing_grade.trim() === '' ? null : num(draft.total_passing_grade),
                subtests: draft.subtests.map(subtest => ({
                    key: subtest.key, name: subtest.name.trim(),
                    materi: subtest.materi.split(',').map(item => item.trim()).filter(Boolean),
                    passing_grade: num(subtest.passing_grade),
                })),
            }
            : { mode: 'none' };
    return {
        code: draft.code || examTypeCodeFromLabel(draft.label), label: draft.label.trim(),
        description: draft.description.trim(), active: draft.active, score_mode: draft.score_mode, pass_rule,
        pattern: draft.pattern, creators: draft.pattern === 'folder' ? 'admin' : draft.creators, builtin: draft.builtin,
    };
}

function emptyType(pattern: ExamTypePattern): DraftType {
    return {
        uid: uid(), isNew: true, builtin: false, pattern, creators: pattern === 'folder' ? 'admin' : 'staff',
        code: '', label: '', description: '', active: true, score_mode: 'scaled',
        pass_mode: pattern === 'regular' ? 'kkm' : 'none', kkm: pattern === 'regular' ? '75' : '', total_passing_grade: '', subtests: [],
    };
}

function restoredType(code: string): DraftType | null {
    const seed = BUILTIN_EXAM_TYPE_SEEDS.find(item => item.code === code);
    if (!seed) return null;
    return {
        uid: uid(), isNew: false, builtin: true, pattern: seed.pattern, creators: seed.creators, code: seed.code,
        label: seed.label, description: seed.description, active: true, score_mode: 'scaled',
        pass_mode: 'none', kkm: '', total_passing_grade: '', subtests: [],
    };
}

export default function AdminExamTypesPage() {
    const [types, setTypes] = useState<DraftType[]>([]);
    const [removed, setRemoved] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [choosing, setChoosing] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = async () => {
        setLoading(true);
        const result = await getExamTypeCatalog();
        if (result.success) {
            setTypes(result.catalog.types.map(toDraft));
            setRemoved(result.catalog.removed || []);
            setDirty(false);
            applyExamTypeLabels(result.catalog.types);
        }
        else setFeedback({ type: 'error', text: result.error || 'Jenis ujian gagal dimuat.' });
        setLoading(false);
    };

    useEffect(() => { void load(); }, []);

    const changeTypes = (next: (list: DraftType[]) => DraftType[]) => { setTypes(next); setDirty(true); };
    const update = (index: number, fields: Partial<DraftType>) =>
        changeTypes(list => list.map((item, i) => (i === index ? { ...item, ...fields } : item)));
    const updateSubtest = (index: number, subIndex: number, fields: Partial<DraftSubtest>) =>
        changeTypes(list => list.map((item, i) => (i === index
            ? { ...item, subtests: item.subtests.map((subtest, j) => (j === subIndex ? { ...subtest, ...fields } : subtest)) }
            : item)));

    const addType = (pattern: ExamTypePattern) => {
        changeTypes(list => [...list, emptyType(pattern)]);
        setChoosing(false);
    };

    const restoreType = (code: string) => {
        const draft = restoredType(code);
        if (!draft) return;
        changeTypes(list => [...list, draft]);
        setRemoved(list => list.filter(item => item !== code));
        setChoosing(false);
    };

    const removeType = async (index: number) => {
        const type = types[index];
        const name = type.label.trim() || 'jenis baru ini';
        if (!type.isNew && !await deleteConfirmDialog(
            `Hapus ${name}?`,
            type.builtin
                ? `${name} tidak bisa dipilih lagi saat membuat ujian. Ujian dan folder yang sudah ada tetap berjalan. Jenis ini dapat dipulihkan lewat Tambah Jenis.`
                : `${name} tidak bisa dipilih lagi saat membuat ujian. Ujian dan folder yang sudah ada tetap berjalan dengan nama dan aturannya.`,
        )) return;
        changeTypes(list => list.filter((_, i) => i !== index));
        if (type.builtin) setRemoved(list => [...new Set([...list, type.code])]);
    };

    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);
        const result = await saveExamTypeCatalog({ types: types.map(fromDraft), removed });
        setSaving(false);
        if (!result.success) {
            setFeedback({ type: 'error', text: result.error || 'Jenis ujian gagal disimpan.' });
            return;
        }
        setFeedback({ type: 'success', text: 'Jenis ujian tersimpan. Aturan berlaku untuk ujian yang dibuat atau dipilih ulang jenisnya setelah ini.' });
        await load();
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-16">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-slate-900">Jenis Ujian</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Atur jenis ujian yang bisa dipilih saat membuat ujian: namanya, siapa yang boleh membuat, cara penilaian, dan aturan kelulusannya.
                        Jenis yang dihapus tidak bisa dipilih lagi, tetapi ujian lamanya tetap berjalan.
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button variant="outline" leftIcon={<Plus size={16} />} onClick={() => setChoosing(true)} disabled={loading}>
                        Tambah Jenis
                    </Button>
                    <Button variant="primary" icon="save" isLoading={saving} onClick={handleSave} disabled={loading || !dirty}>
                        Simpan
                    </Button>
                </div>
            </div>

            {feedback && (
                <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-semibold underline text-xs">Tutup</button>
                </div>
            )}

            {dirty && !saving && (
                <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
                    Ada perubahan yang belum disimpan. Klik Simpan untuk menerapkannya.
                </p>
            )}

            {loading && <p className="text-sm text-slate-500">Memuat…</p>}
            {!loading && types.length === 0 && (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    Belum ada jenis ujian. Klik “Tambah Jenis”.
                </div>
            )}

            {types.map((type, index) => (
                <section key={type.uid} className={`bg-white rounded-xl border p-5 space-y-4 ${type.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-80'}`} aria-label={type.label || 'Jenis ujian baru'}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${type.builtin ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>
                                {type.builtin ? 'Bawaan' : type.isNew ? 'Baru' : 'Tambahan'}
                            </span>
                            <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{EXAM_TYPE_PATTERN_LABELS[type.pattern]}</span>
                            {!type.active && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Tidak ditampilkan</span>}
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-xs text-slate-700">
                                <input type="checkbox" checked={type.active} onChange={e => update(index, { active: e.target.checked })} />
                                Tampilkan
                            </label>
                            <button type="button" className="flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                                aria-label={`Hapus jenis ${type.label}`} onClick={() => void removeType(index)}>
                                <Trash2 size={14} /> Hapus
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Nama Jenis Ujian</label>
                            <input className={inputClass} value={type.label} maxLength={60}
                                placeholder={type.pattern === 'folder' ? 'Contoh: PTS' : type.pattern === 'assignment' ? 'Contoh: Tugas Proyek' : 'Contoh: Ujian TO'}
                                onChange={e => update(index, { label: e.target.value, ...(type.isNew ? { code: examTypeCodeFromLabel(e.target.value) } : {}) })} />
                            <span className="text-[11px] text-slate-400 mt-1 block">Kode: {type.code || '-'}{type.isNew ? '' : ' (tetap)'}</span>
                        </div>
                        <div>
                            <label className={labelClass}>Boleh Dibuat Oleh</label>
                            <InlineSelect value={type.pattern === 'folder' ? 'admin' : type.creators} disabled={type.pattern === 'folder'}
                                minWidth="100%" className="w-full" aria-label={`Pembuat ${type.label}`}
                                onChange={value => update(index, { creators: value as ExamTypeCreators })} options={CREATOR_OPTIONS} />
                            {type.pattern === 'folder' && <span className="text-[11px] text-slate-400 mt-1 block">Folder ujian memakai ruang, sesi, dan pengawas sekolah, jadi selalu dibuat Admin.</span>}
                        </div>
                        <div>
                            <label className={labelClass}>Cara Penilaian</label>
                            <InlineSelect value={type.score_mode} minWidth="100%" className="w-full" aria-label={`Cara penilaian ${type.label}`}
                                onChange={value => update(index, { score_mode: value as ExamScoreMode })} options={SCORE_MODE_OPTIONS} />
                        </div>
                        <div>
                            <label className={labelClass}>Deskripsi (opsional)</label>
                            <input className={inputClass} value={type.description} maxLength={300}
                                onChange={e => update(index, { description: e.target.value })} />
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Aturan Kelulusan</label>
                                <InlineSelect value={type.pass_mode} minWidth="100%" className="w-full" aria-label={`Aturan kelulusan ${type.label}`}
                                    options={PASS_MODE_OPTIONS}
                                    onChange={value => {
                                        const mode = value as ExamPassRule['mode'];
                                        update(index, {
                                            pass_mode: mode,
                                            ...(mode === 'passing_grade' && type.subtests.length === 0
                                                ? { subtests: [{ key: '', name: '', materi: '', passing_grade: '' }] } : {}),
                                        });
                                    }} />
                            </div>
                            {type.pass_mode === 'kkm' && (
                                <div>
                                    <label className={labelClass}>KKM {type.score_mode === 'raw' ? '(skor mentah)' : '(0–100)'}</label>
                                    <input type="number" min={0} className={inputClass} value={type.kkm}
                                        onChange={e => update(index, { kkm: e.target.value })} />
                                </div>
                            )}
                            {type.pass_mode === 'passing_grade' && (
                                <div>
                                    <label className={labelClass}>Passing grade total (opsional)</label>
                                    <input type="number" min={0} className={inputClass} value={type.total_passing_grade} placeholder="Kosongkan bila tidak dipakai"
                                        onChange={e => update(index, { total_passing_grade: e.target.value })} />
                                </div>
                            )}
                        </div>

                        {type.pass_mode === 'passing_grade' && (
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500">
                                    Soal masuk ke subtes menurut <b>materi kisi-kisi</b>-nya (mis. materi “TWK” atau “TWK - Pancasila”).
                                    Skor subtes = jumlah skor mentah soal-soalnya. Untuk soal berbobot seperti TKP, aktifkan
                                    “Skor berbobot per opsi” di editor soal Pilihan Ganda. Lulus bila setiap subtes mencapai passing grade-nya.
                                </p>
                                {type.subtests.map((subtest, subIndex) => (
                                    <div key={subIndex} className="grid grid-cols-12 gap-2 items-end">
                                        <div className="col-span-12 sm:col-span-4">
                                            <label className={labelClass}>Nama Subtes</label>
                                            <input className={inputClass} value={subtest.name} placeholder="TWK"
                                                onChange={e => updateSubtest(index, subIndex, { name: e.target.value })} />
                                        </div>
                                        <div className="col-span-7 sm:col-span-5">
                                            <label className={labelClass}>Materi kisi-kisi (pisahkan koma)</label>
                                            <input className={inputClass} value={subtest.materi} placeholder="TWK"
                                                onChange={e => updateSubtest(index, subIndex, { materi: e.target.value })} />
                                        </div>
                                        <div className="col-span-4 sm:col-span-2">
                                            <label className={labelClass}>Passing Grade</label>
                                            <input type="number" min={0} className={inputClass} value={subtest.passing_grade}
                                                onChange={e => updateSubtest(index, subIndex, { passing_grade: e.target.value })} />
                                        </div>
                                        <div className="col-span-1 flex justify-end pb-1">
                                            <button type="button" className="p-2 text-slate-400 hover:text-red-600" aria-label="Hapus subtes"
                                                onClick={() => update(index, { subtests: type.subtests.filter((_, j) => j !== subIndex) })}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <button type="button" className="text-xs font-semibold text-[#030C4D] hover:underline"
                                    onClick={() => update(index, { subtests: [...type.subtests, { key: '', name: '', materi: '', passing_grade: '' }] })}>
                                    + Tambah subtes
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            ))}

            <Modal open={choosing} onClose={() => setChoosing(false)} size="md" title="Tambah Jenis Ujian">
                <ModalBody>
                    <p className="mb-3 text-sm text-slate-500">Pilih pola jenis ujian. Pola menentukan cara kerjanya dan tidak dapat diganti setelah disimpan.</p>
                    <div className="space-y-2.5">
                        {PATTERN_CHOICES.map(choice => (
                            <button key={choice.pattern} type="button" onClick={() => addType(choice.pattern)}
                                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:border-[#030C4D] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#030C4D]/40">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#030C4D]/5 text-[#030C4D]"><choice.icon size={18} /></span>
                                <span>
                                    <span className="block text-sm font-semibold text-slate-900">{choice.title}</span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{choice.text}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                    {removed.length > 0 && (
                        <div className="mt-5 border-t border-slate-100 pt-4">
                            <p className="mb-2 text-xs font-semibold text-slate-500">Pulihkan jenis bawaan yang dihapus</p>
                            <div className="flex flex-wrap gap-2">
                                {removed.map(code => {
                                    const seed = BUILTIN_EXAM_TYPE_SEEDS.find(item => item.code === code);
                                    return seed && (
                                        <button key={code} type="button" onClick={() => restoreType(code)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#030C4D] hover:bg-slate-50">
                                            <RotateCcw size={13} /> {seed.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </ModalBody>
                <ModalFooter><Button variant="outline" onClick={() => setChoosing(false)}>Batal</Button></ModalFooter>
            </Modal>
        </div>
    );
}
