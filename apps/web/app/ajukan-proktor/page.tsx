"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import {
    AlertCircle,
    ArrowLeft,
    BadgeCheck,
    Clock,
    FileSignature,
    HelpCircle,
    Loader2,
    RefreshCw,
    ShieldAlert,
    XCircle,
} from 'lucide-react';
import {
    applyAsProctor,
    getMyProctorApplication,
    type ProctorApplication,
    type ProctorApplicationInput,
} from '@/lib/api/commissions';
import { clearActiveRoleInStorage, lockActiveRole, setActiveRoleInStorage } from '@/lib/rbac';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

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

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D] disabled:bg-slate-50 transition-all';
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

export default function PublicApplyProctorPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [application, setApplication] = useState<ProctorApplication | null>(null);
    const [isProctor, setIsProctor] = useState(false);
    const [email, setEmail] = useState('');
    const [form, setForm] = useState<ProctorApplicationInput>(EMPTY_FORM);
    const [editing, setEditing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [authRequired, setAuthRequired] = useState(false);
    const [googleReady, setGoogleReady] = useState(false);
    const googleBtnRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        const res = await getMyProctorApplication();
        if (!res.success) {
            // Jika belum login, tampilkan tombol masuk dengan Google
            if (res.unauthorized || (typeof res.error === 'string' && res.error.toLowerCase().includes('sesi'))) {
                setAuthRequired(true);
                setLoading(false);
                return;
            }
            setLoadError(String(res.error || 'Status pengajuan gagal dimuat.'));
        } else {
            setAuthRequired(false);
            setApplication(res.application);
            setIsProctor(Boolean(res.is_proctor));
            setEmail(res.email || '');
            setForm(formFrom(res.application));
            setEditing(!res.application || res.application.status === 'rejected');
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Google Sign-In untuk otentikasi calon Proktor di luar aplikasi
    const handleGoogleCredentialResponse = useCallback(async (response: { credential?: string }) => {
        try {
            const token = response.credential;
            if (!token) throw new Error('Token Google tidak ditemukan.');
            setLoading(true);
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: token }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal masuk dengan akun Google.');
            }
            setAuthRequired(false);
            await load();
        } catch (err) {
            setFeedback({ type: 'error', text: (err as Error).message || 'Gagal autentikasi Google.' });
            setLoading(false);
        }
    }, [load]);

    const renderGoogleSignInButton = useCallback(() => {
        if (typeof window === 'undefined') return;
        const googleObj = (window as unknown as {
            google?: {
                accounts?: {
                    id: {
                        initialize: (opts: unknown) => void;
                        renderButton: (el: HTMLElement, opts: unknown) => void;
                        prompt: () => void;
                    };
                };
            };
        }).google;

        if (googleObj?.accounts?.id && googleBtnRef.current) {
            try {
                googleObj.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleCredentialResponse,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });
                googleBtnRef.current.innerHTML = '';
                const width = Math.min(googleBtnRef.current.offsetWidth || 340, 380);
                googleObj.accounts.id.renderButton(googleBtnRef.current, {
                    theme: 'outline',
                    size: 'large',
                    type: 'standard',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                    width: width > 200 ? width : 340,
                });
                setGoogleReady(true);
            } catch (e) {
                console.error('Google button render error:', e);
            }
        }
    }, [handleGoogleCredentialResponse]);

    useEffect(() => {
        if (authRequired) {
            const timer = setTimeout(() => {
                renderGoogleSignInButton();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [authRequired, renderGoogleSignInButton]);

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
        setFeedback({ type: 'success', text: 'Pengajuan Proktor berhasil dikirim. Administrator akan memverifikasi permohonan Anda.' });
        await load();
    };

    const openProctorDashboard = () => {
        try {
            clearActiveRoleInStorage();
            setActiveRoleInStorage('Proktor');
            lockActiveRole();
        } catch { /* storage */ }
        window.location.href = '/dashboard/proktor';
    };

    const status = application?.status;
    const formDisabled = submitting || !editing;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans py-10 px-4 sm:px-6 relative overflow-x-hidden">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={renderGoogleSignInButton}
            />

            {/* Subtle soft ambient background accents */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-blue-100/40 via-indigo-50/30 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="w-10 h-10 flex items-center justify-center hover:-translate-y-0.5 transition-transform shrink-0">
                            <Image src="/unelma-mark.png" alt="Unelma Logo" width={40} height={40} className="h-10 w-10 object-contain" />
                        </Link>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-[#030C4D] tracking-tight flex items-center gap-2">
                                <FileSignature className="text-[#030C4D]" size={24} />
                                <span>Pengajuan Menjadi Proktor</span>
                            </h1>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Formulir pendaftaran resmi pembuat bank soal & konten pembelajaran di Unelma CBT
                            </p>
                        </div>
                    </div>

                    <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#030C4D] px-3.5 py-2 rounded-xl bg-white border border-slate-200 shadow-xs transition-colors self-start sm:self-auto"
                    >
                        <ArrowLeft size={14} />
                        <span>Ke Halaman Login</span>
                    </Link>
                </div>

                {/* Info Card: Ketentuan Peran */}
                <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/60 text-xs text-slate-700 space-y-1.5">
                    <p className="font-bold text-[#030C4D] flex items-center gap-1.5">
                        <ShieldAlert size={15} className="text-[#030C4D]" />
                        Ketentuan Peran Akun (Role Tunggal / Tidak Ganda):
                    </p>
                    <p className="leading-relaxed">
                        Peran <strong>Proktor</strong> adalah peran khusus untuk menyusun bank soal, mengelola ujian, dan bahan ajar berbayar.
                        Satu akun hanya memiliki satu peran aktif dan <strong>tidak merangkap peran Siswa</strong>. Pengajuan akan ditinjau dan diverifikasi oleh Administrator sebelum diaktifkan.
                    </p>
                </div>

                {/* State: Memuat */}
                {loading ? (
                    <div className="p-10 rounded-2xl bg-white border border-slate-200 text-sm text-slate-500 flex flex-col items-center justify-center gap-3 shadow-xs">
                        <Loader2 className="w-6 h-6 animate-spin text-[#030C4D]" />
                        <span>Memuat data pengajuan...</span>
                    </div>
                ) : authRequired ? (
                    /* State: Belum Login dengan Google */
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 sm:p-10 text-center space-y-6">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#030C4D]">
                            <FileSignature size={28} />
                        </div>
                        <div className="space-y-1.5 max-w-md mx-auto">
                            <h2 className="text-lg font-bold text-slate-900">Hubungkan Akun Google Anda</h2>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Pengajuan menjadi Proktor diverifikasi langsung dengan akun Google resmi Anda. Silakan masuk terlebih dahulu untuk mengisi formulir pengajuan.
                            </p>
                        </div>

                        <div className="flex flex-col items-center justify-center min-h-[46px]">
                            <div ref={googleBtnRef} className="w-full flex justify-center" />
                            {!googleReady && (
                                <div className="py-3 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-[#030C4D]" />
                                    <span>Menyiapkan tombol Google...</span>
                                </div>
                            )}
                        </div>

                        <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                            Sudah memiliki akun Siswa? <Link href="/login" className="text-[#030C4D] font-bold hover:underline">Masuk sebagai Siswa</Link>
                        </div>
                    </div>
                ) : loadError ? (
                    /* State: Error */
                    <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-semibold flex items-center justify-between gap-3 shadow-xs">
                        <span className="flex items-center gap-2"><AlertCircle size={16} /> {loadError}</span>
                        <button type="button" onClick={() => void load()} className="px-3.5 py-1.5 rounded-xl bg-white border border-red-300 text-xs cursor-pointer flex items-center gap-1 shadow-xs">
                            <RefreshCw size={12} /> Coba lagi
                        </button>
                    </div>
                ) : isProctor ? (
                    /* State: Sudah Berperan Proktor */
                    <div className="p-8 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-4 shadow-sm text-center">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                            <BadgeCheck size={32} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-lg font-bold text-emerald-900">Akun Anda Sudah Berperan Proktor</h2>
                            <p className="text-xs text-emerald-800 max-w-md mx-auto">
                                Akun Google ({email}) telah aktif sebagai Proktor di Unelma CBT. Anda dapat langsung membuka Dasbor Proktor untuk menyusun bank soal dan ujian.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={openProctorDashboard}
                            className="px-6 py-3 rounded-xl bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold cursor-pointer transition-all shadow-md active:scale-95"
                        >
                            Buka Dasbor Proktor
                        </button>
                    </div>
                ) : (
                    /* State: Formulir & Status */
                    <>
                        {status === 'pending' && (
                            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-sm flex items-start gap-3 shadow-xs">
                                <Clock size={20} className="shrink-0 text-amber-600 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-bold text-amber-900">Pengajuan Proktor Sedang Ditinjau Administrator</p>
                                    <p className="text-xs text-amber-800 leading-relaxed">
                                        Permohonan dikirim pada {application?.submitted_at ? new Date(application.submitted_at).toLocaleString('id-ID') : '-'}.
                                        Selama menunggu verifikasi, peran akun Anda tidak aktif sebagai Siswa agar peran tidak ganda. Anda dapat memperbarui data di bawah jika ada kesalahan.
                                    </p>
                                    {!editing && (
                                        <button
                                            type="button"
                                            onClick={() => setEditing(true)}
                                            className="mt-2 text-xs font-bold text-amber-900 underline cursor-pointer"
                                        >
                                            Perbarui Data Pengajuan
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {status === 'approved' && (
                            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm space-y-3 shadow-xs">
                                <p className="font-bold flex items-center gap-2 text-emerald-900"><BadgeCheck size={20} className="text-emerald-600" /> Pengajuan Anda telah disetujui!</p>
                                <p className="text-xs text-emerald-800">Peran Proktor telah aktif. Silakan masuk ke Dasbor Proktor untuk mulai bekerja.</p>
                                <button type="button" onClick={openProctorDashboard} className="px-5 py-2.5 rounded-xl bg-[#030C4D] text-white text-xs font-bold cursor-pointer shadow-sm">
                                    Buka Dasbor Proktor
                                </button>
                            </div>
                        )}

                        {status === 'rejected' && (
                            <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-red-950 text-sm flex items-start gap-3 shadow-xs">
                                <XCircle size={20} className="shrink-0 text-red-600 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-bold text-red-900">Pengajuan Sebelumnya Belum Disetujui</p>
                                    {application?.rejection_reason && <p className="text-xs text-red-800 font-medium">Alasan: {application.rejection_reason}</p>}
                                    <p className="text-xs text-red-700">Silakan lengkapi atau perbaiki data di bawah, lalu kirim ulang permohonan Anda.</p>
                                </div>
                            </div>
                        )}

                        {feedback && (
                            <div className={`p-4 rounded-xl border text-sm font-semibold shadow-xs ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                                {feedback.text}
                            </div>
                        )}

                        {/* Formulir Pendaftaran Proktor */}
                        <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/40 p-6 sm:p-8 space-y-6">
                            <fieldset disabled={formDisabled} className="space-y-6">
                                <section className="space-y-4">
                                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-[#030C4D] text-white text-[10px] flex items-center justify-center font-bold">1</span>
                                        <span>Identitas Calon Proktor</span>
                                    </h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelClass}>Email Akun Google (Terverifikasi)</label>
                                            <input value={email} readOnly disabled className={`${inputClass} bg-slate-50 font-medium text-slate-600`} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Nama Lengkap (sesuai KTP) *</label>
                                            <input required maxLength={150} placeholder="Nama lengkap Anda" value={form.full_name} onChange={set('full_name')} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>NIK (16 digit nomor KTP) *</label>
                                            <input required inputMode="numeric" maxLength={20} placeholder="Contoh: 3201..." value={form.nik} onChange={set('nik')} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Nomor WhatsApp Aktif *</label>
                                            <input required inputMode="tel" maxLength={25} placeholder="08xxxxxxxxxx" value={form.whatsapp} onChange={set('whatsapp')} className={inputClass} />
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-4 pt-2 border-t border-slate-100">
                                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-[#030C4D] text-white text-[10px] flex items-center justify-center font-bold">2</span>
                                        <span>Bidang Keahlian & Pengalaman</span>
                                    </h2>
                                    <div>
                                        <label className={labelClass}>Mata Pelajaran / Bidang yang Dikuasai *</label>
                                        <input required minLength={3} maxLength={200} placeholder="Contoh: Matematika SMA, Bahasa Inggris, dll." value={form.expertise} onChange={set('expertise')} className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Pengalaman & Alasan Mengajukan *</label>
                                        <textarea required minLength={20} maxLength={2000} rows={4} value={form.motivation} onChange={set('motivation')} className={inputClass}
                                            placeholder="Ceritakan pengalaman mengajar / membuat soal ujian dan rencana konten Anda (minimal 20 karakter)." />
                                    </div>
                                </section>

                                <section className="space-y-4 pt-2 border-t border-slate-100">
                                    <div className="space-y-1">
                                        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-[#030C4D] text-white text-[10px] flex items-center justify-center font-bold">3</span>
                                            <span>Rekening Penerima Komisi</span>
                                        </h2>
                                        <p className="text-[11px] text-slate-500">
                                            Diperlukan untuk pencairan komisi bank soal dan materi ajar berbayar.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className={labelClass}>Nama Bank *</label>
                                            <input required maxLength={100} placeholder="BSI / BCA / BRI / Mandiri" value={form.bank1_name} onChange={set('bank1_name')} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Nama Pemilik Rekening *</label>
                                            <input required maxLength={150} placeholder="Harus sama dengan nama KTP" value={form.bank1_account_name} onChange={set('bank1_account_name')} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Nomor Rekening *</label>
                                            <input required inputMode="numeric" maxLength={40} placeholder="Nomor rekening bank" value={form.bank1_account_number} onChange={set('bank1_account_number')} className={inputClass} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                                        <div>
                                            <label className={labelClass}>Bank Cadangan (opsional)</label>
                                            <input maxLength={100} placeholder="Nama bank cadangan" value={form.bank2_name} onChange={set('bank2_name')} className={inputClass} />
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
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-5">
                                    <p className="text-[11px] text-slate-500 max-w-sm">
                                        Dengan mengirimkan formulir, Anda menyetujui ketentuan peran Proktor Unelma CBT.
                                    </p>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="px-7 py-3 rounded-xl bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold disabled:opacity-60 cursor-pointer shadow-md transition-all active:scale-95 shrink-0"
                                    >
                                        {submitting ? 'Mengirim Data...' : status === 'pending' ? 'Simpan Perubahan' : 'Kirim Pengajuan Proktor'}
                                    </button>
                                </div>
                            )}
                        </form>
                    </>
                )}

                {/* Footer Info */}
                <div className="text-center space-y-2 pt-4">
                    <p className="text-xs text-slate-500">
                        Pertanyaan seputar Proktor? <a href="https://unelma.id" target="_blank" rel="noopener noreferrer" className="text-[#030C4D] font-bold hover:underline">Kunjungi unelma.id</a>
                    </p>
                    <div className="text-[11px] text-slate-400">
                        © 2026 Unelma Edu Indonesia · Platform CBT & Asesmen Digital
                    </div>
                </div>
            </div>
        </div>
    );
}
