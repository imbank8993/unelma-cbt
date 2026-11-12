"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { Check, Target, X } from 'lucide-react';
import { useState } from 'react';
import { learningPrograms, type LearningProgram } from '@/lib/learning-catalog';
import type { LearningGoal } from '@/lib/learning-goal';
import { PROGRAM_VISUALS } from './programVisuals';

/** Pilih satu atau beberapa tujuan belajar, target, dan tanggal seleksi. */
export function LearningGoalModal({ open, initial, onClose, onSave }: {
    open: boolean;
    initial: LearningGoal | null;
    onClose: () => void;
    onSave: (goal: LearningGoal) => void;
}) {
    return <AnimatePresence>{open && <GoalForm initial={initial} onClose={onClose} onSave={onSave} />}</AnimatePresence>;
}

function GoalForm({ initial, onClose, onSave }: { initial: LearningGoal | null; onClose: () => void; onSave: (goal: LearningGoal) => void }) {
    const [programs, setPrograms] = useState<LearningProgram[]>(initial?.programs || []);
    const [target, setTarget] = useState(initial?.target || '');
    const [targetDate, setTargetDate] = useState(initial?.targetDate || '');
    const toggle = (value: LearningProgram) =>
        setPrograms(previous => previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="goal-title">
            <motion.form
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.2 }}
                onSubmit={event => {
                    event.preventDefault();
                    if (!programs.length) return;
                    onSave({ programs, target: target.trim() || undefined, targetDate: targetDate || undefined });
                }}
                className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 text-left shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl"
            >
                <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#030C4D] to-[#2563EB] text-white"><Target size={20} /></span>
                        <div>
                            <h2 id="goal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">Apa tujuan belajarmu?</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Beranda dan rekomendasi materi akan menyesuaikan. Boleh pilih lebih dari satu.</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {learningPrograms.map(item => {
                        const visual = PROGRAM_VISUALS[item.value];
                        const Icon = visual.icon;
                        const selected = programs.includes(item.value);
                        return (
                            <button key={item.value} type="button" aria-pressed={selected} onClick={() => toggle(item.value)}
                                className={`relative flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all ${selected
                                    ? 'border-[#030C4D] bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30'
                                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}`}>
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${visual.tile}`}><Icon size={19} /></span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{item.label}</span>
                                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.hint}</span>
                                </span>
                                {selected && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#030C4D] text-white dark:bg-blue-500"><Check size={12} /></span>}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px]">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Target (opsional)
                        <input value={target} maxLength={120} onChange={event => setTarget(event.target.value)} placeholder="Contoh: Lolos SKD dengan nilai 400"
                            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 outline-none focus:border-[#030C4D] focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Tanggal ujian/seleksi
                        <input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)}
                            className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 outline-none focus:border-[#030C4D] focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
                    </label>
                </div>

                <div className="mt-6 flex gap-2">
                    <button type="button" onClick={onClose} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Nanti saja</button>
                    <button type="submit" disabled={!programs.length}
                        className="flex-[2] rounded-xl bg-[#030C4D] py-2.5 text-sm font-bold text-white shadow-md shadow-[#030C4D]/20 transition-all hover:bg-[#2563EB] active:scale-95 disabled:opacity-50">
                        Simpan tujuan
                    </button>
                </div>
            </motion.form>
        </div>
    );
}
