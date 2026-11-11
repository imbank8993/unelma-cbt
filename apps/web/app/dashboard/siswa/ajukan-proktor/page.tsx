"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BadgeCheck, Clock, FileSignature, RefreshCw, XCircle } from 'lucide-react';
import {
    applyAsProctor,
    getMyProctorApplication,
    type ProctorApplication,
    type ProctorApplicationInput,
} from '@/lib/api/commissions';
import { clearActiveRoleInStorage } from '@/lib/rbac';

const EMPTY_FORM: ProctorApplicationInput = {
    full_name: '',
    nik: '',
    whatsapp: '',
    expertise: '',
    motivation: '',
    bank1_name: '',
    bank1_account_name: '',
    bank1_account_number: '',
    bank2_name: '',
    bank2_account_name: '',
    bank2_account_number: '',
};

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D] disabled:bg-slate-50';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1.5';

function formFrom(application: ProctorApplication | null): ProctorApplicationInput {
    if (!application) return EMPTY_FORM;
    return {
        full_name: application.full_name || '',
        nik: application.nik || '',
        whatsapp: application.whatsapp || '',
        expertise: application.expertise || '',
        motivation: application.motivation || '',
        bank1_name: application.bank1_name || '',
        bank1_account_name: application.bank1_account_name || '',
        bank1_account_number: application.bank1_account_number || '',
        bank2_name: application.bank2_name || '',
        bank2_account_name: application.bank2_account_name || '',
        bank2_account_number: application.bank2_account_number || '',
    };
}

