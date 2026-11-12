"use client";

import React, { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, History, ArrowDownLeft, ArrowUpRight, BookOpen, ClipboardCheck, Wallet } from 'lucide-react';
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

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
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

            {/* Kartu dompet token */}
            <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#030C4D_0%,#0B2A8F_55%,#2563EB_100%)] p-6 text-white shadow-[0_12px_32px_-12px_rgba(3,12,77,0.55)] sm:p-8">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(70%_100%_at_100%_0%,black,transparent_75%)]" aria-hidden="true" />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 sm:flex"><Wallet size={22} strokeWidth={1.75} /></span>
                        <div>
                            <p className="text-sm font-medium text-blue-100/90">Saldo token aktif</p>
                            <p className="mt-1 flex items-baseline gap-2">
                                <span className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{loading ? '…' : balance.toLocaleString('id-ID')}</span>
                                <span className="text-sm font-medium text-blue-100/90">token</span>
                            </p>
                            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-100/80"><ShieldCheck size={14} /> Pembayaran aman, saldo masuk instan</p>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 divide-x divide-white/15 sm:flex">
                        <div className="pr-6">
                            <dd className="text-xl font-semibold tabular-nums">+{toppedUp.toLocaleString('id-ID')}</dd>
                            <dt className="mt-1 text-xs text-blue-100/80">Total top up</dt>
                        </div>
                        <div className="pl-6">
                            <dd className="text-xl font-semibold tabular-nums">{used.toLocaleString('id-ID')}</dd>
                            <dt className="mt-1 text-xs text-blue-100/80">Token terpakai</dt>
                        </div>
                    </dl>
                </div>
            </section>

            {feedback && (
                <div className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between ${feedback.type === 'success' ? 'bg-blue-50 text-[#030C4D] border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Tutup</button>
                </div>
            )}

            {/* Kegunaan token */}
            <div className="grid gap-3 sm:grid-cols-2">
                {[
                    { icon: ClipboardCheck, title: 'Ujian & tryout berbayar', text: 'Buka tryout premium lengkap dengan pembahasan dan peringkat.' },
                    { icon: BookOpen, title: 'Materi premium', text: 'Akses BAB dan subbab eksklusif di Ruang Belajar.' },
                ].map(item => (
                    <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-slate-800 dark:bg-slate-900">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2563EB] shadow-xs dark:bg-slate-800 dark:text-blue-300"><item.icon size={18} /></span>
                        <div>
                            <p className="text-sm font-semibold text-[#030C4D] dark:text-white">{item.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Paket top up */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top up token</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Pilih paket, bayar, dan saldo langsung bertambah.</p>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 animate-pulse space-y-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="h-5 bg-slate-100 rounded-md w-1/2 dark:bg-slate-800"></div>
                                <div className="h-9 bg-slate-100 rounded-md w-3/4 dark:bg-slate-800"></div>
                                <div className="h-10 bg-slate-100 rounded-xl w-full dark:bg-slate-800"></div>
                            </div>
                        ))}
                    </div>
                ) : packages.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-sm dark:border-slate-800 dark:bg-slate-900">
                        Belum ada paket token yang aktif saat ini. Silakan hubungi admin.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {packages.map((pkg) => {
                            const best = pkg.id === bestValueId;
                            return (
                                <div key={pkg.id}
                                    className={`relative flex flex-col rounded-2xl p-6 transition-all ${best
                                        ? 'bg-[linear-gradient(160deg,#0B2A8F_0%,#2563EB_100%)] text-white shadow-[0_12px_28px_-12px_rgba(37,99,235,0.6)]'
                                        : 'border border-slate-200 bg-white hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900'}`}>
                                    {best && <span className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#2563EB]">Paling hemat</span>}
                                    <p className={`text-sm font-medium ${best ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>{pkg.name}</p>
                                    <p className="mt-2 flex items-baseline gap-1.5">
                                        <span className={`text-3xl font-semibold tabular-nums ${best ? '' : 'text-[#030C4D] dark:text-white'}`}>{pkg.token_amount}</span>
                                        <span className={`text-sm ${best ? 'text-blue-100' : 'text-slate-500'}`}>token</span>
                                    </p>
                                    <p className={`mt-2 text-xs leading-relaxed ${best ? 'text-blue-100/90' : 'text-slate-500 dark:text-slate-400'}`}>{pkg.description || 'Akses cepat ujian & materi premium'}</p>
                                    <div className={`mt-5 flex items-center justify-between border-t pt-4 ${best ? 'border-white/20' : 'border-slate-100 dark:border-slate-800'}`}>
                                        <span className={`text-lg font-semibold ${best ? '' : 'text-slate-900 dark:text-white'}`}>Rp {Number(pkg.price_idr).toLocaleString('id-ID')}</span>
                                        <button type="button" onClick={() => handleBuyPackage(pkg)}
                                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${best
                                                ? 'bg-white text-[#0B2A8F] hover:bg-blue-50'
                                                : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'}`}>
                                            Beli <ArrowRight size={15} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Riwayat */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] dark:bg-slate-800 dark:text-blue-300"><History size={17} /></span>
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Riwayat token</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Top up dan pemakaian saat membuka ujian atau materi.</p>
                    </div>
                </div>
                {loading ? (
                    <p className="py-10 text-center text-sm text-slate-400">Memuat riwayat…</p>
                ) : transactions.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-400">Belum ada riwayat token.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {transactions.map((t) => {
                            const isPositive = t.amount > 0;
                            return (
                                <li key={t.id} className="flex items-center gap-4 px-5 py-3.5">
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isPositive ? 'bg-blue-50 text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                        {isPositive ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{t.description || (isPositive ? 'Top up token' : 'Pemakaian token')}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{isPositive ? 'Top up' : 'Pakai token'} · {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                    </div>
                                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${isPositive ? 'text-[#2563EB] dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {isPositive ? `+${t.amount}` : t.amount}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
