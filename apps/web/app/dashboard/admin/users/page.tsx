"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
    Users, 
    School,
    Shield, 
    UserCheck, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle, 
    ArrowLeft,
    Sparkles,
    GraduationCap,
    Trash2,
    UserPlus,
    X,
    Mail,
    User,
    Layers
} from 'lucide-react';
import { Spinner } from '@/app/components/ui/Spinner';

interface ManagedUser {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    schoolName: string | null;
    isSuperadmin: boolean;
    isPlatformAdmin: boolean;
    roles: string[];
    createdAt: string;
    lastSignInAt: string | null;
}

/** Balasan non-JSON (mis. 502 dari reverse proxy) tidak boleh memunculkan pesan "Unexpected token". */
async function readJson(res: Response): Promise<{ success?: boolean; error?: string; message?: string; data?: unknown }> {
    try {
        return await res.json();
    } catch {
        return { success: false, error: `Server membalas dengan status ${res.status}.` };
    }
}

/** Peran yang dikelola halaman ini; Pengawas dikelola di tempat lain dan dipertahankan. */
const MANAGED_ROLES = ['Admin', 'Proktor', 'Siswa'];

export default function AdminUsersPage() {
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Modal state for adding a new user
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({
        name: '',
        email: '',
        role: 'Siswa',
        schoolName: '',
        className: '',
    });
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/admin/users');
            const json = await readJson(res);
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Gagal memuat daftar pengguna.');
            }
            setUsers((json.data as ManagedUser[]) || []);
        } catch (err) {
            setToastMsg({ type: 'error', text: (err as Error).message });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const handleRoleChange = async (userId: string, targetEmail: string, newRole: string) => {
        setActionLoadingId(userId);
        setToastMsg(null);
        try {
            const res = await fetch(`/api/auth/admin/users/${encodeURIComponent(userId)}/role`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            const json = await readJson(res);
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Gagal mengubah peran pengguna.');
            }
            setToastMsg({ type: 'success', text: `Peran untuk ${targetEmail} berhasil diubah menjadi ${newRole}.` });
            await loadUsers();
        } catch (err) {
            setToastMsg({ type: 'error', text: (err as Error).message });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleDeleteUser = async (userId: string, targetEmail: string) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus akun ${targetEmail}? Seluruh profil dan data akun ini akan dihapus permanen.`)) {
            return;
        }

        setActionLoadingId(userId);
        setToastMsg(null);
        try {
            const res = await fetch(`/api/auth/admin/users/${encodeURIComponent(userId)}`, {
                method: 'DELETE',
            });
            const json = await readJson(res);
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Gagal menghapus pengguna.');
            }
            setToastMsg({ type: 'success', text: `Pengguna ${targetEmail} berhasil dihapus.` });
            await loadUsers();
        } catch (err) {
            setToastMsg({ type: 'error', text: (err as Error).message });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleAddUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddLoading(true);
        setAddError(null);

        try {
            const res = await fetch('/api/auth/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addForm),
            });
            const json = await readJson(res);
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Gagal membuat pengguna baru.');
            }

            setShowAddModal(false);
            setAddForm({
                name: '',
                email: '',
                role: 'Siswa',
                schoolName: '',
                className: '',
            });
            setToastMsg({ type: 'success', text: json.message || 'Pengguna baru berhasil ditambahkan.' });
            await loadUsers();
        } catch (err) {
            setAddError((err as Error).message);
        } finally {
            setAddLoading(false);
        }
    };

    const filteredUsers = users.filter((u) => {
        const query = search.toLowerCase();
        return (
            (u.email || '').toLowerCase().includes(query) ||
            (u.fullName || '').toLowerCase().includes(query) ||
            (u.schoolName || '').toLowerCase().includes(query) ||
            u.roles.some((r) => r.toLowerCase().includes(query))
        );
    });

    const getPrimaryRole = (u: ManagedUser): string => {
        if (u.isSuperadmin) return 'Superadmin';
        if (u.isPlatformAdmin || u.roles.some(r => r.toUpperCase() === 'ADMIN')) return 'Admin';
        if (u.roles.some(r => r.toUpperCase() === 'PROKTOR')) return 'Proktor';
        if (u.roles.some(r => r.toUpperCase() === 'PENGAWAS')) return 'Pengawas';
        return 'Siswa';
    };

    const getRoleBadge = (role: string) => {
        switch (role.toUpperCase()) {
            case 'SUPERADMIN':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                        <Sparkles className="w-3.5 h-3.5" /> Superadmin
                    </span>
                );
            case 'ADMIN':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        <Shield className="w-3.5 h-3.5" /> Admin
                    </span>
                );
            case 'PENGAWAS':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-700 border border-sky-500/20">
                        <Layers className="w-3.5 h-3.5" /> Pengawas
                    </span>
                );
            case 'PROKTOR':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        <UserCheck className="w-3.5 h-3.5" /> Proktor
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        <GraduationCap className="w-3.5 h-3.5" /> Siswa
                    </span>
                );
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-800">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Back button & Page Title */}
                <div>
                    <Link
                        href="/dashboard/admin"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Kembali ke Dashboard Admin
                    </Link>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                                <Users className="w-7 h-7 text-blue-600" />
                                Manajemen Pengguna & Penunjukan Peran
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">
                                Kelola hak akses aplikasi: <strong>Admin</strong>, <strong>Proktor</strong>, dan <strong>Siswa</strong>.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => {
                                    setAddError(null);
                                    setShowAddModal(true);
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                            >
                                <UserPlus className="w-4 h-4" />
                                Tambah Pengguna / Admin Baru
                            </button>

                            <button
                                onClick={loadUsers}
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Segarkan Data
                            </button>
                        </div>
                    </div>
                </div>

                {/* Toast Notification */}
                {toastMsg && (
                    <div
                        className={`p-4 rounded-xl text-sm flex items-start gap-3 border shadow-sm transition-all ${
                            toastMsg.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    >
                        {toastMsg.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <span className="font-medium">{toastMsg.text}</span>
                    </div>
                )}

                {/* Stats Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Total Pengguna</span>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{users.length}</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-xs uppercase tracking-wider text-blue-500 font-semibold">Admin</span>
                        <div className="text-2xl font-bold text-blue-600 mt-1">
                            {users.filter(u => u.isPlatformAdmin || u.roles.some(r => r.toUpperCase() === 'ADMIN')).length}
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-xs uppercase tracking-wider text-amber-500 font-semibold">Proktor</span>
                        <div className="text-2xl font-bold text-amber-600 mt-1">
                            {users.filter(u => u.roles.some(r => r.toUpperCase() === 'PROKTOR')).length}
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Siswa</span>
                        <div className="text-2xl font-bold text-slate-700 mt-1">
                            {users.filter(u => !u.isPlatformAdmin && !u.roles.some(r => ['ADMIN', 'PROKTOR'].includes(r.toUpperCase()))).length}
                        </div>
                    </div>
                </div>

                {/* Search & Table Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cari nama, email, sekolah..."
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-slate-400"
                            />
                        </div>
                        <div className="text-xs text-slate-500 font-medium">
                            Menampilkan {filteredUsers.length} dari {users.length} pengguna
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center">
                            <Spinner variant="buble" size={32} />
                            <p className="text-slate-500 text-sm mt-3">Memuat pengguna...</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="py-20 text-center text-slate-500 text-sm">
                            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            {search ? 'Tidak ada pengguna yang cocok dengan pencarian.' : 'Belum ada pengguna terdaftar.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        <th className="py-3.5 px-6">Pengguna</th>
                                        <th className="py-3.5 px-6">Asal Sekolah</th>
                                        <th className="py-3.5 px-6">Peran Saat Ini</th>
                                        <th className="py-3.5 px-6">Terdaftar Pada</th>
                                        <th className="py-3.5 px-6 text-right">Aksi & Peran</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {filteredUsers.map((u) => {
                                        const primaryRole = getPrimaryRole(u);
                                        const isActionLoading = actionLoadingId === u.id;

                                        return (
                                            <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                                                            {u.avatarUrl ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="font-bold text-sm text-slate-600">
                                                                    {(u.fullName || u.email || '?')[0].toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                                                {u.fullName || 'Pengguna Tanpa Nama'}
                                                                {u.isSuperadmin && (
                                                                    <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold uppercase">
                                                                        Superadmin
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-500">{u.email}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                                        <School className="w-4 h-4 text-slate-400 shrink-0" />
                                                        <span>{u.schoolName || '-'}</span>
                                                    </div>
                                                </td>

                                                <td className="py-4 px-6">
                                                    {getRoleBadge(primaryRole)}
                                                    {u.roles.length > 1 && (
                                                        <div className="mt-1 text-[10px] text-slate-500">
                                                            Peran: {u.roles.join(', ')}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="py-4 px-6 text-xs text-slate-500">
                                                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('id-ID', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    }) : '-'}
                                                </td>

                                                <td className="py-4 px-6 text-right">
                                                    {u.isSuperadmin ? (
                                                        <span className="text-xs font-semibold text-purple-700 bg-purple-100/80 px-3 py-1.5 rounded-lg border border-purple-200">
                                                            Pemilik Utama (Kebal)
                                                        </span>
                                                    ) : (
                                                        <div className="inline-flex items-center justify-end gap-2">
                                                            {isActionLoading && <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />}
                                                            <select
                                                                disabled={isActionLoading}
                                                                value={primaryRole === 'Superadmin' ? 'Admin' : MANAGED_ROLES.includes(primaryRole) ? primaryRole : ''}
                                                                onChange={(e) => {
                                                                    const next = e.target.value;
                                                                    if (next === 'Siswa' && !MANAGED_ROLES.includes(primaryRole)
                                                                        && !confirm(`Jadikan ${u.email} Siswa? Peran ${primaryRole} miliknya akan dicabut.`)) {
                                                                        return;
                                                                    }
                                                                    void handleRoleChange(u.id, u.email, next);
                                                                }}
                                                                className="bg-white border border-slate-300 hover:border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 font-medium text-xs rounded-xl px-3 py-1.5 outline-none transition-all cursor-pointer shadow-sm"
                                                            >
                                                                {!MANAGED_ROLES.includes(primaryRole) && primaryRole !== 'Superadmin' && (
                                                                    <option value="" disabled>{primaryRole} (pilih untuk mengubah)</option>
                                                                )}
                                                                <option value="Admin">Admin</option>
                                                                <option value="Proktor">Proktor</option>
                                                                <option value="Siswa">Siswa</option>
                                                            </select>

                                                            <button
                                                                type="button"
                                                                disabled={isActionLoading}
                                                                onClick={() => handleDeleteUser(u.id, u.email)}
                                                                title={`Hapus pengguna ${u.email}`}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer disabled:opacity-40"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Tambah Pengguna Baru */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-150">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                                <UserPlus className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Tambah Akun Pengguna</h3>
                                <p className="text-xs text-slate-500">Buat akun Admin, Proktor, atau Siswa secara manual.</p>
                            </div>
                        </div>

                        {addError && (
                            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{addError}</span>
                            </div>
                        )}

                        <form onSubmit={handleAddUserSubmit} className="space-y-3.5">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Nama Lengkap <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        required
                                        placeholder="Nama Pengguna"
                                        value={addForm.name}
                                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-900 text-xs rounded-xl py-2 pl-9 pr-3 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Email Akun <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="email"
                                        required
                                        placeholder="nama@email.com"
                                        value={addForm.email}
                                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-900 text-xs rounded-xl py-2 pl-9 pr-3 outline-none"
                                    />
                                </div>
                            </div>

                            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                                Akun didaftarkan tanpa password. Pemiliknya masuk dengan <strong>akun Google</strong> beremail sama,
                                dan peran yang Anda pilih langsung berlaku.
                            </p>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Peran / Role <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={addForm.role}
                                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-900 text-xs rounded-xl py-2 px-3 outline-none cursor-pointer"
                                >
                                    <option value="Admin">Admin (khusus Superadmin) — Hak Akses Penuh Kelola Ujian & Sekolah</option>
                                    <option value="Proktor">Proktor (Pengawas & Penyelenggara Ujian)</option>
                                    <option value="Siswa">Siswa (Peserta Ujian)</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                                        Asal Sekolah <span className="text-slate-400 font-normal">(Opsional)</span>
                                    </label>
                                    <div className="relative">
                                        <School className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            placeholder="Nama Sekolah"
                                            value={addForm.schoolName}
                                            onChange={(e) => setAddForm({ ...addForm, schoolName: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-900 text-xs rounded-xl py-2 pl-9 pr-3 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                                        Kelas <span className="text-slate-400 font-normal">(Opsional)</span>
                                    </label>
                                    <div className="relative">
                                        <Layers className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            placeholder="Mis: XII MIPA 1"
                                            value={addForm.className}
                                            onChange={(e) => setAddForm({ ...addForm, className: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white text-slate-900 text-xs rounded-xl py-2 pl-9 pr-3 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={addLoading}
                                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                                >
                                    {addLoading ? (
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <span>Simpan Akun</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
