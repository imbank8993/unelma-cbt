"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { getDashboardPath, type Role } from '@/lib/rbac';
import { setActiveRoleInStorage, lockActiveRole } from '@/lib/rbac';
import { AlertCircle, ArrowLeft, FileSignature, Loader2, RefreshCw } from 'lucide-react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [googleReady, setGoogleReady] = useState(false);
    const [loadTimedOut, setLoadTimedOut] = useState(false);
    const googleBtnContainerRef = useRef<HTMLDivElement>(null);

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

    const handleGoogleCredentialResponse = useCallback(async (response: { credential?: string }) => {
        try {
            const token = response.credential;
            if (!token) throw new Error('Token Google tidak ditemukan.');
            // Token dikirim utuh; server yang memverifikasi dan membaca isinya.
            await handleGoogleAuth(token);
        } catch {
            setErrorMsg('Gagal memproses autentikasi Google. Silakan klik kembali atau muat ulang halaman.');
            setLoading(false);
        }
    }, []);

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

        if (googleObj?.accounts?.id && googleBtnContainerRef.current) {
            try {
                googleObj.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleCredentialResponse,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });

                googleBtnContainerRef.current.innerHTML = '';
                const width = Math.min(googleBtnContainerRef.current.offsetWidth || 360, 400);

                // Render tombol resmi Google Sign-In yang selalu membuka dialog autentikasi
                // tanpa terkena rate-limiting / cooldown One-Tap.
                googleObj.accounts.id.renderButton(googleBtnContainerRef.current, {
                    theme: 'outline',
                    size: 'large',
                    type: 'standard',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                    width: width > 200 ? width : 340,
                });

                setGoogleReady(true);

                // Pasif One-Tap di latar belakang (tanpa error jika browser memblokirnya)
                try {
                    googleObj.accounts.id.prompt();
                } catch {
                    // Abaikan jika browser membatasi prompt otomatis
                }
            } catch (err) {
                console.error('Google Sign-In initialization error:', err);
            }
        }
    }, [handleGoogleCredentialResponse]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!googleReady) {
                renderGoogleSignInButton();
            }
        }, 300);

        const timeoutCheck = setTimeout(() => {
            if (!googleReady) {
                setLoadTimedOut(true);
            }
        }, 4000);

        return () => {
            clearTimeout(timer);
            clearTimeout(timeoutCheck);
        };
    }, [googleReady, renderGoogleSignInButton]);

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden text-slate-800">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={renderGoogleSignInButton}
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

                {/* Google Sign-In Official Button Container */}
                <div className="w-full flex flex-col items-center justify-center min-h-[46px] mb-2">
                    <div
                        ref={googleBtnContainerRef}
                        className={`w-full flex justify-center ${loading ? 'opacity-40 pointer-events-none' : ''}`}
                    />

                    {!googleReady && !loading && (
                        <div className="w-full py-3 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-[#030C4D]" />
                            <span>Menyiapkan layanan Google...</span>
                        </div>
                    )}

                    {loading && (
                        <div className="w-full py-3 px-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-medium text-xs flex items-center justify-center gap-2 mt-1">
                            <Loader2 className="w-4 h-4 animate-spin text-[#030C4D]" />
                            <span>Memverifikasi akun Google...</span>
                        </div>
                    )}

                    {!googleReady && loadTimedOut && (
                        <button
                            type="button"
                            onClick={() => {
                                setLoadTimedOut(false);
                                renderGoogleSignInButton();
                            }}
                            className="mt-2 text-[11px] text-[#030C4D] hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                        >
                            <RefreshCw size={11} />
                            <span>Layanan belum muncul? Klik untuk memuat ulang</span>
                        </button>
                    )}
                </div>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed mb-6">
                    Data nama dan foto profil disinkronkan langsung dari akun Google Anda.
                </p>

                {/* Pengajuan Proktor di luar aplikasi (role tunggal / tidak ganda) */}
                <div className="border-t border-slate-100 pt-5 text-center space-y-2.5">
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800">Ingin Menjadi Proktor?</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Proktor adalah peran mandiri (tidak merangkap Siswa) untuk membuat bank soal & ujian. Pendaftaran dilakukan di luar aplikasi dan ditinjau oleh Admin.
                        </p>
                    </div>
                    <Link
                        href="/ajukan-proktor"
                        className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-[#030C4D] text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-98"
                    >
                        <FileSignature size={14} className="text-[#030C4D]" />
                        <span>Formulir Pengajuan Proktor</span>
                    </Link>
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
