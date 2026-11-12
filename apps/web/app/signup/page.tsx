"use client";

import { notify } from '@/lib/confirm-dialog';
import React, { useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { getDashboardPath, type Role } from '@/lib/rbac';
import { setActiveRoleInStorage, lockActiveRole } from '@/lib/rbac';
import { UserPlus, Mail, Lock, User, School, Layers, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

export default function SignupPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [schoolName, setSchoolName] = useState('');
    const [className, setClassName] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Google modal for quick student signup with Google account
    const [showGoogleModal, setShowGoogleModal] = useState(false);
    const [googleEmail, setGoogleEmail] = useState('');
    const [googleName, setGoogleName] = useState('');
    // ID token Google utuh; server memverifikasinya dan memakai email di dalamnya.
    const [googleCredential, setGoogleCredential] = useState('');

    const handleSignup = async (e?: React.FormEvent, customData?: { email: string; name: string; avatarUrl?: string; credential?: string }) => {
        if (e) e.preventDefault();

        const targetEmail = customData?.email || email;
        const targetName = customData?.name || name;

        if (!targetEmail || !targetName || !schoolName) {
            setErrorMsg('Email, Nama Lengkap, dan Asal Sekolah wajib diisi.');
            return;
        }

        if (!customData && !password) {
            setErrorMsg('Password wajib diisi untuk pendaftaran manual.');
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: targetEmail,
                    name: targetName,
                    schoolName: schoolName.trim(),
                    className: className.trim() || undefined,
                    password: customData?.credential ? undefined : (password || undefined),
                    credential: customData?.credential || undefined,
                    avatarUrl: customData?.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetName)}`,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Pendaftaran akun gagal.');
            }

            const user = data.user;
            const role = (user?.bestRole || 'Siswa') as Role;
            setActiveRoleInStorage(role === 'Superadmin' ? 'Admin' : role);
            lockActiveRole();

            window.location.href = getDashboardPath(role);
        } catch (err) {
            setErrorMsg((err as Error).message);
            setLoading(false);
        }
    };

    const handleGoogleCredentialResponse = async (response: { credential?: string }) => {
        try {
            const token = response.credential;
            if (!token) throw new Error('Token Google tidak ditemukan.');
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            // Isi token dibaca hanya untuk mengisi formulir; server tetap
            // memverifikasi token dan memakai email dari token itu.
            const payload = JSON.parse(jsonPayload);
            setGoogleCredential(token);
            setGoogleEmail(payload.email || '');
            setGoogleName(payload.name || '');
            setShowGoogleModal(true);
        } catch {
            setGoogleCredential('');
            setErrorMsg('Gagal memproses akun Google. Silakan coba lagi.');
        }
    };

    const initGoogleGsi = () => {
        if (typeof window !== 'undefined' && (window as unknown as { google?: { accounts?: { id: { initialize: (opts: unknown) => void } } } }).google?.accounts?.id) {
            try {
                (window as unknown as { google: { accounts: { id: { initialize: (opts: unknown) => void } } } }).google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleCredentialResponse,
                });
            } catch {
                // Ignore initialization error
            }
        }
    };

    const triggerGoogleSignIn = () => {
        const googleObj = typeof window !== 'undefined' ? (window as unknown as { google?: { accounts?: { id: { prompt: (cb: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void } } } }).google : undefined;
        if (googleObj?.accounts?.id) {
            try {
                googleObj.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        setShowGoogleModal(true);
                    }
                });
            } catch {
                setShowGoogleModal(true);
            }
        } else {
            setShowGoogleModal(true);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4 text-slate-100 font-sans">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={initGoogleGsi}
            />

            <div className="w-full max-w-lg bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

                {/* Logo & Header */}
                <div className="text-center mb-6 relative">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 mb-3">
                        <UserPlus className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Pendaftaran Siswa Baru</h1>
                    <p className="text-slate-400 text-sm mt-1">Lengkapi data diri untuk mengikuti ujian di Unelma CBT</p>
                </div>

                {errorMsg && (
                    <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Google Sign-Up Button */}
                <button
                    type="button"
                    onClick={triggerGoogleSignIn}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-60 mb-5 cursor-pointer text-sm"
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                    </svg>
                    <span>Daftar Cepat dengan Akun Google</span>
                </button>

                {/* Informasi Pendaftaran Google */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5 mb-5 text-xs text-blue-300/90 leading-relaxed text-center">
                    Pendaftaran akun baru dilakukan secara instan menggunakan akun Google. Foto profil & nama akan diambil langsung dari akun Google Anda.
                </div>

                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 text-slate-300 text-xs flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Akun baru otomatis terdaftar sebagai <strong>Siswa</strong>. Data asal sekolah & kelas dapat dilengkapi saat pertama kali masuk.</span>
                </div>

                {/* Footer link to Login */}
                <div className="mt-5 text-center text-sm text-slate-400">
                    Sudah memiliki akun?{' '}
                    <Link href="/login" className="text-blue-400 hover:text-blue-300 font-semibold hover:underline">
                        Masuk di Sini
                    </Link>
                </div>
            </div>

            {/* Google Quick Signup Modal */}
            {showGoogleModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-blue-400" />
                            Daftar dengan Akun Google
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">
                            Lengkapi asal sekolah dan kelas untuk menyelesaikan pendaftaran akun Google Anda.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">Email Google:</label>
                                <input
                                    type="email"
                                    value={googleEmail}
                                    readOnly
                                    placeholder="nama@gmail.com"
                                    className="w-full opacity-80 cursor-not-allowed bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] text-slate-400 mb-1">Nama Lengkap Siswa:</label>
                                <input
                                    type="text"
                                    value={googleName}
                                    onChange={(e) => setGoogleName(e.target.value)}
                                    placeholder="Nama Lengkap"
                                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">Asal Sekolah <span className="text-red-400">*</span>:</label>
                                    <input
                                        type="text"
                                        value={schoolName}
                                        onChange={(e) => setSchoolName(e.target.value)}
                                        placeholder="Nama Sekolah"
                                        className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">Kelas (Opsional):</label>
                                    <input
                                        type="text"
                                        value={className}
                                        onChange={(e) => setClassName(e.target.value)}
                                        placeholder="Contoh: XII MIPA 1"
                                        className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    if (!googleCredential) {
                                        void notify('Sesi Google tidak ditemukan. Klik tombol Google sekali lagi.');
                                        return;
                                    }
                                    if (!googleEmail || !googleName || !schoolName) {
                                        void notify('Email, Nama Lengkap, dan Asal Sekolah wajib diisi.');
                                        return;
                                    }
                                    setShowGoogleModal(false);
                                    handleSignup(undefined, { email: googleEmail, name: googleName, credential: googleCredential });
                                }}
                                className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow cursor-pointer"
                            >
                                Daftar Sekarang
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowGoogleModal(false)}
                                className="w-full py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
