"use client";

import React, { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, History, ArrowDownLeft, ArrowUpRight, BookOpen, ClipboardCheck, Coins, Gift, Plus, Sparkles } from 'lucide-react';
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

            {/* ── Dompet token ── */}
            <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#030C4D_0%,#0A1F7A_60%,#1E40AF_100%)] text-white shadow-[0_16px_40px_-16px_rgba(3,12,77,0.6)]">
                {/* Cahaya oranye lembut: gradien biasa, bukan filter blur (blur besar membuat area halaman gagal digambar). */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_60%_at_100%_0%,rgba(248,160,27,0.22),transparent_70%)]" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(70%_100%_at_100%_0%,black,transparent_75%)]" aria-hidden="true" />
                <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">Saldo token</p>
                        <div className="mt-3 flex items-center gap-4">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F8A01B] text-[#030C4D] shadow-[0_8px_20px_-6px_rgba(248,160,27,0.7)]">
                                <Coins size={28} strokeWidth={2} />
                            </span>
                            <p className="flex items-baseline gap-2">
                                <span className="text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">{loading ? '…' : balance.toLocaleString('id-ID')}</span>
                                <span className="text-lg font-medium text-blue-100">token</span>
                            </p>
                        </div>
                        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-100/90"><ShieldCheck size={16} className="text-[#F8A01B]" /> Pembayaran aman, saldo masuk instan.</p>
                    </div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-end">
                        <dl className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                                <dt className="text-xs font-medium text-blue-200">Total top up</dt>
                                <dd className="mt-1 text-xl font-bold tabular-nums">+{toppedUp.toLocaleString('id-ID')}</dd>
                            </div>
                            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
                                <dt className="text-xs font-medium text-blue-200">Terpakai</dt>
                                <dd className="mt-1 text-xl font-bold tabular-nums">{used.toLocaleString('id-ID')}</dd>
                            </div>
                        </dl>
                        <a href="#paket-token" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F8A01B] px-5 py-3 text-sm font-bold text-[#030C4D] shadow-sm transition-colors hover:bg-[#FFB443]">
                            <Plus size={16} strokeWidth={2.5} /> Top up token
                        </a>
                    </div>
                </div>
            </section>

            {feedback && (
                <div className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between ${feedback.type === 'success' ? 'bg-blue-50 text-[#030C4D] border border-blue-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Tutup</button>
                </div>
            )}

            {/* ── Kegunaan token ── */}
            <section>
                <h2 className="text-xl font-bold tracking-tight text-[#030C4D] dark:text-white">Token dipakai untuk</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                        { icon: ClipboardCheck, title: 'Ujian & tryout berbayar', text: 'Tryout premium lengkap dengan pembahasan dan peringkat.' },
                        { icon: BookOpen, title: 'Materi premium', text: 'BAB dan subbab eksklusif di Ruang Belajar.' },
                    ].map(item => (
                        <div key={item.title} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#E8890A] dark:bg-orange-500/10 dark:text-orange-300"><item.icon size={20} /></span>
                            <div>
                                <p className="text-base font-semibold text-slate-900 dark:text-white">{item.title}</p>
                                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{item.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Paket top up ── */}
            <section id="paket-token" className="scroll-mt-24">
                <h2 className="text-xl font-bold tracking-tight text-[#030C4D] dark:text-white">Pilih paket top up</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Bayar sekali, saldo langsung bertambah dan tidak hangus.</p>

                {loading ? (
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200 animate-pulse space-y-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="h-5 bg-slate-100 rounded-md w-1/2 dark:bg-slate-800"></div>
                                <div className="h-10 bg-slate-100 rounded-md w-3/4 dark:bg-slate-800"></div>
                                <div className="h-11 bg-slate-100 rounded-xl w-full dark:bg-slate-800"></div>
                            </div>
                        ))}
                    </div>
                ) : packages.length === 0 ? (
                    <div className="mt-5 bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-sm dark:border-slate-800 dark:bg-slate-900">
                        Belum ada paket token yang aktif saat ini. Silakan hubungi admin.
                    </div>
                ) : (
                    <div className="mt-5 grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
                        {packages.map((pkg) => {
                            const best = pkg.id === bestValueId;
                            const bonus = bonusOf(pkg);
                            const perToken = Number(pkg.price_idr) / Math.max(1, pkg.token_amount);
                            return (
                                <article key={pkg.id}
                                    className={`relative flex flex-col overflow-hidden rounded-2xl transition-all ${best
                                        ? 'bg-[#030C4D] text-white shadow-[0_16px_36px_-16px_rgba(3,12,77,0.7)] ring-2 ring-[#F8A01B] md:-translate-y-1'
                                        : 'border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900'}`}>
                                    {best && (
                                        <div className="flex items-center justify-center gap-1.5 bg-[#F8A01B] py-1.5 text-xs font-bold uppercase tracking-wider text-[#030C4D]">
                                            <Sparkles size={13} /> Paling hemat
                                        </div>
                                    )}
                                    <div className="flex flex-1 flex-col p-6">
                                        <p className={`text-sm font-semibold uppercase tracking-wide ${best ? 'text-blue-200' : 'text-[#2563EB] dark:text-blue-300'}`}>{pkg.name}</p>
                                        <div className="mt-3 flex items-center gap-3">
                                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${best ? 'bg-[#F8A01B] text-[#030C4D]' : 'bg-orange-50 text-[#E8890A] dark:bg-orange-500/10 dark:text-orange-300'}`}><Coins size={20} /></span>
                                            <p className="flex items-baseline gap-1.5">
                                                <span className={`text-4xl font-bold leading-none tabular-nums ${best ? '' : 'text-[#030C4D] dark:text-white'}`}>{pkg.token_amount}</span>
                                                <span className={`text-base font-medium ${best ? 'text-blue-100' : 'text-slate-500'}`}>token</span>
                                            </p>
                                        </div>
                                        {bonus > 0 && (
                                            <span className={`mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${best ? 'bg-white/10 text-[#FFC266]' : 'bg-orange-50 text-[#C2410C] dark:bg-orange-500/10 dark:text-orange-300'}`}>
                                                <Gift size={13} /> Termasuk bonus {bonus} token
                                            </span>
                                        )}
                                        <p className={`mt-3 text-sm leading-relaxed ${best ? 'text-blue-100/90' : 'text-slate-600 dark:text-slate-400'}`}>{pkg.description || 'Akses ujian & materi premium'}</p>
                                        <div className={`mt-auto pt-5`}>
                                            <div className={`border-t pt-4 ${best ? 'border-white/15' : 'border-slate-100 dark:border-slate-800'}`}>
                                                <p className={`text-2xl font-bold tabular-nums ${best ? '' : 'text-slate-900 dark:text-white'}`}>{rupiah(Number(pkg.price_idr))}</p>
                                                <p className={`text-xs ${best ? 'text-blue-200' : 'text-slate-500'}`}>{rupiah(perToken)} per token</p>
                                            </div>
                                            <button type="button" onClick={() => handleBuyPackage(pkg)}
                                                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${best
                                                    ? 'bg-[#F8A01B] text-[#030C4D] hover:bg-[#FFB443]'
                                                    : 'bg-[#030C4D] text-white hover:bg-[#1E40AF] dark:bg-blue-600 dark:hover:bg-blue-500'}`}>
                                                Beli paket <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── Riwayat ── */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-[#030C4D] dark:text-white">Riwayat token</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Top up dan pemakaian saat membuka ujian atau materi.</p>
                    </div>
                    <History size={20} className="shrink-0 text-slate-400" />
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
                                <li key={t.id} className="flex items-center gap-4 px-5 py-4">
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isPositive ? 'bg-blue-50 text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300' : 'bg-orange-50 text-[#E8890A] dark:bg-orange-500/10 dark:text-orange-300'}`}>
                                        {isPositive ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{t.description || (isPositive ? 'Top up token' : 'Pemakaian token')}</p>
                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{isPositive ? 'Top up' : 'Pakai token'} · {new Date(t.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                    </div>
                                    <span className={`shrink-0 text-base font-bold tabular-nums ${isPositive ? 'text-[#2563EB] dark:text-blue-300' : 'text-[#E8890A] dark:text-orange-300'}`}>
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
