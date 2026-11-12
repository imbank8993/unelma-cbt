"use client";

import React, { useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { ArrowRight, BookOpen, LayoutDashboard, Lock } from 'lucide-react';
import { setActiveRoleInStorage, lockActiveRole, getDashboardPath, type Role } from '@/lib/rbac';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

interface LandingHeroProps {
    currentUser?: { id?: string; name?: string; email?: string; role?: string } | null;
}

export default function LandingHero({ currentUser }: LandingHeroProps) {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
                        window.location.href = '/login';
                    }
                });
            } catch {
                window.location.href = '/login';
            }
        } else {
            window.location.href = '/login';
        }
    };

    return (
        <section id="home" className="relative flex items-center overflow-hidden bg-gradient-to-b from-[#FFFBF2] to-white pb-4 pt-24 md:pb-20 md:pt-32 lg:min-h-[88vh]">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={initGoogleGsi}
            />

            {/* Satu sentuhan warna lembut di latar */}
            <div className="pointer-events-none absolute -right-32 top-10 h-[26rem] w-[26rem] rounded-full bg-amber-100/60 blur-3xl" />

            <div className="container relative z-10 mx-auto w-full px-4 md:px-6">
                <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">

                    {/* Kiri: pesan utama */}
                    <div className="space-y-6 lg:col-span-6">
                        <div className="space-y-4">
                            <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-[#030C4D] sm:text-5xl xl:text-[3.4rem]">
                                Belajar seru,{' '}
                                <span className="text-[#F8A01B]">latihan terarah</span>, siap hadapi ujian apa pun.
                            </h1>
                            <p className="max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">
                                Materi mudah dipahami dan latihan soal yang seru, dari pelajaran SD hingga persiapan UTBK, CPNS, dan PPPK.
                            </p>
                        </div>

                        {errorMsg && (
                            <div className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{errorMsg}</div>
                        )}

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            {currentUser ? (
                                <Link href="/dashboard"
                                    className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#030C4D] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#030C4D]/20 transition-all hover:-translate-y-0.5 hover:bg-[#0a1a5c]">
                                    <LayoutDashboard size={17} className="text-[#F8A01B]" />
                                    Lanjut belajar, {currentUser.name?.split(' ')[0] || 'kamu'}
                                </Link>
                            ) : (
                                <button type="button" onClick={triggerGoogleSignIn} disabled={loading}
                                    className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-[#030C4D] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#030C4D]/20 transition-all hover:-translate-y-0.5 hover:bg-[#0a1a5c] disabled:opacity-60">
                                    <GoogleMark />
                                    {loading ? 'Memproses…' : 'Mulai belajar gratis'}
                                    <ArrowRight size={16} className="text-[#F8A01B]" />
                                </button>
                            )}
                            <a href="#coba-soal"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 text-sm font-bold text-[#030C4D] transition-all hover:border-[#F8A01B] hover:text-[#c97d06]">
                                Coba 5 soal dulu
                            </a>
                        </div>
                        {!currentUser && (
                            <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#030C4D]"><Lock size={12} />Login sekolah / proktor</Link>
                        )}
                    </div>

                    {/* Kanan: pratinjau suasana belajar */}
                    <div className="relative mx-auto hidden w-full max-w-md md:block lg:col-span-6" aria-hidden="true">
                        <div className="absolute inset-6 rotate-3 rounded-[2.5rem] bg-gradient-to-br from-[#030C4D] to-[#2563EB]" />
                        <div className="relative space-y-4 rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/50 sm:p-7">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-400">Selamat pagi,</p>
                                    <p className="text-lg font-extrabold text-[#030C4D]">Nadia 👋</p>
                                </div>
                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">🎯 UTBK · 87 hari lagi</span>
                            </div>
                            <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 p-4">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#2563EB] shadow-sm"><BookOpen size={20} /></span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">Lanjutkan belajar</p>
                                        <p className="truncate text-sm font-bold text-slate-800">Penalaran Matematika · Barisan</p>
                                    </div>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#2563EB] to-sky-400" /></div>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-[#030C4D] px-4 py-3 text-white">
                                <span className="text-sm font-bold">Tryout Nasional #4</span>
                                <span className="rounded-lg bg-[#F8A01B] px-3 py-1 text-xs font-extrabold text-[#030C4D]">Mulai</span>
                            </div>
                        </div>

                    </div>

                </div>
            </div>
        </section>
    );
}

/** Logo Google kecil untuk tombol masuk. */
function GoogleMark() {
    return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
        </span>
    );
}
