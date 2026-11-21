"use client";

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { InlineSelect } from '@/app/components/ui/inlineselect';
import { getSettings, updateSetting } from '@/lib/api/settings';
import { deleteConfirmDialog } from '@/lib/confirm-dialog';
import {
    applyLearningProgramCatalog,
    DEFAULT_LEARNING_PROGRAMS,
    LEARNING_PROGRAM_CATALOG_SETTING_KEY,
    LEARNING_PROGRAM_CODE_PATTERN,
    SCHOOL_STAGE_CODES,
    LEARNING_PROGRAM_ICON_KEYS,
    normalizeLearningProgramCatalog,
    STRUCTURAL_LEARNING_PROGRAMS,
    toLearningProgramCatalog,
    type LearningProgramIcon,
    type LearningProgramItem,
} from '@/lib/learning-catalog';
import { PROGRAM_ICONS } from '@/app/components/student/programVisuals';

/**
 * Pengaturan → Pengaturan Daftar.
 *
 * Daftar program belajar (Sekolah, SNPDB, UTBK, CPNS, ...) yang dipakai sebagai:
 * (program "Sekolah" tampil bagi guru dan siswa sebagai jenjang SD, SMP, SMA)
 *  - kategori/filter di Ruang Belajar dan Jadwal siswa,
 *  - label saat membuat bahan ajar dan ujian,
 *  - pilihan tujuan belajar siswa. Siswa yang sudah memilih tujuan hanya
 *    melihat bahan ajar dan tryout berlabel tujuannya (label "Umum" tampil
 *    untuk semua siswa).
 *
 * Kode program tersimpan di data bahan ajar, ujian, dan tujuan siswa, jadi
 * tetap setelah disimpan. Program "Sekolah" (kelas 1–12) dan "Umum" tidak dapat
 * dihapus, hanya diganti nama atau disembunyikan.
 */

interface DraftProgram extends LearningProgramItem { uid: string; isNew: boolean }

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 outline-none focus:border-[#030C4D] bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100';
const labelClass = 'block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1';
const HUES = [217, 175, 262, 160, 24, 200, 330, 45, 0, 290, 120, 190];

let uidCounter = 0;
const uid = () => `p${Date.now()}_${uidCounter++}`;
const toDraft = (item: LearningProgramItem): DraftProgram => ({ ...item, uid: uid(), isNew: false });

/** "UTBK-SNBT" → "utbk_snbt": huruf kecil, angka, garis bawah, diawali huruf. */
function codeFromLabel(label: string, taken: Set<string>): string {
    let base = label.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '').slice(0, 28);
    if (base.length < 2) base = `program${base}`;
    let code = base; let n = 2;
    while (taken.has(code)) code = `${base}_${n++}`;
    return code;
}

