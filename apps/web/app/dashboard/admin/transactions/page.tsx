"use client";

import React, { useEffect, useState } from 'react';
import { CreditCard, Search, Coins, RefreshCw, CheckCircle2, Clock, XCircle, ArrowUpRight, BookOpen, ClipboardCheck } from 'lucide-react';
import { getAdminPurchasesTracker, getAdminUsagesTracker, type PaymentTransaction, type TokenTransaction } from '@/lib/api/tokens';

export default function AdminTransactionsTrackerPage() {
    const [activeTab, setActiveTab] = useState<'purchases' | 'usages'>('purchases');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Purchases data
    const [purchases, setPurchases] = useState<PaymentTransaction[]>([]);
    const [purchaseStats, setPurchaseStats] = useState({ total_orders: 0, success_orders: 0, total_revenue: 0, total_tokens_sold: 0 });

    // Usages data
    const [usages, setUsages] = useState<TokenTransaction[]>([]);
    const [usageStats, setUsageStats] = useState({ total_unlocks: 0, total_tokens_spent: 0, active_students: 0 });

    const loadData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'purchases') {
                const res = await getAdminPurchasesTracker(searchQuery);
                if (res.success) {
                    setPurchases(res.transactions || []);
                    setPurchaseStats(res.stats || { total_orders: 0, success_orders: 0, total_revenue: 0, total_tokens_sold: 0 });
                }
            } else {
                const res = await getAdminUsagesTracker(searchQuery);
                if (res.success) {
                    setUsages(res.usages || []);
                    setUsageStats(res.stats || { total_unlocks: 0, total_tokens_spent: 0, active_students: 0 });
                }
            }
        } catch (err) {
            console.error('Error loading tracker data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadData();
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-16">
            
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#030C4D] via-[#071360] to-[#030C4D] text-white p-6 md:p-8 shadow-xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#F8A01B]/15 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#F8A01B] text-xs font-bold uppercase tracking-wider">
                        <CreditCard size={14} />
                        <span>Audit & Pelacakan Keuangan</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                        Tracker Transaksi & Pemakaian Token
                    </h1>
                    <p className="text-xs md:text-sm text-white/75 max-w-2xl leading-relaxed">
                        Pantau seluruh aliran pembelian token via Midtrans serta histori debit token ketika siswa membuka ujian dan bahan ajar berbayar.
                    </p>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="inline-flex p-1.5 rounded-xl bg-slate-200/70 border border-slate-300/60 max-w-fit">
                    <button
                        type="button"
                        onClick={() => { setActiveTab('purchases'); setSearchQuery(''); }}
                        className={`px-5 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'purchases'
                                ? 'bg-white text-[#030C4D] shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <CreditCard size={16} />
                        <span>Tracker Pembelian Token (Midtrans)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActiveTab('usages'); setSearchQuery(''); }}
                        className={`px-5 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            activeTab === 'usages'
                                ? 'bg-white text-[#030C4D] shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Coins size={16} />
                        <span>Tracker Pemakaian (Ujian & Bahan Ajar)</span>
                    </button>
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-72">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                        <input
                            type="text"
                            placeholder="Cari order, siswa, email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full text-xs py-2.5 pl-9 pr-3 rounded-xl border border-slate-300 bg-white focus:border-[#030C4D] outline-none shadow-xs"
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2.5 bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                    >
                        Cari
                    </button>
                </form>
            </div>

            {/* Metrics Row */}
            {activeTab === 'purchases' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pendapatan</p>
                        <p className="text-xl md:text-2xl font-black text-[#030C4D]">
                            Rp {Number(purchaseStats.total_revenue || 0).toLocaleString('id-ID')}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Token Terjual</p>
                        <p className="text-xl md:text-2xl font-black text-[#F8A01B]">
                            {Number(purchaseStats.total_tokens_sold || 0).toLocaleString('id-ID')} Token
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transaksi Sukses</p>
                        <p className="text-xl md:text-2xl font-black text-emerald-600">
                            {Number(purchaseStats.success_orders || 0).toLocaleString('id-ID')}
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pesanan</p>
                        <p className="text-xl md:text-2xl font-black text-slate-700">
                            {Number(purchaseStats.total_orders || 0).toLocaleString('id-ID')}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Token Terpakai</p>
                        <p className="text-2xl font-black text-[#F8A01B]">
                            {Number(usageStats.total_tokens_spent || 0).toLocaleString('id-ID')} Token
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Item Dibuka</p>
                        <p className="text-2xl font-black text-[#030C4D]">
                            {Number(usageStats.total_unlocks || 0).toLocaleString('id-ID')} Akses
                        </p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Siswa Aktif Bertransaksi</p>
                        <p className="text-2xl font-black text-blue-600">
                            {Number(usageStats.active_students || 0).toLocaleString('id-ID')} Siswa
                        </p>
                    </div>
                </div>
            )}

            {/* Table Area */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">
                        {activeTab === 'purchases' ? 'Data Transaksi Pembelian Token' : 'Data Pemakaian Token Ujian & Bahan Ajar'}
                    </h2>
                    <button
                        onClick={loadData}
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Segarkan"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="overflow-x-auto">
                    {activeTab === 'purchases' ? (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
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
                                ) : purchases.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-slate-400">
                                            Belum ada transaksi pembelian token.
                                        </td>
                                    </tr>
                                ) : (
                                    purchases.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-5 font-mono font-bold text-slate-900">
                                                {tx.order_id}
                                            </td>
                                            <td className="py-3.5 px-5 text-slate-500">
                                                {new Date(tx.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <div className="font-semibold text-slate-800">{tx.user_name || tx.customer_name || 'Siswa'}</div>
                                                <div className="text-[11px] text-slate-500">{tx.email}</div>
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                                                    <Coins size={13} className="text-[#F8A01B]" />
                                                    {tx.token_amount} Token
                                                </span>
                                                <div className="text-[11px] text-slate-400">{tx.package_name || 'Top Up'}</div>
                                            </td>
                                            <td className="py-3.5 px-5 font-extrabold text-[#030C4D]">
                                                Rp {Number(tx.amount).toLocaleString('id-ID')}
                                            </td>
                                            <td className="py-3.5 px-5 uppercase text-[11px] text-slate-600 font-semibold">
                                                {tx.payment_type || 'Midtrans'}
                                            </td>
                                            <td className="py-3.5 px-5 text-right">
                                                {tx.status === 'success' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                                        <CheckCircle2 size={12} />
                                                        Sukses
                                                    </span>
                                                ) : tx.status === 'pending' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                                                        <Clock size={12} />
                                                        Menunggu
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-bold text-[11px]">
                                                        <XCircle size={12} />
                                                        Gagal
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
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
                                ) : usages.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-slate-400">
                                            Belum ada transaksi pemakaian token untuk membuka bahan ajar atau ujian.
                                        </td>
                                    </tr>
                                ) : (
                                    usages.map((u) => (
                                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-5 text-slate-500">
                                                {new Date(u.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                            <td className="py-3.5 px-5">
                                                <div className="font-semibold text-slate-800">{u.user_name || 'Siswa'}</div>
                                                <div className="text-[11px] text-slate-500">{u.user_email || '-'}</div>
                                            </td>
                                            <td className="py-3.5 px-5">
                                                {u.description.toLowerCase().includes('bahan ajar') || u.item_type === 'material' ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 font-semibold text-[11px] border border-blue-200">
                                                        <BookOpen size={12} />
                                                        Bahan Ajar
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-800 font-semibold text-[11px] border border-purple-200">
                                                        <ClipboardCheck size={12} />
                                                        Ujian CBT
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-5 font-medium text-slate-800 max-w-sm">
                                                {u.description}
                                            </td>
                                            <td className="py-3.5 px-5 text-right font-black text-rose-600">
                                                {u.amount} Token
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

        </div>
    );
}
