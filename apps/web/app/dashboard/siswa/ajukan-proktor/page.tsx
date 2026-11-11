'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Halaman lama — dialihkan ke URL baru yang lebih umum.
 * URL baru: /dashboard/ajukan-proktor
 */
export default function AjukanProktorRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard/ajukan-proktor');
    }, [router]);
    return null;
}