export default function AdminProgramListPage() {
    const [programs, setPrograms] = useState<DraftProgram[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = async (refresh = false) => {
        setLoading(true);
        const result = await getSettings({ refresh });
        if (result.success) {
            const row = result.settings.find(item => item.key === LEARNING_PROGRAM_CATALOG_SETTING_KEY);
            const items = (row && normalizeLearningProgramCatalog(row.value)) || DEFAULT_LEARNING_PROGRAMS;
            setPrograms(items.map(toDraft));
            setDirty(false);
        } else setFeedback({ type: 'error', text: result.error || 'Daftar gagal dimuat.' });
        setLoading(false);
    };
    useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

    const change = (next: (list: DraftProgram[]) => DraftProgram[]) => { setPrograms(next); setDirty(true); };
    const update = (index: number, fields: Partial<DraftProgram>) =>
        change(list => list.map((item, i) => {
            if (i !== index) return item;
            const next = { ...item, ...fields };
            if (item.isNew && fields.label !== undefined) {
                next.value = codeFromLabel(fields.label, new Set([...SCHOOL_STAGE_CODES, ...list.filter((_, j) => j !== index).map(row => row.value)]));
            }
            return next;
        }));
    const move = (index: number, delta: number) => change(list => {
        const target = index + delta;
        if (target < 0 || target >= list.length) return list;
        const copy = [...list];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        return copy;
    });
    const add = () => change(list => [...list, {
        uid: uid(), isNew: true, value: '', label: '', hint: '', icon: 'book', active: true,
        hue: HUES[list.length % HUES.length],
    }]);
    const remove = async (index: number) => {
        const item = programs[index];
        const name = item.label.trim() || 'program baru ini';
        if (!item.isNew && !await deleteConfirmDialog(`Hapus ${name}?`,
            `${name} tidak lagi muncul sebagai filter, label bahan ajar/ujian, maupun pilihan tujuan siswa. Bahan ajar dan ujian yang sudah berlabel ${name} tetap ada tetapi tidak ditampilkan ke siswa sampai labelnya diganti. Untuk sementara saja, pilih "Sembunyikan".`)) return;
        change(list => list.filter((_, i) => i !== index));
    };

    const save = async () => {
        setFeedback(null);
        const problem = programs.find(item => !item.label.trim()) ? 'Setiap program wajib memiliki nama.'
            : programs.find(item => !LEARNING_PROGRAM_CODE_PATTERN.test(item.value)) ? 'Nama program baru harus mengandung huruf.' : '';
        if (problem) { setFeedback({ type: 'error', text: problem }); return; }
        setSaving(true);
        const result = await updateSetting(LEARNING_PROGRAM_CATALOG_SETTING_KEY, toLearningProgramCatalog(programs));
        setSaving(false);
        if (!result.success) { setFeedback({ type: 'error', text: result.error || 'Daftar gagal disimpan.' }); return; }
        applyLearningProgramCatalog(programs.map(item => ({ value: item.value, label: item.label, hint: item.hint, icon: item.icon, hue: item.hue, active: item.active })));
        setFeedback({ type: 'success', text: 'Daftar tersimpan. Filter Ruang Belajar, label bahan ajar/ujian, dan pilihan tujuan siswa sudah memakai daftar ini.' });
        await load(true);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-16">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                    Daftar ini menjadi kategori di Ruang Belajar, label saat membuat bahan ajar dan ujian, serta pilihan tujuan belajar siswa.
                    Siswa yang sudah memilih tujuan hanya melihat bahan ajar dan tryout berlabel tujuannya; label <b>Umum</b> tampil untuk semua siswa.
                </p>
                <div className="flex gap-2 shrink-0">
                    <Button variant="outline" leftIcon={<Plus size={16} />} onClick={add} disabled={loading}>Tambah Program</Button>
                    <Button variant="primary" icon="save" isLoading={saving} onClick={() => void save()} disabled={loading || !dirty}>Simpan</Button>
                </div>
            </div>

            {feedback && (
                <div role={feedback.type === 'error' ? 'alert' : 'status'} className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between gap-3 ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline text-xs">Tutup</button>
                </div>
            )}
            {dirty && !saving && (
                <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
                    Ada perubahan yang belum disimpan. Klik Simpan untuk menerapkannya.
                </p>
            )}
            {loading && <p className="text-sm text-slate-500">Memuat…</p>}

            {!loading && <ol className="space-y-3">
                {programs.map((item, index) => {
                    const structural = STRUCTURAL_LEARNING_PROGRAMS.includes(item.value);
                    const Icon = PROGRAM_ICONS[item.icon].icon;
                    return (
                        <li key={item.uid} className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${item.active ? 'border-slate-200 dark:border-slate-800' : 'border-dashed border-slate-300 opacity-80 dark:border-slate-700'}`}
                            aria-label={item.label || 'Program baru'}>
                            <div className="flex flex-wrap items-start gap-4">
                                <span className="program-tile mt-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ '--mark-hue': item.hue } as CSSProperties}><Icon size={20} /></span>
                                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.6fr_.9fr_.7fr]">
                                    <div>
                                        <label className={labelClass} htmlFor={`label-${item.uid}`}>Nama</label>
                                        <input id={`label-${item.uid}`} className={inputClass} value={item.label} maxLength={40} placeholder="Contoh: Olimpiade Sains"
                                            onChange={event => update(index, { label: event.target.value })} />
                                        <span className="mt-1 block text-[11px] text-slate-400">Kode: {item.value || '-'}{item.isNew ? '' : ' (tetap)'}{item.value === 'sekolah' ? ' · tampil sebagai SD, SMP, SMA (Kelas I–XII)' : ''}</span>
                                    </div>
                                    <div>
                                        <label className={labelClass} htmlFor={`hint-${item.uid}`}>Keterangan</label>
                                        <input id={`hint-${item.uid}`} className={inputClass} value={item.hint} maxLength={120} placeholder="Cakupan materi, mis. TPS · Literasi"
                                            onChange={event => update(index, { hint: event.target.value })} />
                                    </div>
                                    <div>
                                        <span className={labelClass}>Ikon</span>
                                        <InlineSelect value={item.icon} minWidth="100%" className="w-full" aria-label={`Ikon ${item.label}`}
                                            onChange={value => update(index, { icon: value as LearningProgramIcon })}
                                            options={LEARNING_PROGRAM_ICON_KEYS.map(key => ({ value: key, label: PROGRAM_ICONS[key].label }))} />
                                    </div>
                                    <div>
                                        <label className={labelClass} htmlFor={`hue-${item.uid}`}>Warna</label>
                                        <input id={`hue-${item.uid}`} type="range" min={0} max={359} value={item.hue} className="mt-2 w-full"
                                            style={{ accentColor: `hsl(${item.hue} 65% 45%)` }} onChange={event => update(index, { hue: Number(event.target.value) })} />
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <div className="flex items-center gap-1">
                                        <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label={`Naikkan ${item.label}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                                        <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label={`Turunkan ${item.label}`} disabled={index === programs.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                                        {!structural && <button type="button" className="ml-1 flex items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40"
                                            aria-label={`Hapus ${item.label}`} onClick={() => void remove(index)}><Trash2 size={13} /> Hapus</button>}
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                                        <input type="checkbox" checked={item.active} onChange={event => update(index, { active: event.target.checked })} />
                                        Tampilkan
                                    </label>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>}
        </div>
    );
}
