"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Coins, Zap, CheckCircle2, Clock, ArrowRight, ShieldCheck, History, ArrowDownLeft, ArrowUpRight, BookOpen, ClipboardCheck } from 'lucide-react';
import {
    getUserTokenBalance,
    getUserTokenTransactions,
    getPublicTokenPackages,
    type TokenPackage,
    type TokenTransaction
} from '@/lib/api/tokens';
import CustomPaymentModal from '@/app/components/tokens/CustomPaymentModal';

export default function SiswaTokensPage() {
    const [balance, setBalance] = useState<number>(0);
    const [packages, setPackages] = useState<TokenPackage[]>([]);
    const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPackage, setSelectedPackage] = useState<TokenPackage | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [balRes, pkgRes, txRes] = await Promise.allSettled([
                getUserTokenBalance(),
                getPublicTokenPackages(),
                getUserTokenTransactions(),
            ]);

            if (balRes.status === 'fulfilled' && balRes.value.success) {
                setBalance(balRes.value.token_balance || 0);
            }
            if (pkgRes.status === 'fulfilled' && pkgRes.value.success && Array.isArray(pkgRes.value.packages)) {
                setPackages(pkgRes.value.packages);
            }
            if (txRes.status === 'fulfilled' && txRes.value.success && Array.isArray(txRes.value.transactions)) {
                setTransactions(txRes.value.transactions);
            }
        } catch (err) {
            console.error('Error loading token data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleBuyPackage = (pkg: TokenPackage) => {
        setSelectedPackage(pkg);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-16">
            <CustomPaymentModal
                isOpen={!!selectedPackage}
                onClose={() => setSelectedPackage(null)}
                pkg={selectedPackage}
                onSuccess={(credited) => {
                    setFeedback({
                        type: 'success',
                        text: `Pembayaran berhasil! +${credited} saldo token telah ditambahkan ke akun Anda.`
                    });
                    setTimeout(loadData, 1000);
                }}
            />

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                        <Coins className="text-[#F8A01B]" size={24} />
                        <span>Token Saya</span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Kelola saldo dan riwayat token untuk membuka modul ujian dan bahan ajar berbayar.
                    </p>
                </div>
            </div>

            {/* Saldo Token Card (Clean & Elegan) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-[#F8A01B] shrink-0 shadow-xs">
                        <Coins size={28} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Saldo Token Aktif
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                {loading ? '...' : balance.toLocaleString('id-ID')}
                            </span>
                            <span className="text-xs font-bold text-[#F8A01B] uppercase tracking-wider">
                                Token
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Saldo aktif siap digunakan untuk membuka materi dan ujian berbayar.
                        </p>
                    </div>
                </div>

                <div className="self-start sm:self-auto shrink-0">
                    <div className="px-3.5 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-emerald-600" />
                        <span>Transaksi Aman & Instan</span>
                    </div>
                </div>
            </div>

            {feedback && (
                <div className={`p-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-between ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Tutup</button>
                </div>
            )}

            {/* Katalog Paket Top Up Token */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Zap className="text-[#F8A01B]" size={20} />
                            <span>Top Up Token</span>
                        </h2>
                        <p className="text-xs text-slate-500">
                            Pilih paket token koin untuk menambah saldo instan Anda
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm animate-pulse space-y-4">
                                <div className="h-6 bg-slate-100 rounded-md w-3/4"></div>
                                <div className="h-10 bg-slate-50 rounded-md w-full"></div>
                                <div className="h-8 bg-slate-100 rounded-md w-1/2"></div>
                            </div>
                        ))}
                    </div>
                ) : packages.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-sm">
                        Belum ada paket token yang aktif saat ini. Silakan hubungi admin.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {packages.map((pkg) => (
                            <div
                                key={pkg.id}
                                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                            >
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-slate-800 text-base">{pkg.name}</h3>
                                        <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-extrabold text-xs border border-amber-200">
                                            {pkg.token_amount} Token
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        {pkg.description || 'Akses cepat ujian & modul'}
                                    </p>
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Harga</span>
                                        <span className="text-lg font-extrabold text-[#030C4D]">
                                            Rp {Number(pkg.price_idr).toLocaleString('id-ID')}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleBuyPackage(pkg)}
                                        className="px-4 py-2 bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                                    >
                                        <span>Beli Sekarang</span>
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Riwayat Penggunaan & Top Up Token */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <History className="text-[#030C4D]" size={18} />
                            <span>Riwayat Transaksi & Penggunaan Token</span>
                        </h2>
                        <p className="text-xs text-slate-500">
                            Catatan penambahan saldo dan pengurangan token saat membuka materi atau ujian
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                            <tr>
                                <th className="py-3 px-5">Waktu</th>
                                <th className="py-3 px-5">Tipe</th>
                                <th className="py-3 px-5">Deskripsi</th>
                                <th className="py-3 px-5 text-right">Mutasi Token</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="py-10 text-center text-slate-400">
                                        Memuat riwayat transaksi...
                                    </td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-10 text-center text-slate-400">
                                        Belum ada riwayat transaksi token.
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((t) => {
                                    const isPositive = t.amount > 0;
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-5 text-slate-500">
                                                {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                            </td>
                                            <td className="py-3.5 px-5">
                                                {isPositive ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                                        <ArrowDownLeft size={12} />
                                                        Top Up
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                                                        <ArrowUpRight size={12} />
                                                        Pakai Token
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-5 font-medium text-slate-800">
                                                {t.description}
                                            </td>
                                            <td className={`py-3.5 px-5 text-right font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {isPositive ? `+${t.amount}` : t.amount} Token
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
