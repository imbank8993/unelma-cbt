export interface DashboardMenuItem {
    icon: string;
    label: string;
    href: string;
    badge?: number;
    children?: DashboardMenuItem[];
}

const menuConfig: Record<string, DashboardMenuItem[]> = {
    'Superadmin': [
        { icon: 'fa-house', label: 'Dashboard', href: '/dashboard/admin' },
        { icon: 'fa-graduation-cap', label: 'Ruang Belajar', href: '/dashboard/learning' },
        { icon: 'fa-users', label: 'Kelas', href: '/dashboard/admin/classes' },
        { icon: 'fa-book-open', label: 'Bank Soal', href: '/dashboard/admin/questions' },
        { icon: 'fa-clipboard-check', label: 'Ujian', href: '/dashboard/admin/exams' },
        { icon: 'fa-chart-line', label: 'Monitoring', href: '/dashboard/admin/monitoring' },
        {
            icon: 'fa-gear',
            label: 'Pengaturan',
            href: '/dashboard/admin/tokens',
            children: [
                { icon: 'fa-coins', label: 'Paket Token', href: '/dashboard/admin/tokens' },
                { icon: 'fa-list-check', label: 'Jenis Ujian', href: '/dashboard/admin/exam-types' },
                { icon: 'fa-receipt', label: 'Tracker Transaksi', href: '/dashboard/admin/transactions' },
                { icon: 'fa-hand-holding-dollar', label: 'Komisi & Pencairan', href: '/dashboard/admin/commissions' },
                { icon: 'fa-user-check', label: 'Permintaan Proktor', href: '/dashboard/admin/proctor-requests' },
                { icon: 'fa-user-gear', label: 'Kelola Pengguna', href: '/dashboard/admin/users' },
                { icon: 'fa-database', label: 'Backup Data', href: '/dashboard/admin/backup' },
            ],
        },
    ],
    'Admin': [
        { icon: 'fa-house', label: 'Dashboard', href: '/dashboard/admin' },
        { icon: 'fa-graduation-cap', label: 'Ruang Belajar', href: '/dashboard/learning' },
        { icon: 'fa-users', label: 'Kelas', href: '/dashboard/admin/classes' },
        { icon: 'fa-book-open', label: 'Bank Soal', href: '/dashboard/admin/questions' },
        { icon: 'fa-clipboard-check', label: 'Ujian', href: '/dashboard/admin/exams' },
        { icon: 'fa-chart-line', label: 'Monitoring', href: '/dashboard/admin/monitoring' },
        {
            icon: 'fa-gear',
            label: 'Pengaturan',
            href: '/dashboard/admin/tokens',
            children: [
                { icon: 'fa-coins', label: 'Paket Token', href: '/dashboard/admin/tokens' },
                { icon: 'fa-list-check', label: 'Jenis Ujian', href: '/dashboard/admin/exam-types' },
                { icon: 'fa-receipt', label: 'Tracker Transaksi', href: '/dashboard/admin/transactions' },
                { icon: 'fa-hand-holding-dollar', label: 'Komisi & Pencairan', href: '/dashboard/admin/commissions' },
                { icon: 'fa-user-check', label: 'Permintaan Proktor', href: '/dashboard/admin/proctor-requests' },
                { icon: 'fa-user-gear', label: 'Kelola Pengguna', href: '/dashboard/admin/users' },
                { icon: 'fa-database', label: 'Backup Data', href: '/dashboard/admin/backup' },
            ],
        },
    ],
    'Proktor': [
        { icon: 'fa-house', label: 'Dashboard', href: '/dashboard/proktor' },
        { icon: 'fa-graduation-cap', label: 'Ruang Belajar', href: '/dashboard/learning' },
        { icon: 'fa-users', label: 'Kelas', href: '/dashboard/proktor/classes' },
        { icon: 'fa-book-open', label: 'Bank Soal', href: '/dashboard/proktor/questions' },
        { icon: 'fa-clipboard-check', label: 'Ujian', href: '/dashboard/proktor/exams' },
        { icon: 'fa-chart-line', label: 'Monitoring', href: '/dashboard/proktor/monitoring' },
        { icon: 'fa-hand-holding-dollar', label: 'Komisi Saya', href: '/dashboard/proktor/commissions' },
    ],
    'Siswa': [
        { icon: 'fa-house', label: 'Dashboard', href: '/dashboard/siswa' },
        { icon: 'fa-graduation-cap', label: 'Ruang Belajar', href: '/dashboard/learning' },
        { icon: 'fa-users', label: 'Kelas', href: '/dashboard/siswa/classes' },
        { icon: 'fa-calendar', label: 'Jadwal', href: '/dashboard/siswa/schedule' },
        { icon: 'fa-chart-column', label: 'Hasil & Analisis', href: '/dashboard/siswa/results' },
        { icon: 'fa-coins', label: 'Token Saya', href: '/dashboard/siswa/tokens' },
    ],
    'Pengawas': [
        { icon: 'fa-house', label: 'Dashboard', href: '/dashboard/pengawas' },
        { icon: 'fa-eye', label: 'Monitoring', href: '/dashboard/pengawas/monitoring' },
        { icon: 'fa-file-signature', label: 'Administrasi', href: '/dashboard/pengawas/administration' },
    ],
};