export default function ApplyProctorPage() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [application, setApplication] = useState<ProctorApplication | null>(null);
    const [isProctor, setIsProctor] = useState(false);
    const [email, setEmail] = useState('');
    const [form, setForm] = useState<ProctorApplicationInput>(EMPTY_FORM);
    const [editing, setEditing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        const res = await getMyProctorApplication();
        if (!res.success) {
            setLoadError(String(res.error || 'Status pengajuan gagal dimuat.'));
        } else {
            setApplication(res.application);
            setIsProctor(Boolean(res.is_proctor));
            setEmail(res.email || '');
            setForm(formFrom(res.application));
            setEditing(!res.application || res.application.status === 'rejected');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const set = (key: keyof ProctorApplicationInput) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setFeedback(null);
        const res = await applyAsProctor(form);
        setSubmitting(false);
        if (!res.success) {
            setFeedback({ type: 'error', text: String(res.error || 'Pengajuan gagal dikirim.') });
            return;
        }
        setFeedback({ type: 'success', text: 'Pengajuan terkirim. Admin akan meninjaunya; status dapat dipantau di halaman ini.' });
        await load();
    };

    const openProctorDashboard = () => {
        try { clearActiveRoleInStorage(); } catch { /* storage diblokir */ }
        window.location.href = '/dashboard/proktor';
    };

    const status = application?.status;
    const formDisabled = submitting || !editing;

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-16">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                    <FileSignature className="text-[#030C4D]" size={24} />
                    <span>Ajukan Jadi Proktor</span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                    Proktor membuat bank soal, ujian, dan bahan ajar, serta menerima komisi dari konten berbayar. Pengajuan ditinjau oleh Admin.
                </p>
            </div>

            {loading ? (
                <div className="p-6 rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">Memuat status pengajuan...</div>
            ) : loadError ? (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><AlertCircle size={16} /> {loadError}</span>
                    <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-xs cursor-pointer flex items-center gap-1">
                        <RefreshCw size={12} /> Coba lagi
                    </button>
                </div>
            ) : isProctor ? (
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
                    <p className="font-bold flex items-center gap-2"><BadgeCheck size={18} /> Akun Anda sudah berperan Proktor.</p>
                    <button type="button" onClick={openProctorDashboard} className="px-4 py-2 rounded-xl bg-[#030C4D] text-white text-xs font-bold cursor-pointer">
                        Buka Dasbor Proktor
                    </button>
                </div>
            ) : (
                <>
                    {status === 'pending' && (
                        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-2">
                            <Clock size={18} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Pengajuan sedang ditinjau Admin.</p>
                                <p className="text-xs mt-0.5">
                                    Dikirim {application?.submitted_at ? new Date(application.submitted_at).toLocaleString('id-ID') : '-'}.
                                    Anda masih dapat memperbaiki data selama belum diproses.
                                </p>
                                {!editing && (
                                    <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-bold underline cursor-pointer">
                                        Perbarui data pengajuan
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {status === 'approved' && (
                        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-2">
                            <p className="font-bold flex items-center gap-2"><BadgeCheck size={18} /> Pengajuan disetujui.</p>
                            <button type="button" onClick={openProctorDashboard} className="px-4 py-2 rounded-xl bg-[#030C4D] text-white text-xs font-bold cursor-pointer">
                                Buka Dasbor Proktor
                            </button>
                        </div>
                    )}
                    {status === 'rejected' && (
                        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-sm flex items-start gap-2">
                            <XCircle size={18} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Pengajuan sebelumnya ditolak.</p>
                                {application?.rejection_reason && <p className="text-xs mt-0.5">Alasan: {application.rejection_reason}</p>}
                                <p className="text-xs mt-0.5">Perbaiki data di bawah lalu kirim ulang.</p>
                            </div>
                        </div>
                    )}

                    {feedback && (
                        <div className={`p-3.5 rounded-xl border text-sm font-semibold ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                            {feedback.text}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                        <fieldset disabled={formDisabled} className="space-y-6">
                            <section className="space-y-4">
                                <h2 className="text-sm font-bold text-slate-900">Identitas</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Email Akun Google</label>
                                        <input value={email} readOnly disabled className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nama Lengkap (sesuai KTP) *</label>
                                        <input required maxLength={150} value={form.full_name} onChange={set('full_name')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>NIK (16 digit) *</label>
                                        <input required inputMode="numeric" maxLength={20} value={form.nik} onChange={set('nik')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nomor WhatsApp *</label>
                                        <input required inputMode="tel" maxLength={25} placeholder="08xxxxxxxxxx" value={form.whatsapp} onChange={set('whatsapp')} className={inputClass} />
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h2 className="text-sm font-bold text-slate-900">Keahlian</h2>
                                <div>
                                    <label className={labelClass}>Bidang / Mata Pelajaran yang Dikuasai *</label>
                                    <input required minLength={3} maxLength={200} placeholder="Contoh: Matematika SMA, Fisika" value={form.expertise} onChange={set('expertise')} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Pengalaman & Alasan Mengajukan *</label>
                                    <textarea required minLength={20} maxLength={2000} rows={4} value={form.motivation} onChange={set('motivation')} className={inputClass}
                                        placeholder="Ceritakan pengalaman mengajar/menyusun soal dan rencana konten Anda (min. 20 karakter)." />
                                </div>
                            </section>

                            <section className="space-y-4">
                                <h2 className="text-sm font-bold text-slate-900">Rekening Penerima Komisi</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelClass}>Bank *</label>
                                        <input required maxLength={100} placeholder="BSI / BRI / ..." value={form.bank1_name} onChange={set('bank1_name')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nama Pemilik *</label>
                                        <input required maxLength={150} value={form.bank1_account_name} onChange={set('bank1_account_name')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nomor Rekening *</label>
                                        <input required inputMode="numeric" maxLength={40} value={form.bank1_account_number} onChange={set('bank1_account_number')} className={inputClass} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelClass}>Bank Cadangan (opsional)</label>
                                        <input maxLength={100} value={form.bank2_name} onChange={set('bank2_name')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nama Pemilik</label>
                                        <input maxLength={150} value={form.bank2_account_name} onChange={set('bank2_account_name')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Nomor Rekening</label>
                                        <input inputMode="numeric" maxLength={40} value={form.bank2_account_number} onChange={set('bank2_account_number')} className={inputClass} />
                                    </div>
                                </div>
                            </section>
                        </fieldset>

                        {editing && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                <p className="text-[11px] text-slate-500">
                                    Data identitas dan rekening hanya dapat dilihat Admin untuk verifikasi dan pembayaran komisi.
                                </p>
                                <button type="submit" disabled={submitting} className="px-6 py-2.5 rounded-xl bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
                                    {submitting ? 'Mengirim...' : status === 'pending' ? 'Simpan Perubahan' : 'Kirim Pengajuan'}
                                </button>
                            </div>
                        )}
                    </form>
                </>
            )}
        </div>
    );
}
