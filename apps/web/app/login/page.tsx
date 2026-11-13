"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { getDashboardPath, type Role } from '@/lib/rbac';
import { setActiveRoleInStorage, lockActiveRole } from '@/lib/rbac';
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import './login.css';

/** Simbol belajar yang melayang pelan di latar (posisi, ukuran, durasi, jeda). */
const GLYPHS = [
    { char: '+', left: '6%', size: '28px', duration: '19s', delay: '0s' },
    { char: 'π', left: '16%', size: '34px', duration: '24s', delay: '-8s' },
    { char: 'A', left: '27%', size: '26px', duration: '21s', delay: '-3s' },
    { char: '√', left: '38%', size: '30px', duration: '26s', delay: '-14s' },
    { char: '×', left: '52%', size: '24px', duration: '18s', delay: '-6s' },
    { char: '?', left: '63%', size: '32px', duration: '23s', delay: '-11s' },
    { char: '÷', left: '74%', size: '28px', duration: '20s', delay: '-2s' },
    { char: 'B', left: '84%', size: '26px', duration: '25s', delay: '-16s' },
    { char: '=', left: '93%', size: '30px', duration: '22s', delay: '-9s' },
    { char: '%', left: '45%', size: '22px', duration: '28s', delay: '-20s' },
];
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '15496733034-vlkqs2ft95fgi3nnkbdm7eiq6i1ommem.apps.googleusercontent.com';

export default function LoginPage() {
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
                const width = Math.min(googleBtnContainerRef.current.offsetWidth || 320, 400);

                // Tombol resmi Google Sign-In (selalu membuka dialog autentikasi, tanpa
                // cooldown One-Tap). Isinya iframe Google, jadi tampilannya diatur lewat
                // opsi resmi: pill gelap senada warna navy Unelma.
                googleObj.accounts.id.renderButton(googleBtnContainerRef.current, {
                    theme: 'filled_black',
                    size: 'large',
                    type: 'standard',
                    text: 'continue_with',
                    shape: 'pill',
                    logo_alignment: 'left',
                    locale: 'id',
                    width: width > 200 ? width : 300,
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
        <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 font-sans text-slate-800 [color-scheme:light]">
            <Script
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onLoad={renderGoogleSignInButton}
            />

            {/* Latar animasi: gradasi lembut dan simbol belajar yang melayang */}
            <div className="login-bg" aria-hidden="true">
                <span className="login-orb is-blue" />
                <span className="login-orb is-amber" />
                <span className="login-orb is-violet" />
                {GLYPHS.map((glyph, index) => (
                    <span key={index} className="login-glyph"
                        style={{ left: glyph.left, fontSize: glyph.size, animationDuration: glyph.duration, animationDelay: glyph.delay }}>
                        {glyph.char}
                    </span>
                ))}
            </div>

            <div className="login-card relative z-10 w-full max-w-sm rounded-[2rem] border border-white/70 bg-white/80 p-8 text-center shadow-2xl shadow-slate-300/40 backdrop-blur-xl sm:p-10">
                <Link href="/" aria-label="Unelma, kembali ke beranda" className="mx-auto mb-4 block h-14 w-14 transition-transform hover:-translate-y-0.5">
                    <Image src="/unelma-mark.png" alt="Unelma" width={56} height={56} className="h-14 w-14 object-contain" priority />
                </Link>

                <h1 className="text-[1.65rem] font-extrabold tracking-tight text-[#030C4D]">Selamat datang!</h1>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Masuk untuk lanjut belajar dan latihan soal di Unelma.</p>

                {errorMsg && (
                    <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-xs text-red-600">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Tombol resmi Google Sign-In */}
                <div className="mt-7 flex w-full flex-col items-center justify-center">
                    <div className="login-google">
                        <div
                            ref={googleBtnContainerRef}
                            className={`flex w-full justify-center ${loading ? 'pointer-events-none opacity-40' : ''}`}
                        />

                        {!googleReady && !loading && (
                            <div className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#030C4D] px-4 text-xs font-semibold text-white/80">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Menyiapkan login Google…</span>
                            </div>
                        )}

                        {loading && (
                            <div className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#030C4D] px-4 text-xs font-semibold text-white">
                                <Loader2 className="h-4 w-4 animate-spin text-[#F8A01B]" />
                                <span>Memverifikasi akun Google…</span>
                            </div>
                        )}
                    </div>

                    {!googleReady && loadTimedOut && (
                        <button
                            type="button"
                            onClick={() => {
                                setLoadTimedOut(false);
                                renderGoogleSignInButton();
                            }}
                            className="mt-2 flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#030C4D] hover:underline"
                        >
                            <RefreshCw size={11} />
                            <span>Layanan belum muncul? Klik untuk memuat ulang</span>
                        </button>
                    )}
                </div>

                <p className="mt-4 text-[11px] text-slate-400">Belum punya akun? Akun dibuat otomatis saat pertama login.</p>

                <div className="mt-7 border-t border-slate-100 pt-5 text-xs text-slate-500">
                    Ingin menjadi proktor?{' '}
                    <Link href="/ajukan-proktor" className="font-bold text-[#030C4D] hover:text-[#F8A01B]">Ajukan di sini</Link>
                </div>
            </div>

            <Link href="/" className="relative z-10 mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-[#030C4D]">
                <ArrowLeft size={13} />
                <span>Kembali ke Beranda</span>
            </Link>
        </div>
    );
}
