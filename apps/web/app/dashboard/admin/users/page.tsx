"use client";

import { confirmDialog, deleteConfirmDialog } from '@/lib/confirm-dialog';
import React, { useState, useEffect, useCallback } from 'react';
import {
    Users,
    School,
    Search,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Trash2,
    UserPlus,
    X,
    Mail,
    User,
    Layers
} from 'lucide-react';
import { Spinner } from '@/app/components/ui/Spinner';
import { InlineSelect } from '@/components/ui/InlineSelect';

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
    const [roleFilter, setRoleFilter] = useState('');
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
        if (!await deleteConfirmDialog('Hapus akun pengguna?', `Akun ${targetEmail} beserta seluruh profil dan datanya akan dihapus permanen.`)) {
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

    const getPrimaryRole = (u: ManagedUser): string => {
        if (u.isSuperadmin) return 'Superadmin';
        if (u.isPlatformAdmin || u.roles.some(r => r.toUpperCase() === 'ADMIN')) return 'Admin';
        if (u.roles.some(r => r.toUpperCase() === 'PROKTOR')) return 'Proktor';
        if (u.roles.some(r => r.toUpperCase() === 'PENGAWAS')) return 'Pengawas';
        return 'Siswa';
    };

    const filteredUsers = users.filter((u) => {
        const query = search.toLowerCase();
        const role = getPrimaryRole(u);
        // Superadmin ikut kelompok Admin pada filter peran.
        if (roleFilter && (role === 'Superadmin' ? 'Admin' : role) !== roleFilter) return false;
        return (
            (u.email || '').toLowerCase().includes(query) ||
            (u.fullName || '').toLowerCase().includes(query) ||
            (u.schoolName || '').toLowerCase().includes(query) ||
            u.roles.some((r) => r.toLowerCase().includes(query))
        );
    });

    const getRoleBadge = (role: string) => {
        // Satu gaya netral; Admin/Superadmin cukup dibedakan dengan aksen navy.
        const elevated = ['SUPERADMIN', 'ADMIN'].includes(role.toUpperCase());
        return (
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                elevated ? 'bg-[#030C4D]/10 text-[#030C4D]' : 'bg-slate-100 text-slate-600'
            }`}>
                {role}
            </span>
        );
    };

    return (
        <div className="max-w-7xl mx-auto pb-16 text-slate-800">
            <div className="space-y-6">
                {/* Back button & Page Title */}
                <div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-xl font-semibold text-slate-900">
                                Kelola Pengguna
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
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#030C4D] hover:bg-[#030C4D]/90 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                            >
                                <UserPlus className="w-4 h-4" />
                                Tambah Pengguna
                            </button>

                            <button
                                onClick={loadUsers}
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Segarkan
                            </button>
                        </div>
                    </div>
                </div>

                {/* Toast Notification */}
                {toastMsg && (
                    <div
                        className={`p-4 rounded-xl text-sm flex items-start gap-3 border transition-all ${
                            toastMsg.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-red-50 border-red-200 text-red-700'
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
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                        <span className="text-xs text-slate-500">Total Pengguna</span>
                        <div className="text-2xl font-semibold text-slate-900 mt-1">{users.length}</div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                        <span className="text-xs text-slate-500">Admin</span>
                        <div className="text-2xl font-semibold text-slate-900 mt-1">
                            {users.filter(u => u.isPlatformAdmin || u.roles.some(r => r.toUpperCase() === 'ADMIN')).length}
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                        <span className="text-xs text-slate-500">Proktor</span>
                        <div className="text-2xl font-semibold text-slate-900 mt-1">
                            {users.filter(u => u.roles.some(r => r.toUpperCase() === 'PROKTOR')).length}
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                        <span className="text-xs text-slate-500">Siswa</span>
                        <div className="text-2xl font-semibold text-slate-900 mt-1">
                            {users.filter(u => !u.isPlatformAdmin && !u.roles.some(r => ['ADMIN', 'PROKTOR'].includes(r.toUpperCase()))).length}
                        </div>
                    </div>
                </div>

                {/* Search & Table Card */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cari nama, email, sekolah..."
                                className="w-full bg-white border border-slate-300 focus:border-[#030C4D] text-slate-800 rounded-lg py-2 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400"
                            />
                        </div>
                        <InlineSelect
                            aria-label="Filter peran"
                            value={roleFilter}
                            onChange={setRoleFilter}
                            minWidth="160px"
                            options={[
                                { value: '', label: 'Semua peran' },
                                { value: 'Admin', label: 'Admin' },
                                { value: 'Proktor', label: 'Proktor' },
                                { value: 'Pengawas', label: 'Pengawas' },
                                { value: 'Siswa', label: 'Siswa' },
                            ]}
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
                            {search || roleFilter ? 'Tidak ada pengguna yang cocok dengan pencarian atau filter peran.' : 'Belum ada pengguna terdaftar.'}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
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
                                                                <span className="font-semibold text-sm text-slate-600">
                                                                    {(u.fullName || u.email || '?')[0].toUpperCase()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                                                {u.fullName || 'Pengguna Tanpa Nama'}
                                                                {u.isSuperadmin && (
                                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
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
                                                        <span className="text-xs text-slate-500">
                                                            Pemilik Utama (Kebal)
                                                        </span>
                                                    ) : (
                                                        <div className="inline-flex items-center justify-end gap-2">
                                                            {isActionLoading && <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />}
                                                            <InlineSelect
                                                                aria-label={`Peran ${u.email}`}
                                                                disabled={isActionLoading}
                                                                minWidth="112px"
                                                                value={primaryRole === 'Superadmin' ? 'Admin' : MANAGED_ROLES.includes(primaryRole) ? primaryRole : ''}
                                                                onChange={async (next) => {
                                                                    if (next === 'Siswa' && !MANAGED_ROLES.includes(primaryRole)
                                                                        && !await confirmDialog({ title: 'Jadikan Siswa?', text: `Peran ${primaryRole} milik ${u.email} akan dicabut.`, confirmText: 'Ya, Jadikan Siswa', variant: 'warning' })) {
                                                                        return;
                                                                    }
                                                                    void handleRoleChange(u.id, u.email, next);
                                                                }}
                                                            >
                                                                {!MANAGED_ROLES.includes(primaryRole) && primaryRole !== 'Superadmin' && (
                                                                    <option value="" disabled>{primaryRole} (pilih untuk mengubah)</option>
                                                                )}
                                                                <option value="Admin">Admin</option>
                                                                <option value="Proktor">Proktor</option>
                                                                <option value="Siswa">Siswa</option>
                                                            </InlineSelect>

                                                            <button
                                                                type="button"
                                                                disabled={isActionLoading}
                                                                onClick={() => handleDeleteUser(u.id, u.email)}
                                                                title={`Hapus pengguna ${u.email}`}
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
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
                <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-md w-full p-6 relative animate-in fade-in zoom-in-95 duration-150">
                        <button
                            type="button"
                            onClick={() => setShowAddModal(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="mb-5">
                            <h3 className="text-base font-semibold text-slate-900">Tambah Akun Pengguna</h3>
                            <p className="text-sm text-slate-500 mt-1">Buat akun Admin, Proktor, atau Siswa secara manual.</p>
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
                                    Nama Lengkap <span className="text-slate-400">*</span>
                                </label>
                                <div className="relative">
                                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        required
                                        placeholder="Nama Pengguna"
                                        value={addForm.name}
                                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                                        className="w-full bg-white border border-slate-300 focus:border-[#030C4D] text-slate-900 text-xs rounded-lg py-2 pl-9 pr-3 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Email Akun <span className="text-slate-400">*</span>
                                </label>
                                <div className="relative">
                                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="email"
                                        required
                                        placeholder="nama@email.com"
                                        value={addForm.email}
                                        onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                                        className="w-full bg-white border border-slate-300 focus:border-[#030C4D] text-slate-900 text-xs rounded-lg py-2 pl-9 pr-3 outline-none"
                                    />
                                </div>
                            </div>

                            <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                                Akun didaftarkan tanpa password. Pemiliknya masuk dengan <strong>akun Google</strong> beremail sama,
                                dan peran yang Anda pilih langsung berlaku.
                            </p>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                    Peran / Role <span className="text-slate-400">*</span>
                                </label>
                                <InlineSelect
                                    aria-label="Peran pengguna baru"
                                    value={addForm.role}
                                    onChange={(role) => setAddForm({ ...addForm, role })}
                                    minWidth="100%"
                                    className="w-full"
                                    options={[
                                        { value: 'Admin', label: 'Admin (khusus Superadmin) — Hak Akses Penuh Kelola Ujian & Sekolah' },
                                        { value: 'Proktor', label: 'Proktor (Pembuat Soal & Bahan Ajar)' },
                                        { value: 'Siswa', label: 'Siswa (Peserta Ujian)' },
                                    ]}
                                />
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
                                            className="w-full bg-white border border-slate-300 focus:border-[#030C4D] text-slate-900 text-xs rounded-lg py-2 pl-9 pr-3 outline-none"
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
                                            className="w-full bg-white border border-slate-300 focus:border-[#030C4D] text-slate-900 text-xs rounded-lg py-2 pl-9 pr-3 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={addLoading}
                                    className="px-5 py-2 bg-[#030C4D] hover:bg-[#030C4D]/90 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
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
