"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDashboardPath, type Role } from '@/lib/rbac';
import { setActiveRoleInStorage, lockActiveRole } from '@/lib/rbac';
import { LogIn, Mail, Lock, ShieldCheck, UserCheck, AlertCircle, Sparkles } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Google modal simulation when Google Cloud Console is not yet configured
    const [showGoogleModal, setShowGoogleModal] = useState(false);
    const [customGoogleEmail, setCustomGoogleEmail] = useState('');
    const [customGoogleName, setCustomGoogleName] = useState('');

    const handleGoogleAuth = async (googleEmail: string, googleName: string) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: googleEmail,
                    name: googleName,
                    avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleName)}`,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal masuk dengan akun Google.');
            }

            const user = data.user;
            const role = (user?.bestRole || (user?.roles && user.roles[0]) || 'Siswa') as Role;
            setActiveRoleInStorage(role === 'Superadmin' ? 'Admin' : role);
            lockActiveRole();

            window.location.href = getDashboardPath(role);
        } catch (err) {
            setErrorMsg((err as Error).message);
            setLoading(false);
        }
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setErrorMsg('Email dan password wajib diisi.');
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Email atau password salah.');
            }

            const user = data.user;
            const role = (user?.bestRole || (user?.roles && user.roles[0]) || 'Siswa') as Role;
            setActiveRoleInStorage(role === 'Superadmin' ? 'Admin' : role);
            lockActiveRole();

            window.location.href = getDashboardPath(role);
        } catch (err) {
            setErrorMsg((err as Error).message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4 text-slate-100 font-sans">
            <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

                {/* Logo & Header */}
                <div className="text-center mb-8 relative">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30 mb-3">
                        <ShieldCheck className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Unelma CBT</h1>
                    <p className="text-slate-400 text-sm mt-1">Platform Ujian Berbasis Komputer</p>
                </div>

                {errorMsg && (
                    <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Google Sign-In Button */}
                <button
                    type="button"
                    onClick={() => setShowGoogleModal(true)}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-60 mb-6 cursor-pointer"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                    <span>Masuk dengan Google</span>
                </button>

                {/* Divider */}
                <div className="relative flex items-center justify-center mb-6">
                    <div className="border-t border-slate-700/80 w-full" />
                    <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider text-slate-500 font-medium">atau email</span>
                    <div className="border-t border-slate-700/80 w-full" />
                </div>

                {/* Email & Password Form */}
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Email
                        </label>
                        <div className="relative">
                            <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="nama@email.com"
                                className="w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white rounded-xl py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Password
                        </label>
                        <div className="relative">
                            <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white rounded-xl py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-slate-500"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" />
                                <span>Masuk</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Footer link to Signup */}
                <div className="mt-6 text-center text-sm text-slate-400">
                    Belum punya akun?{' '}
                    <Link href="/signup" className="text-blue-400 hover:text-blue-300 font-semibold hover:underline">
                        Daftar Akun Baru
                    </Link>
                </div>
            </div>

            {/* Google Account Modal (One-click Google Sign-In) */}
            {showGoogleModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-blue-400" />
                            Pilih Akun Google
                        </h3>
                        <p className="text-xs text-slate-400 mb-4">
                            Login instan dengan Google OAuth. Otomatis terdaftar ke sistem bila akun baru.
                        </p>

                        {/* Superadmin Card Button */}
                        <div
                            onClick={() => {
                                setShowGoogleModal(false);
                                handleGoogleAuth('imbank8993@gmail.com', 'Superadmin Unelma');
                            }}
                            className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 cursor-pointer transition-all flex items-center justify-between mb-3 group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow">
                                    IM
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                                        imbank8993@gmail.com
                                        <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold uppercase">
                                            Superadmin
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-400">Pemilik & Pengelola Utama Platform</div>
                                </div>
                            </div>
                            <UserCheck className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                        </div>

                        {/* Custom Google Account Form for Testing Other Roles */}
                        <div className="mt-4 pt-4 border-t border-slate-800">
                            <span className="text-xs text-slate-400 block mb-2 font-medium">Atau uji dengan akun Google lain:</span>
                            <div className="space-y-2">
                                <input
                                    type="email"
                                    value={customGoogleEmail}
                                    onChange={(e) => setCustomGoogleEmail(e.target.value)}
                                    placeholder="contoh: siswa@gmail.com"
                                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                                />
                                <input
                                    type="text"
                                    value={customGoogleName}
                                    onChange={(e) => setCustomGoogleName(e.target.value)}
                                    placeholder="Nama Lengkap"
                                    className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!customGoogleEmail) return;
                                        setShowGoogleModal(false);
                                        handleGoogleAuth(customGoogleEmail, customGoogleName || 'Pengguna Baru');
                                    }}
                                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-xs font-semibold transition-all"
                                >
                                    Masuk dengan Akun Ini
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowGoogleModal(false)}
                            className="mt-4 w-full py-2 text-xs text-slate-400 hover:text-white"
                        >
                            Batal
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
