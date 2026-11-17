'use client';

import { getDashboardPageTitle } from '@/lib/dashboard-navigation';
import { usePathname } from 'next/navigation';

/** Teks judul banner mengikuti sumber yang sama dengan header dan sidebar. */
export default function DashboardPageTitle() {
    return getDashboardPageTitle(usePathname());
}