export function getDashboardMenu(role?: string): DashboardMenuItem[] {
    return menuConfig[role || 'Admin'] || menuConfig.Admin;
}

/** Judul mengikuti menu paling spesifik, termasuk submenu dan halaman detail. */
export function getDashboardMenuTitle(pathname: string, role?: string): string | undefined {
    // Rute Guru lama tetap dilayani untuk peran Proktor.
    const path = pathname.replace(/\/$/, '').replace(/^\/dashboard\/guru(?=\/|$)/, '/dashboard/proktor');
    const routeRole = /^\/dashboard\/(admin|proktor|siswa|pengawas)(?:\/|$)/.exec(path)?.[1];
    const menuRole = routeRole ? routeRole.charAt(0).toUpperCase() + routeRole.slice(1) : role;
    const items = getDashboardMenu(menuRole).flatMap(item => item.children || [item]);
    return items
        .filter(item => path === item.href || (item.label !== 'Dashboard' && path.startsWith(`${item.href}/`)))
        .sort((a, b) => b.href.length - a.href.length)[0]?.label;
}

/** Satu sumber judul untuk header dan banner; nama segmen URL bukan judul halaman. */
export function getDashboardPageTitle(pathname: string, role?: string): string {
    const menuTitle = getDashboardMenuTitle(pathname, role) ?? getDashboardMenuTitle(pathname);
    if (menuTitle) return menuTitle;

    const path = pathname.replace(/\/$/, '');
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/dashboard/admin/settings') return getDashboardMenuTitle('/dashboard/admin/tokens')!;
    if (path === '/dashboard/siswa/analytics') return getDashboardMenuTitle('/dashboard/siswa/results')!;
    if (/^\/dashboard\/[^/]+\/pas(?:\/|$)/.test(path)) return 'Ujian';
    if (/^\/dashboard\/siswa\/exam(?:\/|$)/.test(path)) return 'Ujian';
    if (/^\/dashboard\/guru\/analytics(?:\/|$)/.test(path)) return 'Analitik & Statistik';
    if (/^\/dashboard\/guru\/grading(?:\/|$)/.test(path)) return 'Laporan & Penilaian Ujian';
    if (/^\/dashboard\/[^/]+\/assignments(?:\/|$)/.test(path)) return 'Review Tugas';
    if (/^\/dashboard\/(?:siswa\/)?ajukan-proktor$/.test(path)) return 'Ajukan Proktor';
    return 'Detail';
}
