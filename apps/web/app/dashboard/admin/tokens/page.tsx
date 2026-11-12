"use client";

import { deleteConfirmDialog, notify } from '@/lib/confirm-dialog';
import React, { useEffect, useState } from 'react';
import { Plus, AlertCircle, RefreshCw, Coins, CreditCard } from 'lucide-react';
import { Tabs } from '@/app/components/ui/tabs';
import { FloatingActionButton } from '@/app/components/ui/fab';
import { ActionButton, ActionGroup } from '@/app/components/ui/actionbutton';
import { Modal, ModalBody, ModalField, ModalFooter } from '@/app/components/ui/modal';
import { Button } from '@/app/components/ui/button';
import {
    getAdminTokenPackages,
    createTokenPackage,
    updateTokenPackage,
    deleteTokenPackage,
    getMidtransConfig,
    saveMidtransConfig,
    type TokenPackage
} from '@/lib/api/tokens';

export default function AdminTokensPage() {
    const [packages, setPackages] = useState<TokenPackage[]>([]);
    const [tab, setTab] = useState<'paket' | 'midtrans'>('paket');
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingPkg, setEditingPkg] = useState<TokenPackage | null>(null);

    // Form package state
    const [pkgName, setPkgName] = useState('');
    // Disimpan sebagai string agar field angka bisa dikosongkan saat diketik ulang.
    const [pkgAmount, setPkgAmount] = useState('1');
    const [pkgPrice, setPkgPrice] = useState('10000');
    const [pkgDesc, setPkgDesc] = useState('');
    const [pkgActive, setPkgActive] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    // Midtrans config state
    const [isProduction, setIsProduction] = useState(false);
    const [sandboxClientKey, setSandboxClientKey] = useState('');
    // Server key tidak pernah diisi dari server: input kosong = pertahankan kunci tersimpan.
    const [sandboxServerKey, setSandboxServerKey] = useState('');
    const [prodClientKey, setProdClientKey] = useState('');
    const [prodServerKey, setProdServerKey] = useState('');
    const [savedSandboxServerMask, setSavedSandboxServerMask] = useState('');
    const [savedProdServerMask, setSavedProdServerMask] = useState('');
    const [clearSandboxServerKey, setClearSandboxServerKey] = useState(false);
    const [clearProdServerKey, setClearProdServerKey] = useState(false);
    // Form Midtrans hanya boleh disimpan setelah konfigurasi tersimpan berhasil dimuat;
    // menyimpan nilai default akan mematikan mode produksi dan menghapus client key.
    const [midtransStatus, setMidtransStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [midtransLoadError, setMidtransLoadError] = useState<string | null>(null);
    const [savingMidtrans, setSavingMidtrans] = useState(false);
    const [midtransFeedback, setMidtransFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [packagesError, setPackagesError] = useState<string | null>(null);

    const loadPackages = async () => {
        const pkgRes = await getAdminTokenPackages();
        if (pkgRes.success && pkgRes.packages) {
            setPackages(pkgRes.packages);
            setPackagesError(null);
        } else {
            setPackagesError(!pkgRes.success ? pkgRes.error : 'Data paket tidak valid.');
        }
    };

    const loadMidtrans = async () => {
        setMidtransStatus('loading');
        setMidtransLoadError(null);
        const midtransRes = await getMidtransConfig();
        if (!midtransRes.success) {
            setMidtransStatus('error');
            setMidtransLoadError(midtransRes.error || 'Konfigurasi Midtrans gagal dimuat.');
            return;
        }
        setIsProduction(Boolean(midtransRes.is_production));
        setSandboxClientKey(midtransRes.sandbox_client_key || '');
        setProdClientKey(midtransRes.production_client_key || '');
        setSavedSandboxServerMask(midtransRes.sandbox_server_key || '');
        setSavedProdServerMask(midtransRes.production_server_key || '');
        setSandboxServerKey('');
        setProdServerKey('');
        setClearSandboxServerKey(false);
        setClearProdServerKey(false);
        setMidtransStatus('ready');
    };

    const loadData = async () => {
        setLoading(true);
        try {
            await Promise.all([loadPackages(), loadMidtrans()]);
        } catch (err) {
            console.error('Error loading token data:', err);
        } finally {
            setLoading(false);
        }
    };

    /** Segarkan daftar paket saja; form Midtrans dibiarkan apa adanya. */
    const refreshPackages = async () => {
        setLoading(true);
        try {
            await loadPackages();
        } catch (err) {
            console.error('Error loading token packages:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openAddModal = () => {
        setEditingPkg(null);
        setPkgName('');
        setPkgAmount('5');
        setPkgPrice('25000');
        setPkgDesc('');
        setPkgActive(true);
        setModalOpen(true);
    };

    const openEditModal = (pkg: TokenPackage) => {
        setEditingPkg(pkg);
        setPkgName(pkg.name);
        setPkgAmount(String(pkg.token_amount));
        setPkgPrice(String(Math.round(Number(pkg.price_idr))));
        setPkgDesc(pkg.description || '');
        setPkgActive(pkg.is_active);
        setModalOpen(true);
    };

    const handleSavePackage = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = pkgName.trim();
        const tokenAmount = Number(pkgAmount);
        const priceIdr = Number(pkgPrice);
        if (!name) {
            void notify('Nama paket wajib diisi.');
            return;
        }
        if (!Number.isInteger(tokenAmount) || tokenAmount < 1 || tokenAmount > 100000) {
            void notify('Jumlah token harus bilangan bulat antara 1 dan 100.000.');
            return;
        }
        if (!Number.isInteger(priceIdr) || priceIdr < 1 || priceIdr > 100000000) {
            void notify('Harga paket harus bilangan bulat rupiah antara 1 dan 100.000.000.');
            return;
        }
        const payload = {
            name,
            token_amount: tokenAmount,
            price_idr: priceIdr,
            description: pkgDesc.trim(),
            is_active: pkgActive,
        };
        setSubmitting(true);
        try {
            if (editingPkg) {
                const res = await updateTokenPackage(editingPkg.id, payload);
                if (!res.success) throw new Error(res.error || 'Gagal mengubah paket.');
            } else {
                const res = await createTokenPackage(payload);
                if (!res.success) throw new Error(res.error || 'Gagal membuat paket.');
            }
            setModalOpen(false);
            // Hanya daftar paket: memuat ulang Midtrans akan menghapus input yang belum disimpan.
            await refreshPackages();
        } catch (err: any) {
            void notify(err.message || 'Terjadi kesalahan.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeletePackage = async (id: string, name: string) => {
        if (!await deleteConfirmDialog('Hapus paket token?', `Paket "${name}" tidak lagi bisa dibeli siswa.`)) return;
        try {
            const res = await deleteTokenPackage(id);
            if (res.success) {
                await refreshPackages();
            } else {
                void notify(res.error || 'Gagal menghapus paket.');
            }
        } catch (err: any) {
            void notify(err.message);
        }
    };

    const handleToggleActive = async (pkg: TokenPackage) => {
        if (togglingId) return;
        setTogglingId(pkg.id);
        try {
            const res = await updateTokenPackage(pkg.id, { is_active: !pkg.is_active });
            if (!res.success) {
                void notify(res.error || 'Gagal mengubah status paket.');
                return;
            }
            await loadPackages();
        } finally {
            setTogglingId(null);
        }
    };

    const handleSaveMidtrans = async (e: React.FormEvent) => {
        e.preventDefault();
        if (midtransStatus !== 'ready') return;
        setSavingMidtrans(true);
        setMidtransFeedback(null);
        try {
            const res = await saveMidtransConfig({
                is_production: isProduction,
                sandbox_client_key: sandboxClientKey.trim(),
                sandbox_server_key: sandboxServerKey.trim() || undefined,
                production_client_key: prodClientKey.trim(),
                production_server_key: prodServerKey.trim() || undefined,
                clear_sandbox_server_key: clearSandboxServerKey,
                clear_production_server_key: clearProdServerKey,
            });
            if (res.success) {
                await loadMidtrans();
                setMidtransFeedback({ type: 'success', text: 'Konfigurasi Midtrans berhasil disimpan!' });
                setTimeout(() => setMidtransFeedback(null), 4000);
            } else {
                setMidtransFeedback({ type: 'error', text: String(res.error || 'Gagal menyimpan konfigurasi.') });
            }
        } catch (err: any) {
            setMidtransFeedback({ type: 'error', text: err.message || 'Terjadi kesalahan.' });
        } finally {
            setSavingMidtrans(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-16">
            
            {/* Header */}
            <div>
                <h1 className="text-xl font-semibold text-slate-900">Paket Token & Pembayaran</h1>
                <p className="text-sm text-slate-500 mt-1">Atur harga paket token siswa dan kredensial payment gateway Midtrans.</p>
            </div>

            <Tabs
                ariaLabel="Pengaturan token"
                activeTab={tab}
                onSelect={setTab}
                tabs={[
                    { key: 'paket', label: 'Paket Token', icon: <Coins size={16} />, badge: packages.length },
                    { key: 'midtrans', label: 'Pembayaran Midtrans', icon: <CreditCard size={16} /> },
                ]}
            />

            {tab === 'paket' && <FloatingActionButton label="Tambah Paket" icon={<Plus size={20} />} onClick={openAddModal} />}

            {/* Token Packages Table */}
            {tab === 'paket' && <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900">
                            Daftar Paket Token ({packages.length})
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Paket yang berstatus aktif akan langsung muncul di katalog pembelian siswa
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={refreshPackages}
                        disabled={loading}
                        className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Segarkan data"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs font-medium border-b border-slate-200">
                            <tr>
                                <th className="py-3.5 px-6">Nama Paket</th>
                                <th className="py-3.5 px-6">Jumlah Token</th>
                                <th className="py-3.5 px-6">Harga (Rp)</th>
                                <th className="py-3.5 px-6">Deskripsi</th>
                                <th className="py-3.5 px-6">Status</th>
                                <th className="py-3.5 px-6 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-slate-400">
                                        Memuat daftar paket token...
                                    </td>
                                </tr>
                            ) : packagesError ? (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-red-600">
                                        Gagal memuat paket token: {packagesError}
                                    </td>
                                </tr>
                            ) : packages.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-400">
                                        Belum ada paket token. Klik "Tambah Paket Token" untuk membuat paket pertama.
                                    </td>
                                </tr>
                            ) : (
                                packages.map((pkg) => (
                                    <tr key={pkg.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="py-4 px-6 font-medium text-slate-900">
                                            {pkg.name}
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="text-slate-700">{pkg.token_amount} token</span>
                                        </td>
                                        <td className="py-4 px-6 font-medium text-slate-900">
                                            Rp {Number(pkg.price_idr).toLocaleString('id-ID')}
                                        </td>
                                        <td className="py-4 px-6 text-xs text-slate-600 max-w-xs truncate">
                                            {pkg.description || '-'}
                                        </td>
                                        <td className="py-4 px-6">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleActive(pkg)}
                                                disabled={togglingId !== null}
                                                className={`px-3 py-1 disabled:opacity-60 disabled:cursor-wait rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                                    pkg.is_active
                                                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                }`}
                                            >
                                                {pkg.is_active ? 'Aktif' : 'Nonaktif'}
                                            </button>
                                        </td>
                                        <td className="py-4 px-6 text-right space-x-2">
                                            <ActionGroup>
                                                <ActionButton action="edit" iconOnly tooltip="Edit paket" onClick={() => openEditModal(pkg)} />
                                                <ActionButton action="delete" iconOnly tooltip="Hapus paket" onClick={() => handleDeletePackage(pkg.id, pkg.name)} />
                                            </ActionGroup>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>}

            {/* Midtrans Settings Card */}
            {tab === 'midtrans' && <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8">
                <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold text-slate-900">
                            Konfigurasi Midtrans Payment Gateway
                        </h2>
                        <p className="text-sm text-slate-500">
                            Masukkan kunci akses API dari dashboard resmi Midtrans Snap Anda
                        </p>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isProduction ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {isProduction ? 'Mode Produksi' : 'Mode Sandbox'}
                    </span>
                </div>

                <form onSubmit={handleSaveMidtrans} className="space-y-6 max-w-4xl">
                    {midtransStatus === 'loading' && (
                        <div className="p-3.5 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 text-sm">
                            Memuat konfigurasi Midtrans...
                        </div>
                    )}
                    {midtransStatus === 'error' && (
                        <div className="p-3.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm font-medium flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2">
                                <AlertCircle size={16} />
                                Konfigurasi gagal dimuat, sehingga form dikunci agar pengaturan tersimpan tidak tertimpa. {midtransLoadError}
                            </span>
                            <button type="button" onClick={loadMidtrans} className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-xs cursor-pointer">
                                Coba lagi
                            </button>
                        </div>
                    )}
                    <fieldset disabled={midtransStatus !== 'ready' || savingMidtrans} className="space-y-6 disabled:opacity-60">
                    
                    {/* Toggle Production Mode */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <input
                            type="checkbox"
                            id="midtrans-mode"
                            checked={isProduction}
                            onChange={(e) => setIsProduction(e.target.checked)}
                            className="w-5 h-5 text-[#030C4D] rounded cursor-pointer"
                        />
                        <label htmlFor="midtrans-mode" className="text-sm font-semibold text-slate-800 cursor-pointer">
                            Aktifkan Mode Produksi (Live)
                            <span className="block text-xs font-normal text-slate-500 mt-0.5">
                                Jika dinonaktifkan, sistem akan berjalan dalam mode Sandbox (Uji Coba dengan kartu dummy).
                            </span>
                        </label>
                    </div>

                    {/* Keys Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Sandbox */}
                        <div className="space-y-4 p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                Kunci Sandbox (Pengujian)
                            </h3>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Client Key (Sandbox)
                                </label>
                                <input
                                    type="text"
                                    value={sandboxClientKey}
                                    onChange={(e) => setSandboxClientKey(e.target.value)}
                                    placeholder="SB-Mid-client-..."
                                    className="w-full text-xs font-mono px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:border-[#030C4D] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Server Key (Sandbox)
                                </label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    value={sandboxServerKey}
                                    onChange={(e) => setSandboxServerKey(e.target.value)}
                                    disabled={clearSandboxServerKey}
                                    placeholder={savedSandboxServerMask ? `Tersimpan (${savedSandboxServerMask}) — kosongkan untuk mempertahankan` : 'SB-Mid-server-...'}
                                    className="w-full text-xs font-mono px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:border-[#030C4D] outline-none disabled:bg-slate-100"
                                />
                                {savedSandboxServerMask && (
                                    <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={clearSandboxServerKey}
                                            onChange={(e) => { setClearSandboxServerKey(e.target.checked); if (e.target.checked) setSandboxServerKey(''); }}
                                        />
                                        Hapus server key Sandbox yang tersimpan
                                    </label>
                                )}
                            </div>
                        </div>

                        {/* Production */}
                        <div className="space-y-4 p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                Kunci Production (Live)
                            </h3>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Client Key (Production)
                                </label>
                                <input
                                    type="text"
                                    value={prodClientKey}
                                    onChange={(e) => setProdClientKey(e.target.value)}
                                    placeholder="Mid-client-..."
                                    className="w-full text-xs font-mono px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:border-[#030C4D] outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Server Key (Production)
                                </label>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    value={prodServerKey}
                                    onChange={(e) => setProdServerKey(e.target.value)}
                                    disabled={clearProdServerKey}
                                    placeholder={savedProdServerMask ? `Tersimpan (${savedProdServerMask}) — kosongkan untuk mempertahankan` : 'Mid-server-...'}
                                    className="w-full text-xs font-mono px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:border-[#030C4D] outline-none disabled:bg-slate-100"
                                />
                                {savedProdServerMask && (
                                    <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={clearProdServerKey}
                                            onChange={(e) => { setClearProdServerKey(e.target.checked); if (e.target.checked) setProdServerKey(''); }}
                                        />
                                        Hapus server key Production yang tersimpan
                                    </label>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* Webhook Instruction Box */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                        <strong>URL Notifikasi Webhook Midtrans:</strong>
                        <p className="font-mono bg-white p-2 rounded border border-slate-200 text-slate-800 select-all">
                            {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/midtrans` : 'https://unelma.id/api/webhook/midtrans'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                            Salin URL di atas ke menu <em>Settings → Configuration → Payment Notification URL</em> di dashboard Midtrans Anda.
                        </p>
                    </div>

                    </fieldset>

                    {midtransFeedback && (
                        <div className={`p-3.5 rounded-xl border text-sm font-semibold ${
                            midtransFeedback.type === 'success'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                            {midtransFeedback.text}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={savingMidtrans || midtransStatus !== 'ready'}
                        className="px-6 py-3 bg-[#030C4D] hover:bg-[#030C4D]/90 text-white font-semibold text-sm rounded-xl transition-all disabled:opacity-60 cursor-pointer"
                    >
                        {savingMidtrans ? 'Menyimpan...' : 'Simpan Pengaturan Midtrans'}
                    </button>
                </form>
            </div>}

            {/* Modal Tambah / Edit Paket Token */}
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md" variant={editingPkg ? 'edit' : 'add'}
                icon={editingPkg ? 'pencil-square' : 'plus-lg'} title={editingPkg ? 'Edit Paket Token' : 'Tambah Paket Token'}>
                <form onSubmit={handleSavePackage}>
                    <ModalBody>
                        <ModalField label="Nama paket" required>
                            <input type="text" required maxLength={100} value={pkgName} onChange={(e) => setPkgName(e.target.value)} placeholder="contoh: Paket Hemat 10 Token" />
                        </ModalField>
                        <div className="grid grid-cols-2 gap-3">
                            <ModalField label="Jumlah token" required>
                                <input type="number" min="1" max="100000" step="1" required value={pkgAmount} onChange={(e) => setPkgAmount(e.target.value)} />
                            </ModalField>
                            <ModalField label="Harga (Rp)" required>
                                <input type="number" min="1" max="100000000" step="1" required value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} />
                            </ModalField>
                        </div>
                        <ModalField label="Deskripsi singkat" hint='Tulis "(Bonus N token)" agar siswa melihat label bonus.'>
                            <textarea rows={2} maxLength={500} value={pkgDesc} onChange={(e) => setPkgDesc(e.target.value)} placeholder="Keterangan manfaat atau rincian paket" />
                        </ModalField>
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={pkgActive} onChange={(e) => setPkgActive(e.target.checked)} className="h-4 w-4 rounded" />
                            Aktifkan paket ini (dapat dibeli siswa)
                        </label>
                    </ModalBody>
                    <ModalFooter>
                        <Button type="button" variant="cancel" icon="cancel" onClick={() => setModalOpen(false)}>Batal</Button>
                        <Button type="submit" variant="primary" icon="save" isLoading={submitting} disabled={submitting}>Simpan Paket</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}
