'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pengajuan proktor berada di luar aplikasi.
 * Redirect ke halaman luar /ajukan-proktor.
 */
export default function SiswaAjukanProktorRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/ajukan-proktor');
    }, [router]);
    return null;
}
