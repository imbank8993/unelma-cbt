"use client";

import React, { useState } from 'react';
import { School, Layers, User, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

interface ProfileCompletionModalProps {
    isOpen: boolean;
    initialName?: string | null;
    onSaved: (schoolName: string, className: string, fullName: string) => void;
}

export default function ProfileCompletionModal({
    isOpen,
    initialName,
    onSaved,
}: ProfileCompletionModalProps) {
    const [fullName, setFullName] = useState(initialName || '');
    const [schoolName, setSchoolName] = useState('');
    const [className, setClassName] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolName.trim()) {
            setErrorMsg('Asal Sekolah wajib diisi.');
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/auth/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: fullName.trim() || undefined,
                    schoolName: schoolName.trim(),
                    className: className.trim() || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal menyimpan profil.');
            }

            onSaved(schoolName.trim(), className.trim(), fullName.trim());
        } catch (err) {
            setErrorMsg((err as Error).message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
                        <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Lengkapi Profil Siswa</h2>
                        <p className="text-xs text-slate-400">Selamat datang di Unelma CBT! Masukkan data sekolah & kelas Anda.</p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            Nama Lengkap Siswa
                        </label>
                        <div className="relative">
                            <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Nama Lengkap Siswa"
                                className="w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white rounded-xl py-2 pl-10 pr-4 text-xs outline-none transition-all placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            Asal Sekolah <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                            <School className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                required
                                autoFocus
                                value={schoolName}
                                onChange={(e) => setSchoolName(e.target.value)}
                                placeholder="Contoh: SMA Negeri 1 Makassar"
                                className="w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white rounded-xl py-2 pl-10 pr-4 text-xs outline-none transition-all placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                            Kelas <span className="text-slate-500 text-[10px] font-normal">(Opsional)</span>
                        </label>
                        <div className="relative">
                            <Layers className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={className}
                                onChange={(e) => setClassName(e.target.value)}
                                placeholder="Contoh: XII MIPA 1"
                                className="w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white rounded-xl py-2 pl-10 pr-4 text-xs outline-none transition-all placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                        <span>Data ini hanya perlu diisi sekali untuk identitas pengerjaan ujian Anda.</span>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer text-xs"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <span>Simpan & Masuk ke Dashboard</span>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
