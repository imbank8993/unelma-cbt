"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAdminPurchasesTracker, getAdminUsagesTracker, type PaymentTransaction, type TokenTransaction } from '@/lib/api/tokens';
import { formatSchoolDateTime } from '@/lib/school-time';
import { useSchoolTimeZone } from '@/lib/useSchoolTimeZone';

type Tab = 'purchases' | 'usages';

const PAGE_SIZE = 50;
const SEARCH_MAX = 100;
const EMPTY_PURCHASE_STATS = { total_orders: 0, success_orders: 0, total_revenue: 0, total_tokens_sold: 0 };
const EMPTY_USAGE_STATS = { total_unlocks: 0, total_tokens_spent: 0, active_students: 0 };

/** Jenis item dari data unlock; deskripsi hanya cadangan untuk data lama tanpa unlocked_items. */
function usageItemType(u: TokenTransaction): 'material' | 'exam' {
    if (u.item_type === 'material' || u.item_type === 'exam') return u.item_type;
    return (u.description || '').startsWith('Membuka akses Bahan Ajar') ? 'material' : 'exam';
}

function PaymentStatusBadge({ status }: { status: string }) {
    if (status === 'success') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium text-[11px]">
                Sukses
            </span>
        );
    }
    if (status === 'pending') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium text-[11px]">
                Menunggu
            </span>
        );
    }
    if (status === 'failed') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium text-[11px]">
                Gagal
            </span>
        );
    }
    return (
        <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium text-[11px]">
            {status || 'Tidak diketahui'}
        </span>
    );
}

