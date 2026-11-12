"use client";

import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { getExamTypeCatalog, saveExamTypeCatalog } from '@/lib/api/settings';
import {
    examTypeCodeFromLabel,
    SCORE_MODE_LABELS,
    type ExamPassRule,
    type ExamScoreMode,
    type ExamSubtestRule,
    type ExamTypeDefinition,
} from '@/lib/exam-type-catalog';

/**
 * Pengaturan → Jenis Ujian.
 *
 * Admin menambah jenis ujian yang bisa dipilih saat membuat ujian, beserta cara
 * penilaiannya (skala 0–100 atau jumlah skor mentah) dan aturan kelulusannya
 * (tanpa aturan, KKM, atau passing grade per subtes). Aturan disalin ke ujian
 * saat ujian dibuat, jadi perubahan di sini hanya berlaku untuk ujian baru atau
 * ujian yang jenisnya dipilih ulang.
 */

type DraftSubtest = Omit<ExamSubtestRule, 'materi' | 'passing_grade'> & { materi: string; passing_grade: string };
interface DraftType {
    uid: string;
    isNew: boolean;
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

let uidCounter = 0;
const uid = () => `t${Date.now()}_${uidCounter++}`;

function toDraft(type: ExamTypeDefinition): DraftType {
    const rule = type.pass_rule;
    return {
        uid: uid(), isNew: false, code: type.code, label: type.label, description: type.description || '',
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
    };
}

function emptyType(): DraftType {
    return {
        uid: uid(), isNew: true, code: '', label: '', description: '', active: true,
        score_mode: 'scaled', pass_mode: 'kkm', kkm: '75', total_passing_grade: '', subtests: [],
    };
}

export default function AdminExamTypesPage() {
    const [types, setTypes] = useState<DraftType[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = async () => {
        setLoading(true);
        const result = await getExamTypeCatalog();
        if (result.success) setTypes(result.catalog.types.map(toDraft));
        else setFeedback({ type: 'error', text: result.error || 'Jenis ujian gagal dimuat.' });
        setLoading(false);
    };

    useEffect(() => { void load(); }, []);

    const update = (index: number, fields: Partial<DraftType>) =>
        setTypes(list => list.map((item, i) => (i === index ? { ...item, ...fields } : item)));
    const updateSubtest = (index: number, subIndex: number, fields: Partial<DraftSubtest>) =>
        setTypes(list => list.map((item, i) => (i === index
            ? { ...item, subtests: item.subtests.map((subtest, j) => (j === subIndex ? { ...subtest, ...fields } : subtest)) }
            : item)));

    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);
        const result = await saveExamTypeCatalog({ types: types.map(fromDraft) });
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
                        Tambahkan jenis ujian yang bisa dipilih guru saat membuat ujian, beserta cara penilaian dan aturan kelulusannya.
                        Jenis bawaan (Ulangan Harian, ASAS/ASAT, AM, Try Out, Tugas, Lainnya) tetap tersedia.
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button variant="outline" leftIcon={<Plus size={16} />} onClick={() => setTypes(list => [...list, emptyType()])} disabled={loading}>
                        Tambah Jenis
                    </Button>
                    <Button variant="primary" icon="save" isLoading={saving} onClick={handleSave} disabled={loading}>
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

            {loading && <p className="text-sm text-slate-500">Memuat…</p>}
            {!loading && types.length === 0 && (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    Belum ada jenis ujian kustom. Klik “Tambah Jenis”.
                </div>
            )}

            {types.map((type, index) => (
                <section key={type.uid} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4" aria-label={type.label || 'Jenis ujian baru'}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                            <div>
                                <label className={labelClass}>Nama Jenis Ujian</label>
                                <input className={inputClass} value={type.label} maxLength={60} placeholder="Contoh: Ujian TO"
                                    onChange={e => update(index, { label: e.target.value, ...(type.isNew ? { code: examTypeCodeFromLabel(e.target.value) } : {}) })} />
                                <span className="text-[11px] text-slate-400 mt-1 block">Kode: {type.code || '-'}{type.isNew ? '' : ' (tetap)'}</span>
                            </div>
                            <div>
                                <label className={labelClass}>Cara Penilaian</label>
                                <select className={inputClass} value={type.score_mode}
                                    onChange={e => update(index, { score_mode: e.target.value as ExamScoreMode })}>
                                    <option value="scaled">{SCORE_MODE_LABELS.scaled} (proporsi skor ÷ skor maksimum)</option>
                                    <option value="raw">{SCORE_MODE_LABELS.raw} (jumlah semua skor yang diperoleh)</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className={labelClass}>Deskripsi (opsional)</label>
                                <input className={inputClass} value={type.description} maxLength={300}
                                    onChange={e => update(index, { description: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-700">
                                <input type="checkbox" checked={type.active} onChange={e => update(index, { active: e.target.checked })} />
                                Aktif
                            </label>
                            <button type="button" className="p-2 text-slate-400 hover:text-red-600" title="Hapus jenis"
                                aria-label={`Hapus jenis ${type.label}`}
                                onClick={() => setTypes(list => list.filter((_, i) => i !== index))}>
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Aturan Kelulusan</label>
                                <select className={inputClass} value={type.pass_mode}
                                    onChange={e => {
                                        const mode = e.target.value as ExamPassRule['mode'];
                                        update(index, {
                                            pass_mode: mode,
                                            ...(mode === 'passing_grade' && type.subtests.length === 0
                                                ? { subtests: [{ key: '', name: '', materi: '', passing_grade: '' }] } : {}),
                                        });
                                    }}>
                                    <option value="none">Tanpa status kelulusan</option>
                                    <option value="kkm">KKM (satu ambang nilai)</option>
                                    <option value="passing_grade">Passing grade per subtes</option>
                                </select>
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
        </div>
    );
}
