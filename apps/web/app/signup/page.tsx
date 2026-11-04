"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getDashboardPath, type Role } from '@/lib/rbac';
import { setActiveRoleInStorage, lockActiveRole } from '@/lib/rbac';
import { UserPlus, Mail, Lock, User, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';

export default function SignupPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleGoogleSignup = async (googleEmail?: string, googleName?: string) => {
        const targetEmail = googleEmail || email;
        const targetName = googleName || name || 'Pengguna Baru';

        if (!targetEmail) {
            setErrorMsg('Silakan masukkan email Google Anda.');
            return;
        }

        setLoading(true);
        setErrorMsg(null);

        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: targetEmail,
                    name: targetName,
                    avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetName)}`,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal mendaftar dengan akun Google.');
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
                    <h1 className="text-2xl font-bold tracking-tight text-white">Daftar Akun Baru</h1>
                    <p className="text-slate-400 text-sm mt-1">Buat akun untuk masuk ke sistem Unelma CBT</p>
                </div>

                {errorMsg && (
                    <div className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Google Sign-Up Button */}
                <button
                    type="button"
                    onClick={() => handleGoogleSignup('imbank8993@gmail.com', 'Superadmin Unelma')}
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
                    <span>Daftar dengan Google</span>
                </button>

                {/* Divider */}
                <div className="relative flex items-center justify-center mb-6">
                    <div className="border-t border-slate-700/80 w-full" />
                    <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider text-slate-500 font-medium">atau formulir manual</span>
                    <div className="border-t border-slate-700/80 w-full" />
                </div>

                {/* Manual form */}
                <form onSubmit={(e) => { e.preventDefault(); handleGoogleSignup(email, name); }} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Nama Lengkap
                        </label>
                        <div className="relative">
                            <User className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nama Lengkap Anda"
                                className="w-full bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white rounded-xl py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-slate-500"
                            />
                        </div>
                    </div>

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

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold transition-all shadow-md shadow-blue-500/20 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <UserPlus className="w-5 h-5" />
                                <span>Daftar Sekarang</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Footer link to Login */}
                <div className="mt-6 text-center text-sm text-slate-400">
                    Sudah memiliki akun?{' '}
                    <Link href="/login" className="text-blue-400 hover:text-blue-300 font-semibold hover:underline">
                        Masuk di Sini
                    </Link>
                </div>
            </div>
        </div>
    );
}
