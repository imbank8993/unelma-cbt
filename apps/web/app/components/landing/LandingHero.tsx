"use client";

import React, { useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowDown, ShieldCheck, Sparkles, CheckCircle2, LayoutDashboard, LogIn } from 'lucide-react';
import { setActiveRoleInStorage, lockActiveRole, getDashboardPath, type Role } from '@/lib/rbac';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

interface LandingHeroProps {
    currentUser?: { id?: string; name?: string; email?: string; role?: string } | null;
}

export default function LandingHero({ currentUser }: LandingHeroProps) {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showGoogleModal, setShowGoogleModal] = useState(false);

    const bullets = [
        'Aplikasi CBT dan Bimbingan Belajar untuk mendukung proses pembelajaran serta evaluasi pengetahuan secara modern.',
        'Layanan digital yang dapat disesuaikan dengan kebutuhan sekolah/madrasah dalam memperkuat tata kelola menuju Zona Integritas.',
        'Autentikasi tunggal akun Google resmi — akses aman, instan, tanpa repot mengingat kata sandi tambahan.'
    ];

    const handleGoogleAuth = async (googleEmail: string, googleName: string, avatarUrl?: string) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: googleEmail,
                    name: googleName,
                    avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleName)}`,
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
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            const payload = JSON.parse(jsonPayload);
            await handleGoogleAuth(payload.email, payload.name, payload.picture);
        } catch {
            setErrorMsg('Gagal memproses autentikasi Google.');
            setShowGoogleModal(true);
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
        <section id="home" className="relative min-h-[90vh] md:min-h-screen flex items-center overflow-hidden">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={initGoogleGsi}
            />

            {/* Background Cover */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: 'url(/layout.jpg)' }}
            />
            {/* Deep Navy Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#030C4D]/98 via-[#030C4D]/90 to-[#030C4D]/65" />

            <div className="container mx-auto px-4 md:px-6 relative z-10 w-full pt-28 pb-16 md:pt-36 md:pb-24">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
                    
                    {/* Left Column: Headlines */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        className="lg:col-span-7 space-y-6 md:space-y-8"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-[#F8A01B] text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Platform Ujian CBT & Bimbingan Belajar</span>
                        </div>

                        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white leading-[1.15] tracking-tight">
                            Solusi Sukses <span className="text-[#F8A01B]">Madrasah</span>
                        </h1>

                        <ul className="space-y-4 max-w-2xl">
                            {bullets.map((bullet, idx) => (
                                <li key={idx} className="flex items-start gap-3.5 text-white/85 text-sm sm:text-base leading-relaxed">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#F8A01B] mt-2 shrink-0 shadow-sm shadow-[#F8A01B]" />
                                    <span>{bullet}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            <a
                                href="#bank-soal"
                                className="px-6 py-3 rounded-xl bg-[#F8A01B] hover:bg-[#e08e15] text-[#030C4D] font-bold text-sm transition-all shadow-lg shadow-[#F8A01B]/25 flex items-center gap-2 cursor-pointer"
                            >
                                <span>Jelajahi Bank Soal</span>
                                <ArrowRight size={16} />
                            </a>
                            <a
                                href="#layanan"
                                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm backdrop-blur-md transition-all cursor-pointer"
                            >
                                Pelajari Layanan
                            </a>
                        </div>
                    </motion.div>

                    {/* Right Column: Google Login Box */}
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="lg:col-span-5 flex justify-center lg:justify-end"
                    >
                        <div className="w-full max-w-md bg-white/15 backdrop-blur-2xl rounded-3xl border border-white/25 p-6 sm:p-8 shadow-2xl shadow-black/40 text-white">
                            
                            {currentUser ? (
                                <div className="space-y-6 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#F8A01B] to-amber-400 text-[#030C4D] flex items-center justify-center mx-auto shadow-lg shadow-[#F8A01B]/30 font-black text-2xl">
                                        <CheckCircle2 size={36} />
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-white/70 font-semibold mb-1">
                                            Sesi Masuk Aktif
                                        </div>
                                        <h3 className="text-xl font-bold text-white">
                                            {currentUser.name || currentUser.email}
                                        </h3>
                                        <p className="text-xs text-white/80 mt-1">
                                            Peran: <strong className="text-[#F8A01B] uppercase">{currentUser.role || 'User'}</strong>
                                        </p>
                                    </div>

                                    <Link
                                        href="/dashboard"
                                        className="w-full py-3.5 px-4 rounded-xl bg-[#F8A01B] hover:bg-[#e08e15] text-[#030C4D] font-bold text-sm transition-all shadow-lg shadow-[#F8A01B]/30 flex items-center justify-center gap-2"
                                    >
                                        <LayoutDashboard size={18} />
                                        <span>Buka Halaman Dashboard</span>
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="text-center space-y-1.5">
                                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/15 text-white mb-2 shadow-inner">
                                            <ShieldCheck size={26} />
                                        </div>
                                        <h3 className="text-xl font-bold text-white tracking-tight">
                                            Masuk ke Unelma CBT
                                        </h3>
                                        <p className="text-xs text-white/75 leading-relaxed">
                                            Gunakan akun Google resmi Anda untuk masuk atau mendaftar otomatis sebagai siswa.
                                        </p>
                                    </div>

                                    {errorMsg && (
                                        <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-xs">
                                            {errorMsg}
                                        </div>
                                    )}

                                    {/* Google Sign In Button */}
                                    <button
                                        type="button"
                                        onClick={triggerGoogleSignIn}
                                        disabled={loading}
                                        className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 text-sm"
                                    >
                                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                                            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                                        </svg>
                                        <span>{loading ? 'Memproses Masuk...' : 'Masuk dengan Akun Google'}</span>
                                    </button>

                                    <div className="pt-2 text-center text-[11px] text-white/60 leading-relaxed">
                                        Akun baru otomatis dibuat saat pertama kali masuk. Data foto & profil disinkronkan langsung dari Google.
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>

                </div>

                {/* Bottom Scroll Indicator */}
                <div className="flex justify-center pt-8 md:pt-14">
                    <a
                        href="#bank-soal"
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-[#F8A01B] text-white hover:text-[#030C4D] border border-white/20 flex items-center justify-center transition-all animate-bounce cursor-pointer shadow-lg"
                        aria-label="Scroll down"
                    >
                        <ArrowDown size={18} />
                    </a>
                </div>
            </div>

            {/* Quick Google Test / Fallback Modal */}
            {showGoogleModal && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#030C4D] border border-white/20 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-white">
                        <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#F8A01B]" />
                            Masuk Cepat Akun Google
                        </h3>
                        <p className="text-xs text-white/70 mb-4">
                            Pilih akun untuk pengujian atau simulasi login Google:
                        </p>

                        <div
                            onClick={() => {
                                setShowGoogleModal(false);
                                handleGoogleAuth('imbank8993@gmail.com', 'Superadmin');
                            }}
                            className="p-3.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 cursor-pointer transition-all flex items-center justify-between mb-3 group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#F8A01B] text-[#030C4D] flex items-center justify-center font-bold text-sm shadow">
                                    IM
                                </div>
                                <div>
                                    <div className="text-sm font-semibold flex items-center gap-2">
                                        imbank8993@gmail.com
                                        <span className="text-[10px] bg-[#F8A01B] text-[#030C4D] px-2 py-0.5 rounded-full font-bold uppercase">
                                            Superadmin
                                        </span>
                                    </div>
                                    <div className="text-xs text-white/60">Administrator Utama</div>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowGoogleModal(false)}
                            className="mt-2 w-full py-2 text-xs text-white/60 hover:text-white cursor-pointer"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