export default function AdminTransactionsTrackerPage() {
    const { timeZone } = useSchoolTimeZone();
    const [activeTab, setActiveTab] = useState<Tab>('purchases');
    // `searchInput` = isi kotak cari; `appliedSearch` = kata kunci yang sedang ditampilkan.
    const [searchInput, setSearchInput] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [filtered, setFiltered] = useState(false);

    const [purchases, setPurchases] = useState<PaymentTransaction[]>([]);
    const [purchaseStats, setPurchaseStats] = useState(EMPTY_PURCHASE_STATS);
    const [usages, setUsages] = useState<TokenTransaction[]>([]);
    const [usageStats, setUsageStats] = useState(EMPTY_USAGE_STATS);

    // Nomor request terbaru: balasan dari request yang sudah usang diabaikan,
    // sehingga hasil pencarian lama tidak menimpa hasil yang baru.
    const requestSeq = useRef(0);

    const load = useCallback(async (tab: Tab, search: string, pageNumber: number) => {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);
        try {
            const query = { search, page: pageNumber, pageSize: PAGE_SIZE };
            if (tab === 'purchases') {
                const res = await getAdminPurchasesTracker(query);
                if (seq !== requestSeq.current) return;
                if (!res.success) throw new Error(res.error);
                setPurchases(res.transactions || []);
                setPurchaseStats(res.stats || EMPTY_PURCHASE_STATS);
                setTotal(Number(res.total || 0));
                setFiltered(Boolean(res.filtered));
            } else {
                const res = await getAdminUsagesTracker(query);
                if (seq !== requestSeq.current) return;
                if (!res.success) throw new Error(res.error);
                setUsages(res.usages || []);
                setUsageStats(res.stats || EMPTY_USAGE_STATS);
                setTotal(Number(res.total || 0));
                setFiltered(Boolean(res.filtered));
            }
        } catch (err) {
            if (seq !== requestSeq.current) return;
            // Data lama dikosongkan agar tidak disangka hasil yang berlaku.
            setPurchases([]);
            setUsages([]);
            setPurchaseStats(EMPTY_PURCHASE_STATS);
            setUsageStats(EMPTY_USAGE_STATS);
            setTotal(0);
            setError(String((err as Error)?.message || 'Data tracker gagal dimuat.'));
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Memuat data dari server saat tab, kata kunci, atau halaman berubah.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load(activeTab, appliedSearch, page);
    }, [activeTab, appliedSearch, page, reloadKey, load]);

    const switchTab = (tab: Tab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        setSearchInput('');
        setAppliedSearch('');
        setPage(1);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setAppliedSearch(searchInput.trim());
        setPage(1);
        setReloadKey((k) => k + 1);
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const rowCount = activeTab === 'purchases' ? purchases.length : usages.length;
    const firstRow = rowCount ? (page - 1) * PAGE_SIZE + 1 : 0;
    const lastRow = (page - 1) * PAGE_SIZE + rowCount;
    const formatTime = (value: string) => formatSchoolDateTime(value, timeZone);

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-16">

            {/* Page Header (Clean & Elegan) */}
            <div>
                <h1 className="text-xl font-semibold text-slate-900">
                    <span>Tracker Transaksi & Pemakaian Token</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Pantau transaksi pembelian token Midtrans dan riwayat pemakaian token siswa saat membuka ujian dan materi.
                </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="inline-flex p-1 rounded-lg bg-slate-100 max-w-fit">
                    <button
                        type="button"
                        onClick={() => switchTab('purchases')}
                        className={`px-4 py-2 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                            activeTab === 'purchases'
                                ? 'bg-white text-slate-900 ring-1 ring-slate-200'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        Pembelian Token
                    </button>
                    <button
                        type="button"
                        onClick={() => switchTab('usages')}
                        className={`px-4 py-2 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                            activeTab === 'usages'
                                ? 'bg-white text-slate-900 ring-1 ring-slate-200'
                                : 'text-slate-500 hover:text-slate-900'
                        }`}
                    >
                        Pemakaian Token
                    </button>
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            maxLength={SEARCH_MAX}
                            placeholder={activeTab === 'purchases' ? 'Cari order, siswa, email...' : 'Cari siswa, email, judul item...'}
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full text-xs py-2.5 pl-9 pr-3 rounded-lg border border-slate-300 bg-white focus:border-[#030C4D] outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2.5 bg-[#030C4D] hover:bg-[#030C4D]/90 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                        Cari
                    </button>
                </form>
            </div>

            {filtered && !error && (
                <p className="-mt-4 text-xs text-slate-600">
                    Ringkasan dan tabel di bawah hanya mencakup data yang cocok dengan pencarian <strong>&ldquo;{appliedSearch}&rdquo;</strong>.{' '}
                    <button
                        type="button"
                        onClick={() => { setSearchInput(''); setAppliedSearch(''); setPage(1); }}
                        className="font-semibold text-[#030C4D] underline cursor-pointer"
                    >
                        Hapus pencarian
                    </button>
                </p>
            )}

            {/* Metrics Row */}
            {activeTab === 'purchases' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Total Pendapatan</p>
                        <p className="text-xl md:text-2xl font-semibold text-slate-900">
                            Rp {Number(purchaseStats.total_revenue || 0).toLocaleString('id-ID')}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Token Terjual</p>
                        <p className="text-xl md:text-2xl font-semibold text-slate-900">
                            {Number(purchaseStats.total_tokens_sold || 0).toLocaleString('id-ID')} Token
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Transaksi Sukses</p>
                        <p className="text-xl md:text-2xl font-semibold text-slate-900">
                            {Number(purchaseStats.success_orders || 0).toLocaleString('id-ID')}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Total Pesanan</p>
                        <p className="text-xl md:text-2xl font-semibold text-slate-900">
                            {Number(purchaseStats.total_orders || 0).toLocaleString('id-ID')}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Total Token Terpakai</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {Number(usageStats.total_tokens_spent || 0).toLocaleString('id-ID')} Token
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Total Item Dibuka</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {Number(usageStats.total_unlocks || 0).toLocaleString('id-ID')} Akses
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-xs text-slate-500">Siswa Aktif Bertransaksi</p>
                        <p className="text-2xl font-semibold text-slate-900">
                            {Number(usageStats.active_students || 0).toLocaleString('id-ID')} Siswa
                        </p>
                    </div>
                </div>
            )}

            {/* Table Area */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">
                        {activeTab === 'purchases' ? 'Data Transaksi Pembelian Token' : 'Data Pemakaian Token Ujian & Bahan Ajar'}
                    </h2>
                    <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        disabled={loading}
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors disabled:cursor-wait"
                        title="Segarkan"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {error && (
                    <div className="m-5 p-3.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm font-medium flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                            <AlertCircle size={16} />
                            Data gagal dimuat: {error}
                        </span>
                        <button
                            type="button"
                            onClick={() => setReloadKey((k) => k + 1)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-xs cursor-pointer"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    {activeTab === 'purchases' ? (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-5">Order ID</th>
                                    <th className="py-3 px-5">Waktu</th>
                                    <th className="py-3 px-5">Pengguna</th>
                                    <th className="py-3 px-5">Paket Token</th>
                                    <th className="py-3 px-5">Nominal (Rp)</th>
                                    <th className="py-3 px-5">Metode</th>
                                    <th className="py-3 px-5 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="py-10 text-center text-slate-400">
                                            Memuat data transaksi...
                                        </td>
                                    </tr>
                                ) : error ? null : purchases.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            {filtered ? 'Tidak ada transaksi yang cocok dengan pencarian.' : 'Belum ada transaksi pembelian token.'}
                                        </td>
                                    </tr>
                                ) : (
                                    purchases.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-5 font-mono text-slate-900">
                                                {tx.order_id}
                                            </td>
                                            <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap">
                                                {formatTime(tx.created_at)}
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <div className="font-semibold text-slate-800">{tx.user_name || tx.customer_name || 'Siswa'}</div>
                                                <div className="text-[11px] text-slate-500">{tx.email || '-'}</div>
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <span className="font-medium text-slate-800">{tx.token_amount} token</span>
                                                <div className="text-[11px] text-slate-400">{tx.package_name || 'Top Up'}</div>
                                            </td>
                                            <td className="py-3.5 px-5 font-medium text-slate-900">
                                                Rp {Number(tx.amount).toLocaleString('id-ID')}
                                            </td>
                                            <td className="py-3.5 px-5 uppercase text-[11px] text-slate-600 font-semibold">
                                                {tx.payment_type || 'Midtrans'}
                                            </td>
                                            <td className="py-3.5 px-5 text-right">
                                                <PaymentStatusBadge status={tx.status} />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-5">Waktu Akses</th>
                                    <th className="py-3 px-5">Siswa</th>
                                    <th className="py-3 px-5">Tipe Item</th>
                                    <th className="py-3 px-5">Deskripsi Pembukaan</th>
                                    <th className="py-3 px-5 text-right">Token Digunakan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="py-10 text-center text-slate-400">
                                            Memuat data pemakaian token...
                                        </td>
                                    </tr>
                                ) : error ? null : usages.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-slate-400">
                                            {filtered ? 'Tidak ada pemakaian token yang cocok dengan pencarian.' : 'Belum ada transaksi pemakaian token untuk membuka bahan ajar atau ujian.'}
                                        </td>
                                    </tr>
                                ) : (
                                    usages.map((u) => (
                                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap">
                                                {formatTime(u.created_at)}
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <div className="font-semibold text-slate-800">{u.user_name || 'Siswa'}</div>
                                                <div className="text-[11px] text-slate-500">{u.user_email || '-'}</div>
                                            </td>
                                            <td className="py-3.5 px-5">
                                                {usageItemType(u) === 'material' ? (
                                                    <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                                                        Bahan Ajar
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                                                        Ujian CBT
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-5 font-medium text-slate-800 max-w-sm">
                                                {u.description}
                                            </td>
                                            <td className="py-3.5 px-5 text-right font-medium text-slate-900">
                                                {Math.abs(Number(u.amount) || 0).toLocaleString('id-ID')} Token
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {!error && total > 0 && (
                    <div className="px-5 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                        <span>
                            Menampilkan {firstRow.toLocaleString('id-ID')}–{lastRow.toLocaleString('id-ID')} dari {total.toLocaleString('id-ID')} data terbaru
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={loading || page <= 1}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                title="Halaman sebelumnya"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <span className="font-semibold">Halaman {page} / {totalPages}</span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={loading || page >= totalPages}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                title="Halaman berikutnya"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
