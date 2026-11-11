"use client";

import React, { useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Sparkles, CheckCircle2, LayoutDashboard, ChevronDown, Check, Lock } from 'lucide-react';
import { setActiveRoleInStorage, lockActiveRole, getDashboardPath, type Role } from '@/lib/rbac';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

interface LandingHeroProps {
    currentUser?: { id?: string; name?: string; email?: string; role?: string } | null;
}

export default function LandingHero({ currentUser }: LandingHeroProps) {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const highlights = [
        'Ujian CBT modern & responsif dengan auto-save realtime setiap detik.',
        'Sistem pengawasan terpadu dengan fullscreen lock & deteksi keluar jendela.',
        'Autentikasi akun Google resmi — akses cepat, aman, tanpa perlu kata sandi terpisah.',
    ];

    const handleGoogleAuth = async (credential: string) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential,
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

    const handleGoogleCredentialResponse = async (response: { credential?: string }) => {
        try {
            const token = response.credential;
            if (!token) throw new Error('Token Google tidak ditemukan.');
            // Token dikirim utuh; server yang memverifikasi dan membaca isinya.
            await handleGoogleAuth(token);
        } catch {
            setErrorMsg('Gagal memproses autentikasi akun Google.');
            setLoading(false);
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
        setErrorMsg(null);
        const googleObj = typeof window !== 'undefined' ? (window as unknown as { google?: { accounts?: { id: { prompt: (cb: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void } } } }).google : undefined;
        if (googleObj?.accounts?.id) {
            try {
                googleObj.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        setErrorMsg('Jendela login Google tertutup atau belum dipilih. Silakan klik kembali.');
                    }
                });
            } catch {
                setErrorMsg('Silakan gunakan tombol masuk di halaman login.');
            }
        } else {
            window.location.href = '/login';
        }
    };

    return (
        <section id="home" className="relative min-h-[92vh] md:min-h-screen flex items-center bg-white overflow-hidden pt-24 pb-16 md:pt-32 md:pb-20">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={initGoogleGsi}
            />

            {/* Subtle elegant background radial gradient blobs */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-blue-50/50 via-amber-50/30 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute top-1/2 -right-24 w-96 h-96 bg-amber-100/30 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="container mx-auto px-4 md:px-6 relative z-10 w-full">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
                    
                    {/* Left Column: Clean & Punchy Headlines */}
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="lg:col-span-7 space-y-6 md:space-y-7"
                    >
                        {/* Title */}
                        <div className="space-y-3">
                            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
                                Asesmen Digital Andal,{' '}
                                <span className="text-[#030C4D]">Cepat</span> &{' '}
                                <span className="text-[#F8A01B]">Berintegritas</span>
                            </h1>
                            <p className="text-slate-600 text-sm sm:text-base lg:text-lg leading-relaxed max-w-2xl font-normal">
                                Solusi ujian berbasis komputer modern dari <strong className="text-[#030C4D] font-bold">Unelma Edu Indonesia</strong>. Dirancang bersih, akurat, dan stabil untuk kelancaran evaluasi pembelajaran.
                            </p>
                        </div>

                        {/* Bullet Highlights */}
                        <ul className="space-y-3 pt-1 max-w-xl">
                            {highlights.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-3 text-slate-700 text-xs sm:text-sm leading-relaxed">
                                    <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                                        <Check size={12} strokeWidth={3} />
                                    </div>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-4 pt-3">
                            <button
                                type="button"
                                onClick={triggerGoogleSignIn}
                                className="px-6 py-3.5 rounded-xl bg-[#030C4D] hover:bg-[#0a1a5c] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-lg shadow-[#030C4D]/15 flex items-center gap-2.5 cursor-pointer"
                            >
                                <span>Mulai Masuk CBT</span>
                                <ArrowRight size={15} className="text-[#F8A01B]" />
                            </button>

                            <a
                                href="#keunggulan"
                                className="px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#030C4D] font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2"
                            >
                                <span>Lihat Keunggulan</span>
                                <ChevronDown size={15} />
                            </a>
                        </div>
                    </motion.div>

                    {/* Right Column: Clean White Authentication Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: 0.15 }}
                        className="lg:col-span-5 flex justify-center lg:justify-end"
                    >
                        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 p-7 sm:p-9 shadow-xl shadow-slate-200/50 relative overflow-hidden">
                            {/* Accent top bar */}
                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#030C4D] via-[#0a1a5c] to-[#F8A01B]" />

                            {currentUser ? (
                                /* Logged-in State Card */
                                <div className="space-y-6 text-center py-2">
                                    <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-[#030C4D] flex items-center justify-center mx-auto shadow-sm">
                                        <CheckCircle2 size={36} className="text-[#F8A01B]" />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-semibold mb-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span>Sesi Masuk Aktif</span>
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 truncate">
                                            {currentUser.name || currentUser.email}
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            Peran Aktif: <strong className="text-[#030C4D] font-bold uppercase">{currentUser.role || 'Pengguna'}</strong>
                                        </p>
                                    </div>

                                    <Link
                                        href="/dashboard"
                                        className="w-full py-3.5 px-4 rounded-xl bg-[#030C4D] hover:bg-[#0a1a5c] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                                    >
                                        <LayoutDashboard size={16} className="text-[#F8A01B]" />
                                        <span>Buka Halaman Dashboard</span>
                                    </Link>
                                </div>
                            ) : (
                                /* Guest Login Card */
                                <div className="space-y-5">
                                    <div className="space-y-1.5 text-center">
                                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#030C4D]/5 text-[#030C4D] mb-2 border border-[#030C4D]/10">
                                            <ShieldCheck size={26} className="text-[#030C4D]" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                                            Masuk Portal CBT
                                        </h3>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            Gunakan akun Google resmi Anda untuk masuk atau mendaftar otomatis sebagai peserta.
                                        </p>
                                    </div>

                                    {errorMsg && (
                                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs">
                                            {errorMsg}
                                        </div>
                                    )}

                                    {/* Google Sign-In Button */}
                                    <button
                                        type="button"
                                        onClick={triggerGoogleSignIn}
                                        disabled={loading}
                                        className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 text-xs sm:text-sm"
                                    >
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                                            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                                        </svg>
                                        <span>{loading ? 'Memproses Masuk...' : 'Masuk dengan Akun Google'}</span>
                                    </button>

                                    {/* Fallback to Manual Admin Login */}
                                    <div className="pt-2 text-center border-t border-slate-100 space-y-2">
                                        <p className="text-[11px] text-slate-500 leading-relaxed">
                                            Akun baru dibuat otomatis saat pertama login Google.
                                        </p>
                                        <Link
                                            href="/login"
                                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#030C4D] hover:text-[#F8A01B] transition-colors"
                                        >
                                            <Lock size={12} />
                                            <span>Opsi Masuk Manual / Proktor</span>
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
