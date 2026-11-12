'use client';

import Image from 'next/image';
import { getUserRole, type Role } from '@/lib/rbac';
import { getSessionUser } from '@/lib/session';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './sidebar.css';
import { InlineSelectIndicator } from '@/app/components/ui/inlineselect';

interface MenuItem {
    icon: string;
    label: string;
    href: string;
    badge?: number;
    children?: MenuItem[];
}

export interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (v: boolean) => void;
    isOpen?: boolean;
    setIsOpen?: (v: boolean) => void;
    activeRole?: { role: Role } | null;
}

export default function Sidebar({
    isCollapsed,
    setIsCollapsed,
    isOpen,
    setIsOpen,
    activeRole,
}: SidebarProps) {
    const pathname = usePathname();

    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [dbUserRole, setDbUserRole] = useState<string | null>(null);
    const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

    const handleMouseEnter = (idx: number) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setHoveredIdx(idx);
    };

    const handleMouseLeave = () => {
        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredIdx(null);
        }, 120);
    };

    const loadUserInfo = useCallback(async () => {
        const user = await getSessionUser();
        if (!user) return;
        const role = await getUserRole();
        if (role) setDbUserRole(role);
    }, []);

    useEffect(() => {
        const initialLoad = window.setTimeout(() => { void loadUserInfo(); }, 0);
        return () => window.clearTimeout(initialLoad);
    }, [loadUserInfo]);

    useEffect(() => {
        const handler = () => { void loadUserInfo(); };
        window.addEventListener('profile-updated', handler);
        return () => window.removeEventListener('profile-updated', handler);
    }, [loadUserInfo]);

    const getRole = (): Role => {
        if (activeRole?.role && activeRole.role !== 'None') {
            return activeRole.role;
        }
        if (pathname.includes('/admin')) return 'Admin';
        if (pathname.includes('/proktor')) return 'Proktor';
        if (pathname.includes('/guru')) return 'Proktor';
        if (pathname.includes('/siswa')) return 'Siswa';
        if (pathname.includes('/pengawas')) return 'Pengawas';
        return (dbUserRole as Role) || 'User';
    };

    const role = getRole();

    const menuConfig: Record<string, MenuItem[]> = useMemo(() => ({
        'Superadmin': [
            { icon: 'fa-house', label: 'Dashboard', href: '/dashboard/admin' },
            { icon: 'fa-graduation-cap', label: 'Ruang Belajar', href: '/dashboard/learning' },
            { icon: 'fa-users', label: 'Kelas', href: '/dashboard/admin/classes' },
            { icon: 'fa-book-open', label: 'Bank Soal', href: '/dashboard/admin/questions' },
            { icon: 'fa-shield-halved', label: 'Validasi Soal', href: '/dashboard/admin/questions/validations' },
            { icon: 'fa-clipboard-check', label: 'Ujian', href: '/dashboard/admin/exams' },
            { icon: 'fa-chart-line', label: 'Monitoring', href: '/dashboard/admin/monitoring' },
            {
                icon: 'fa-gear',
                label: 'Pengaturan',
                href: '/dashboard/admin/tokens',
                children: [
                    { icon: 'fa-coins', label: 'Paket Token', href: '/dashboard/admin/tokens' },
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
            { icon: 'fa-shield-halved', label: 'Validasi Soal', href: '/dashboard/admin/questions/validations' },
            { icon: 'fa-clipboard-check', label: 'Ujian', href: '/dashboard/admin/exams' },
            { icon: 'fa-chart-line', label: 'Monitoring', href: '/dashboard/admin/monitoring' },
            {
                icon: 'fa-gear',
                label: 'Pengaturan',
                href: '/dashboard/admin/tokens',
                children: [
                    { icon: 'fa-coins', label: 'Paket Token', href: '/dashboard/admin/tokens' },
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
            { icon: 'fa-shield-halved', label: 'Validasi Soal', href: '/dashboard/proktor/questions/validations' },
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
    }), []);

    const menuItems = useMemo(() => {
        const activeRoleName = activeRole?.role ?? role;
        return menuConfig[activeRoleName] || menuConfig['Admin'] || [];
    }, [menuConfig, role, activeRole]);

    // Auto expand parent submenu if current route matches any child
    useEffect(() => {
        menuItems.forEach((item) => {
            if (item.children?.some(child => pathname === child.href || pathname.startsWith(`${child.href}/`))) {
                setOpenSubmenus(prev => ({ ...prev, [item.label]: true }));
            }
        });
    }, [pathname, menuItems]);

    const toggleSubmenu = (label: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenSubmenus(prev => ({ ...prev, [label]: !prev[label] }));
    };

    const handleItemClick = () => {
        if (typeof window !== 'undefined' && window.innerWidth < 768 && setIsOpen) {
            setIsOpen(false);
        }
    };

    return (
        <>
            <div
                className={`sidebar-overlay ${isOpen ? 'show' : ''}`}
                onClick={() => setIsOpen && setIsOpen(false)}
            />

            <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-header">
                    <div className="brand-wrapper">
                        <button
                            type="button"
                            className="brand-logo-btn"
                            onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                                    setIsCollapsed(!isCollapsed);
                                }
                            }}
                            title={isCollapsed ? 'Bentangkan sidebar' : 'Kecilkan sidebar'}
                            aria-label={isCollapsed ? 'Bentangkan sidebar' : 'Kecilkan sidebar'}
                        >
                            <div className="brand-logo">
                                {!isCollapsed ? (
                                    <>
                                        <Image src="/logo-sidebar.png?v=2" alt="Unelma Logo" width={180} height={48} className="brand-logo-img light-logo" unoptimized priority />
                                        <Image src="/logo-sidebar-dark.png?v=2" alt="Unelma Logo" width={180} height={48} className="brand-logo-img dark-logo" unoptimized priority />
                                    </>
                                ) : (
                                    <>
                                        <Image src="/logo-sidebar-kecil.webp?v=2" alt="Unelma Logo" width={48} height={48} className="brand-logo-img light-logo" unoptimized priority />
                                        <Image src="/logo-sidebar-kecil-dark.webp?v=2" alt="Unelma Logo" width={48} height={48} className="brand-logo-img dark-logo" unoptimized priority />
                                    </>
                                )}
                            </div>
                        </button>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {/* MAIN MENU ITEMS */}
                    {menuItems.map((item, index) => {
                        const hasChildren = item.children && item.children.length > 0;
                        const isChildActive = hasChildren && item.children!.some(
                            child => pathname === child.href || pathname.startsWith(`${child.href}/`)
                        );

                        // Match logic for single item
                        const matches = (href: string) =>
                            !!href && (pathname === href || pathname.startsWith(href.endsWith('/') ? href : `${href}/`));
                        const activeHref = menuItems
                            .filter(m => !m.children)
                            .map((m) => m.href)
                            .filter(matches)
                            .sort((a, b) => b.length - a.length)[0];
                        const isActive = (!hasChildren && item.href === activeHref) || isChildActive;
                        const isSubmenuOpen = !!openSubmenus[item.label];

                        return (
                            <div
                                key={item.label || index}
                                className="menu-group"
                                onMouseEnter={() => handleMouseEnter(index)}
                                onMouseLeave={handleMouseLeave}
                            >
                                {hasChildren ? (
                                    <button
                                        type="button"
                                        className={`menu-btn ${isActive ? 'active' : ''} w-full justify-between`}
                                        onClick={(e) => toggleSubmenu(item.label, e)}
                                    >
                                        <div className="menu-content">
                                            <i className={`fa-solid ${item.icon} menu-icon`}></i>
                                            {!isCollapsed && (
                                                <span className="menu-label">{item.label}</span>
                                            )}
                                        </div>
                                        {!isCollapsed && (
                                            <InlineSelectIndicator size={16} className={`chevron transition-transform duration-200 ${isSubmenuOpen ? 'rotate' : ''}`} />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={item.href}
                                        className={`menu-btn ${isActive ? 'active' : ''}`}
                                        onClick={handleItemClick}
                                    >
                                        <div className="menu-content">
                                            <i className={`fa-solid ${item.icon} menu-icon`}></i>
                                            {!isCollapsed && (
                                                <span className="menu-label">{item.label}</span>
                                            )}
                                        </div>
                                    </Link>
                                )}

                                {/* Collapsible submenu in expanded sidebar */}
                                {!isCollapsed && hasChildren && (
                                    <div className={`submenu ${isSubmenuOpen ? 'open' : ''}`}>
                                        {item.children!.map((child) => {
                                            const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                                            return (
                                                <div key={child.href} className="submenu-row">
                                                    <Link
                                                        href={child.href}
                                                        className={`submenu-btn ${childActive ? 'active' : ''}`}
                                                        onClick={handleItemClick}
                                                    >
                                                        <i className={`fa-solid ${child.icon} text-xs mr-2 opacity-70`}></i>
                                                        <span className="menu-label">{child.label}</span>
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Tooltip for Collapsed State */}
                                {isCollapsed && hoveredIdx === index && (
                                    <div
                                        className="sidebar-tooltip"
                                        onMouseEnter={() => handleMouseEnter(index)}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        <div className="tooltip-header">
                                            <i className={`fa-solid ${item.icon}`}></i>
                                            <span>{item.label}</span>
                                        </div>
                                        {hasChildren && (
                                            <div className="tooltip-submenu">
                                                {item.children!.map((child) => {
                                                    const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                                                    return (
                                                        <Link
                                                            key={child.href}
                                                            href={child.href}
                                                            className={`tooltip-sub-btn ${childActive ? 'active' : ''}`}
                                                            onClick={handleItemClick}
                                                        >
                                                            <i className={`fa-solid ${child.icon} text-xs mr-2 opacity-70`}></i>
                                                            {child.label}
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
}
