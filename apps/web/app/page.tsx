"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LandingHeader from '@/app/components/landing/LandingHeader';
import LandingHero from '@/app/components/landing/LandingHero';
import LandingFeatures from '@/app/components/landing/LandingFeatures';
import LandingWorkflow from '@/app/components/landing/LandingWorkflow';
import LandingFooter from '@/app/components/landing/LandingFooter';
import { fetchSessionUser, clearSessionCache } from '@/lib/session';
import { clearActiveRoleInStorage, setActiveRoleInStorage, lockActiveRole, getDashboardPath, type Role } from '@/lib/rbac';
import { resetAndRetrySso } from '@/lib/session-reset';
import { clearMemoryCache } from '@/lib/useMemoryState';

type SsoFailure = { title: string; message: string; retryOnly?: boolean };

export default function Home() {
    const router = useRouter();
    const [failure, setFailure] = useState<SsoFailure | null>(null);
    const [resetting, setResetting] = useState(false);
    const [currentUser, setCurrentUser] = useState<{ id?: string; name?: string; email?: string; role?: string } | null>(null);

    useEffect(() => {
        let isRedirecting = false;
        let settled = false;
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;

        const VALID_SSO_ROLES = ['Superadmin', 'Admin', 'Proktor', 'Guru', 'Pengawas', 'Siswa'];
        const searchStr = typeof window !== 'undefined' ? window.location.search : '';
        const urlParams = new URLSearchParams(searchStr);
        const ssoRoleParam = urlParams.get('sso_role') || '';
        const ssoRole = (VALID_SSO_ROLES.includes(ssoRoleParam) ? ssoRoleParam : null) as Role | null;
        const hasErrorParam = searchStr.includes('error=');

        if (ssoRoleParam) {
            clearSessionCache();
            try {
                clearActiveRoleInStorage();
                clearMemoryCache();
            } catch {}
        }

        const fail = (title: string, message: string, retryOnly = false) => {
            if (cancelled) return;
            isRedirecting = true;
            setFailure({ title, message, retryOnly });
        };

        const checkCbtSession = async (): Promise<boolean> => {
            try {
                const body = await fetchSessionUser();
                if (cancelled) return true;
                if (!body) return false;

                settled = true;
                isRedirecting = true;

                const role = (body.bestRole || ssoRole || 'Siswa') as Role;
                if (role === 'None') {
                    fail(
                        'Akses Ditolak',
                        'Anda belum memiliki peran aktif di CBT. Hubungi proktor atau admin sekolah.',
                    );
                    return true;
                }

                // Jika pengguna datang lewat SSO hand-off, arahkan langsung ke dasbor tujuan
                if (ssoRoleParam) {
                    setActiveRoleInStorage(role === 'Superadmin' ? 'Admin' : role);
                    lockActiveRole();
                    window.location.replace(getDashboardPath(role));
                    return true;
                }

                // Kunjungan biasa ke landing page: set data pengguna untuk header
                setCurrentUser({
                    id: body.id,
                    name: body.fullName || body.email,
                    email: body.email,
                    role: role,
                });
                return true;
            } catch {
                if (ssoRoleParam || hasErrorParam) {
                    fail(
                        'Sesi belum dapat diperiksa',
                        'Server atau koneksi sedang bermasalah. Sesi Anda tetap disimpan. Silakan coba lagi.',
                        true,
                    );
                    return true;
                }
                return false;
            }
        };

        const checkSession = async () => {
            if (hasErrorParam) {
                const msg = urlParams.get('error') === 'cbt-session-unavailable'
                    ? 'Sesi CBT belum terbaca atau sudah berakhir. Gunakan tombol di bawah untuk memperbarui sesi dari ACCA tanpa berpindah browser. Pastikan cookie situs diizinkan.'
                    : urlParams.get('msg') || urlParams.get('error') || 'Terjadi kesalahan pada proses masuk.';
                fail('Gagal Masuk ke CBT', msg);
                return;
            }

            if (await checkCbtSession()) return;

            if (typeof window !== 'undefined' && window.location.hash.includes('token=')) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            // Jika ada handoff SSO dari sistem induk tapi cookie belum terbaca, beri waktu sebelum fail
            if (ssoRoleParam) {
                retryTimer = setTimeout(async () => {
                    if (cancelled || settled || isRedirecting) return;
                    if (await checkCbtSession()) return;

                    fail(
                        'Sesi CBT belum tersimpan',
                        'Proses masuk dari ACCA selesai, tetapi cookie sesi CBT belum terbaca. Pastikan alamat menggunakan HTTPS dan cookie situs diizinkan, lalu coba masuk kembali.',
                    );
                }, 1500);
            }
        };

        void checkSession();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [router]);

    if (failure) {
        return (
            <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200/80 max-w-md w-full text-center">
                    <h1 className="text-xl font-bold text-slate-800 mb-2">{failure.title}</h1>
                    <p className="text-slate-500 mb-6 text-sm leading-relaxed">{failure.message}</p>
                    <button
                        onClick={async () => {
                            if (failure.retryOnly) {
                                window.location.reload();
                                return;
                            }
                            setResetting(true);
                            await resetAndRetrySso();
                        }}
                        disabled={resetting}
                        className="w-full bg-[#030C4D] hover:bg-[#020510] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-sm cursor-pointer"
                    >
                        {failure.retryOnly ? 'Coba Lagi' : resetting ? 'Membersihkan…' : 'Bersihkan Sesi & Coba Lagi'}
                    </button>
                    <Link
                        href="/login"
                        className="mt-3 block w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 rounded-xl transition-all text-sm"
                    >
                        Ke Halaman Login
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#F8A01B] selection:text-[#030C4D]">
            {/* 1. Header Nav */}
            <LandingHeader currentUser={currentUser} />

            {/* 2. Hero Section (White background with blue & orange accents) */}
            <LandingHero currentUser={currentUser} />

            {/* 3. Keunggulan Platform CBT */}
            <LandingFeatures />

            {/* 4. Alur Pelaksanaan Ujian */}
            <LandingWorkflow />

            {/* 5. Footer */}
            <LandingFooter />
        </main>
    );
}
