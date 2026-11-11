'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pengajuan proktor berada di luar aplikasi.
 * Redirect ke halaman publik /ajukan-proktor.
 */
export default function DashboardAjukanProktorRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/ajukan-proktor');
    }, [router]);
    return null;
}
