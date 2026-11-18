"use client";

import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowDownLeft, ArrowUpRight, Coins } from 'lucide-react';
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
        const timer = window.setTimeout(() => void loadData(), 0);
        return () => window.clearTimeout(timer);
    }, []);

    const handleBuyPackage = (pkg: TokenPackage) => {
        setSelectedPackage(pkg);
    };

    // Paket paling hemat: token per rupiah tertinggi (hanya ditandai bila ada pilihan).
    const bestValueId = packages.length > 1
        ? [...packages].sort((a, b) => b.token_amount / Math.max(1, Number(b.price_idr)) - a.token_amount / Math.max(1, Number(a.price_idr)))[0]?.id
        : undefined;
    const toppedUp = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const used = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum - t.amount, 0);
    const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    return (
        <div className="w-full space-y-6 pb-16">
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

            {/* ── Saldo ── */}
            <section aria-label="Ringkasan token" className="rounded-2xl bg-[#030C4D] p-4 text-white sm:px-6 sm:py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="flex items-center gap-2 text-xs font-medium text-blue-100">
                            <Coins size={15} className="text-[#FFB640]" /> Saldo tersedia
                        </p>
                        <p className="mt-2 flex items-baseline gap-2">
                            <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums text-[#FFB640]">{loading ? '…' : balance.toLocaleString('id-ID')}</span>
                            <span className="text-sm text-blue-100">token</span>
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 lg:w-[360px] lg:shrink-0 sm:gap-3">
                        <div className="flex h-16 min-w-0 flex-col justify-center rounded-xl border border-white/15 bg-white/5 px-2.5 sm:px-3"><p className="text-[11px] text-blue-100">Ditambahkan</p><p className="mt-1 text-lg font-semibold tabular-nums">{toppedUp.toLocaleString('id-ID')}</p></div>
                        <div className="flex h-16 min-w-0 flex-col justify-center rounded-xl border border-white/15 bg-white/5 px-2.5 sm:px-3"><p className="text-[11px] text-blue-100">Terpakai</p><p className="mt-1 text-lg font-semibold tabular-nums">{used.toLocaleString('id-ID')}</p></div>
                        <a href="#paket-token" className="inline-flex h-16 min-w-0 items-center justify-center gap-2 rounded-xl border border-transparent bg-[#F8A01B] px-2.5 text-xs font-semibold text-[#030C4D] transition hover:bg-[#FFB640] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                            Top up <ArrowRight size={15} />
                        </a>
                    </div>
                </div>
            </section>

            {feedback && (
                <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between ${feedback.type === 'success' ? 'bg-slate-50 text-slate-800 border border-slate-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-semibold underline text-xs">Tutup</button>
                </div>
            )}

            {/* ── Paket ── */}
            <section id="paket-token" className="scroll-mt-24">
                <h2 className="text-lg font-semibold tracking-tight text-[#030C4D] dark:text-white">Pilih paket</h2>

                {loading ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-xl p-4 border border-slate-200 animate-pulse space-y-3 dark:border-slate-800 dark:bg-slate-900">
                                <div className="h-4 bg-slate-100 rounded w-1/3 dark:bg-slate-800"></div>
                                <div className="h-9 bg-slate-100 rounded w-1/2 dark:bg-slate-800"></div>
                                <div className="h-10 bg-slate-100 rounded-xl w-full dark:bg-slate-800"></div>
                            </div>
                        ))}
                    </div>
                ) : packages.length === 0 ? (
                    <div className="mt-5 bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-sm dark:border-slate-800 dark:bg-slate-900">
                        Belum ada paket token yang aktif saat ini. Silakan hubungi admin.
                    </div>
                ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {packages.map((pkg) => {
                            const best = pkg.id === bestValueId;
                            return (
                                <article key={pkg.id}
                                    className={`flex min-w-0 flex-col rounded-xl border bg-white p-4 transition-colors dark:bg-slate-900 ${best
                                        ? 'border-[#F8A01B]'
                                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-[#030C4D] dark:text-blue-200">{pkg.name}</p>
                                        {best && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:bg-orange-500/15 dark:text-orange-200">Paling hemat</span>}
                                    </div>
                                    <p className="mt-3 flex items-baseline gap-1.5">
                                        <span className="text-3xl font-semibold tracking-tight tabular-nums text-[#030C4D] dark:text-white">{pkg.token_amount}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">token</span>
                                    </p>
                                    <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{rupiah(Number(pkg.price_idr))}</p>
                                    <button type="button" onClick={() => handleBuyPackage(pkg)}
                                        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${best
                                            ? 'bg-[#F8A01B] text-[#030C4D] hover:bg-[#FFB640]'
                                            : 'bg-[#030C4D] text-white hover:bg-[#102B77] dark:bg-blue-600 dark:hover:bg-blue-500'}`}>
                                        Pilih paket <ArrowRight size={14} />
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── Riwayat ── */}
            <section>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Riwayat</h2>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    {loading ? (
                        <p className="py-10 text-center text-sm text-slate-400">Memuat riwayat…</p>
                    ) : transactions.length === 0 ? (
                        <p className="py-10 text-center text-sm text-slate-400">Belum ada riwayat token.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {transactions.map((t) => {
                                const isPositive = t.amount > 0;
                                return (
                                    <li key={t.id} className="flex items-center gap-4 px-5 py-4">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                            {isPositive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{t.description || (isPositive ? 'Top up token' : 'Pemakaian token')}</p>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                        </div>
                                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${isPositive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                                            {isPositive ? `+${t.amount}` : t.amount}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </section>
        </div>
    );
}
