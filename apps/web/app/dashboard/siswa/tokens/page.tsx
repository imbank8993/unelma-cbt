"use client";

import React, { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { Coins, Zap, CheckCircle2, Clock, ArrowRight, ShieldCheck, History, ArrowDownLeft, ArrowUpRight, BookOpen, ClipboardCheck } from 'lucide-react';
import {
    getUserTokenBalance,
    getUserTokenTransactions,
    getPublicTokenPackages,
    createPayment,
    type TokenPackage,
    type TokenTransaction
} from '@/lib/api/tokens';

export default function SiswaTokensPage() {
    const [balance, setBalance] = useState<number>(0);
    const [packages, setPackages] = useState<TokenPackage[]>([]);
    const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [purchasingId, setPurchasingId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [balRes, pkgRes, txRes] = await Promise.all([
                getUserTokenBalance(),
                getPublicTokenPackages(),
                getUserTokenTransactions(),
            ]);

            if (balRes.success) setBalance(balRes.token_balance);
            if (pkgRes.success && pkgRes.packages) setPackages(pkgRes.packages);
            if (txRes.success && txRes.transactions) setTransactions(txRes.transactions);
        } catch (err) {
            console.error('Error loading token data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleBuyPackage = async (pkg: TokenPackage) => {
        setPurchasingId(pkg.id);
        setFeedback(null);

        try {
            const res = await createPayment({ package_id: pkg.id });
            if (!res.success) {
                throw new Error(res.error || 'Gagal memulai pembayaran.');
            }
            if (!res.snap_token) {
                throw new Error('Token pembayaran tidak valid.');
            }

            if (typeof window !== 'undefined' && (window as any).snap) {
                (window as any).snap.pay(res.snap_token, {
                    onSuccess: () => {
                        setFeedback({ type: 'success', text: `Pembayaran ${pkg.name} berhasil! Saldo token Anda telah bertambah.` });
                        setTimeout(loadData, 1500);
                    },
                    onPending: () => {
                        setFeedback({ type: 'success', text: 'Pesanan dibuat. Silakan selesaikan pembayaran di Midtrans.' });
                    },
                    onError: () => {
                        setFeedback({ type: 'error', text: 'Pembayaran gagal atau dibatalkan.' });
                    },
                    onClose: () => {
                        setPurchasingId(null);
                    }
                });
            } else if (res.redirect_url) {
                window.location.href = res.redirect_url;
            }
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || 'Terjadi kesalahan sistem.' });
        } finally {
            setPurchasingId(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-16">
            <Script
                src="https://app.sandbox.midtrans.com/snap/snap.js"
                strategy="lazyOnload"
                data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''}
            />

            {/* Banner Saldo Token */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#030C4D] via-[#071360] to-[#030C4D] text-white p-6 md:p-8 shadow-xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#F8A01B]/20 rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#F8A01B] text-xs font-bold uppercase tracking-wider">
                            <Coins size={14} />
                            <span>Dompet Token Siswa</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                            Saldo Token Saya
                        </h1>
                        <p className="text-xs md:text-sm text-white/75 max-w-lg leading-relaxed">
                            Gunakan saldo token Anda untuk membuka akses modul ujian dan bahan ajar berbayar.
                        </p>
                    </div>

                    <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20 text-center sm:text-right shrink-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/70 block mb-1">
                            Sisa Saldo Aktif
                        </span>
                        <div className="flex items-center justify-center sm:justify-end gap-2.5">
                            <span className="text-4xl md:text-5xl font-black text-[#F8A01B]">
                                {loading ? '...' : balance.toLocaleString('id-ID')}
                            </span>
                            <span className="text-xs font-extrabold uppercase tracking-wider text-white/80">
                                Token
                            </span>
                        </div>
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
                                    disabled={purchasingId === pkg.id}
                                    className="px-4 py-2 bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
                                >
                                    <span>{purchasingId === pkg.id ? 'Memproses...' : 'Beli Sekarang'}</span>
                                    <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
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
