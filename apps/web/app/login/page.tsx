"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { getDashboardPath, type Role } from '@/lib/rbac';
import { setActiveRoleInStorage, lockActiveRole } from '@/lib/rbac';
import { AlertCircle, ArrowLeft } from 'lucide-react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleGoogleAuth = async (
        credential: string,
        schoolName?: string,
        className?: string
    ) => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential,
                    schoolName: schoolName || undefined,
                    className: className || undefined,
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
        } catch (err) {
            setErrorMsg('Gagal memproses autentikasi Google. Silakan klik kembali atau muat ulang halaman.');
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
        const googleObj = typeof window !== 'undefined' ? (window as unknown as { google?: { accounts?: { id: { prompt: (cb: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void } } } }).google : undefined;
        if (googleObj?.accounts?.id) {
            try {
                googleObj.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        setErrorMsg('Pop-up Google tertutup atau belum dipilih. Silakan klik tombol masuk kembali.');
                    }
                });
            } catch {
                setErrorMsg('Silakan pilih akun Google Anda pada jendela masuk yang muncul.');
            }
        } else {
            setErrorMsg('Sedang memuat layanan Google. Silakan klik kembali atau muat ulang halaman.');
        }
    };


    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden text-slate-800">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={initGoogleGsi}
            />

            {/* Subtle soft ambient background accents */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-b from-blue-50/50 via-amber-50/30 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute -top-24 -left-24 w-80 h-80 bg-blue-100/30 rounded-full blur-3xl pointer-events-none -z-10" />
            <div className="absolute top-1/2 -right-24 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl pointer-events-none -z-10" />

            {/* Card Container */}
            <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/50 p-8 sm:p-10 relative overflow-hidden">
                {/* Accent top gradient bar */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#030C4D] via-[#0a1a5c] to-[#F8A01B]" />

                {/* Logo & Header */}
                <div className="text-center mb-6">
                    <Link href="/" className="inline-block group mb-3">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center p-2 group-hover:scale-105 transition-transform">
                            <Image
                                src="/unelma.png"
                                alt="Unelma Logo"
                                width={56}
                                height={56}
                                className="object-contain"
                                priority
                            />
                        </div>
                    </Link>

                    <h1 className="text-2xl font-black tracking-tight text-[#030C4D]">
                        Unelma CBT
                    </h1>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                        Platform Ujian & Asesmen Digital · <span className="text-[#F8A01B] font-bold">unelma.id</span>
                    </p>
                </div>

                {errorMsg && (
                    <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Information text */}
                <p className="text-xs text-slate-600 text-center leading-relaxed mb-5">
                    Gunakan akun Google resmi Anda untuk masuk atau mendaftar otomatis sebagai peserta ujian.
                </p>

                {/* Google Sign-In Button */}
                <button
                    type="button"
                    onClick={triggerGoogleSignIn}
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-800 font-semibold transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 mb-2 text-xs sm:text-sm"
                >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                    <span>{loading ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                </button>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed mb-6">
                    Data nama dan foto profil disinkronkan langsung dari akun Google Anda.
                </p>

                {/* Semua akun (Siswa, Proktor, Admin) masuk dengan Google. */}
                <div className="border-t border-slate-100 pt-5 text-center space-y-1.5">
                    <p className="text-xs font-semibold text-slate-700">Ingin menjadi Proktor (pembuat soal & bahan ajar)?</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        Masuk dengan akun Google Anda, lalu buka menu <strong>Ajukan Jadi Proktor</strong> dan lengkapi formulirnya.
                        Admin akan meninjau dan menyetujui pengajuan Anda.
                    </p>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="mt-6 text-center space-y-2">
                <Link
                    href="/"
                    className="text-xs font-semibold text-slate-500 hover:text-[#030C4D] transition-colors inline-flex items-center gap-1.5"
                >
                    <ArrowLeft size={13} />
                    <span>Kembali ke Beranda</span>
                </Link>
                <div className="text-[11px] text-slate-400">
                    © 2026 Unelma Edu Indonesia · <a href="https://unelma.id" target="_blank" rel="noopener noreferrer" className="hover:text-[#F8A01B] underline">unelma.id</a>
                </div>
            </div>
        </div>
    );
}
