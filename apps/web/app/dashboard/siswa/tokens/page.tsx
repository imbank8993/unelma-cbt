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
    /** Bonus token ditulis admin di deskripsi, misalnya "(Bonus 2 token)". */
    const bonusOf = (pkg: TokenPackage) => Number(/bonus\s+(\d+)/i.exec(pkg.description || '')?.[1]) || 0;
    const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString('id-ID')}`;

    return (
        <div className="max-w-5xl mx-auto space-y-10 pb-16">
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
            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                            <Coins size={16} className="text-[#F8A01B]" /> Saldo token
                        </p>
                        <p className="mt-2 flex items-baseline gap-2">
                            <span className="text-5xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">{loading ? '…' : balance.toLocaleString('id-ID')}</span>
                            <span className="text-base text-slate-500">token</span>
                        </p>
                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                            {toppedUp.toLocaleString('id-ID')} ditambahkan · {used.toLocaleString('id-ID')} terpakai
                        </p>
                    </div>
                    <a href="#paket-token" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#030C4D] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B1A66] dark:bg-blue-600 dark:hover:bg-blue-500">
                        Top up <ArrowRight size={16} />
                    </a>
                </div>
                <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Token dipakai untuk membuka tryout premium dan materi eksklusif. Saldo tidak hangus.
                </p>
            </section>

            {feedback && (
                <div className={`p-4 rounded-xl text-sm font-medium flex items-center justify-between ${feedback.type === 'success' ? 'bg-slate-50 text-slate-800 border border-slate-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-semibold underline text-xs">Tutup</button>
                </div>
            )}

            {/* ── Paket ── */}
            <section id="paket-token" className="scroll-mt-24">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Pilih paket</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bayar sekali, saldo langsung bertambah.</p>

                {loading ? (
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 animate-pulse space-y-4 dark:border-slate-800 dark:bg-slate-900">
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
                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {packages.map((pkg) => {
                            const best = pkg.id === bestValueId;
                            const bonus = bonusOf(pkg);
                            return (
                                <article key={pkg.id}
                                    className={`relative flex flex-col rounded-2xl bg-white p-6 transition-shadow hover:shadow-md dark:bg-slate-900 ${best
                                        ? 'border-2 border-[#030C4D] dark:border-blue-500'
                                        : 'border border-slate-200 dark:border-slate-800'}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{pkg.name}</p>
                                        {best && <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-white dark:bg-blue-600">Paling hemat</span>}
                                    </div>
                                    <p className="mt-4 flex items-baseline gap-1.5">
                                        <span className="text-4xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">{pkg.token_amount}</span>
                                        <span className="text-sm text-slate-500">token</span>
                                    </p>
                                    <p className="mt-1 h-5 text-sm text-slate-500 dark:text-slate-400">{bonus > 0 ? `termasuk ${bonus} token bonus` : ''}</p>
                                    <div className="mt-6 flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{rupiah(Number(pkg.price_idr))}</p>
                                            <p className="text-xs text-slate-400">{rupiah(Number(pkg.price_idr) / Math.max(1, pkg.token_amount))} / token</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => handleBuyPackage(pkg)}
                                        className={`mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${best
                                            ? 'bg-[#030C4D] text-white hover:bg-[#0B1A66] dark:bg-blue-600 dark:hover:bg-blue-500'
                                            : 'border border-slate-300 text-slate-800 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                        Pilih paket
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
