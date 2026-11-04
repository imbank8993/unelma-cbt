"use client";

import React, { useEffect, useState } from 'react';
import LandingHeader from '@/app/components/landing/LandingHeader';
import LandingHero from '@/app/components/landing/LandingHero';
import LandingBankSoal from '@/app/components/landing/LandingBankSoal';
import LandingTokenPackages from '@/app/components/landing/LandingTokenPackages';
import LandingServices from '@/app/components/landing/LandingServices';
import LandingPosts from '@/app/components/landing/LandingPosts';
import LandingFooter from '@/app/components/landing/LandingFooter';
import { fetchSessionUser } from '@/lib/session';
import { setActiveRoleInStorage, lockActiveRole, getDashboardPath, type Role } from '@/lib/rbac';
import { useRouter } from 'next/navigation';

export default function Home() {
    const router = useRouter();
    const [currentUser, setCurrentUser] = useState<{ id?: string; name?: string; email?: string; role?: string } | null>(null);

    useEffect(() => {
        let isMounted = true;

        const checkAuth = async () => {
            try {
                const body = await fetchSessionUser();
                if (!isMounted || !body) return;

                const role = (body.bestRole || 'Siswa') as Role;
                if (role && role !== 'None') {
                    setCurrentUser({
                        id: body.id,
                        name: (body as any).nama || (body as any).name || body.email?.split('@')[0],
                        email: body.email,
                        role,
                    });

                    // Jika masuk dengan query SSO (?sso_role=), langsung arahkan ke dashboard
                    const searchParams = new URLSearchParams(window.location.search);
                    if (searchParams.get('sso_role')) {
                        setActiveRoleInStorage(role === 'Superadmin' ? 'Admin' : role);
                        lockActiveRole();
                        window.location.replace(getDashboardPath(role));
                    }
                }
            } catch {
                // Sesi publik / belum masuk
            }
        };

        void checkAuth();

        return () => {
            isMounted = false;
        };
    }, [router]);

    return (
        <main className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#F8A01B] selection:text-[#030C4D]">
            {/* 1. Header Nav */}
            <LandingHeader currentUser={currentUser} />

            {/* 2. Hero Section (with Google Sign-In) */}
            <LandingHero currentUser={currentUser} />

            {/* 3. Bank Soal Section */}
            <LandingBankSoal />

            {/* 4. Paket Token CBT */}
            <LandingTokenPackages />

            {/* 5. Layanan Unggulan */}
            <LandingServices />

            {/* 6. Berita & Informasi */}
            <LandingPosts />

            {/* 7. Footer */}
            <LandingFooter />
        </main>
    );
}
