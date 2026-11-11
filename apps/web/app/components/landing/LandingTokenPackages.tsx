"use client";

import React, { useEffect, useState } from 'react';
import { Ticket, Check, Sparkles, ArrowRight, ShieldCheck, Coins, Zap } from 'lucide-react';
import { getPublicTokenPackages, type TokenPackage } from '@/lib/api/tokens';
import CustomPaymentModal from '@/app/components/tokens/CustomPaymentModal';

export default function LandingTokenPackages() {
    const [packages, setPackages] = useState<TokenPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPackage, setSelectedPackage] = useState<TokenPackage | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        let mounted = true;
        getPublicTokenPackages().then((res) => {
            if (!mounted) return;
            if (res.success && res.packages && res.packages.length > 0) {
                setPackages(res.packages);
            } else {
                // Fallback default starter packages
                setPackages([
                    { id: '1', name: 'Paket Starter', token_amount: 5, price_idr: 25000, description: '5 Token untuk mencoba modul ujian & bahan ajar favorit', is_active: true },
                    { id: '2', name: 'Paket Standar', token_amount: 12, price_idr: 50000, description: '12 Token (Bonus 2 token) untuk persiapan belajar mingguan', is_active: true },
                    { id: '3', name: 'Paket Premium', token_amount: 30, price_idr: 100000, description: '30 Token (Bonus 10 token) akses intensif semua modul & tryout', is_active: true },
                ]);
            }
            setLoading(false);
        }).catch(() => {
            if (mounted) setLoading(false);
        });

        return () => { mounted = false; };
    }, []);

    const handleBuyToken = (pkg: TokenPackage) => {
        setSelectedPackage(pkg);
    };

    return (
        <section id="paket-token" className="py-20 md:py-28 bg-slate-50 relative overflow-hidden">
            <CustomPaymentModal
                isOpen={!!selectedPackage}
                onClose={() => setSelectedPackage(null)}
                pkg={selectedPackage}
                onSuccess={(credited) => {
                    setFeedback({
                        type: 'success',
                        text: `Pembayaran berhasil! +${credited} saldo token telah ditambahkan ke akun Anda.`
                    });
                }}
            />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                
                {/* Header Title */}
                <div className="text-center max-w-3xl mx-auto mb-14 space-y-4">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#030C4D]/5 border border-[#030C4D]/10 text-[#030C4D] text-xs font-bold uppercase tracking-wider">
                        <Coins size={14} className="text-[#F8A01B]" />
                        <span>Sistem Koin Token Terpadu</span>
                    </div>

                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
                        Pilihan Paket <span className="text-[#F8A01B]">Token Unelma</span>
                    </h2>

                    <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                        Beli token sesuai kebutuhan belajar Anda. Token digunakan untuk membuka akses modul ujian dan bahan ajar eksklusif di dashboard siswa.
                    </p>

                    {feedback && (
                        <div className={`p-4 rounded-xl text-sm font-semibold max-w-lg mx-auto ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            {feedback.text}
                        </div>
                    )}
                </div>

                {/* Packages Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
                    {loading ? (
                        [1, 2, 3].map((i) => (
                            <div key={i} className="h-96 rounded-3xl bg-white border border-slate-200/80 animate-pulse p-8" />
                        ))
                    ) : (
                        packages.map((pkg, idx) => {
                            const isFeatured = idx === 1 || packages.length === 1;
                            return (
                                <div
                                    key={pkg.id}
                                    className={`relative rounded-3xl transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                                        isFeatured
                                            ? 'bg-gradient-to-b from-[#030C4D] to-[#0a1a5c] text-white shadow-2xl shadow-[#030C4D]/25 ring-2 ring-[#F8A01B] md:-translate-y-3'
                                            : 'bg-white text-slate-800 border border-slate-200/80 shadow-lg hover:shadow-xl'
                                    }`}
                                >
                                    {isFeatured && (
                                        <div className="bg-[#F8A01B] text-[#030C4D] font-extrabold text-[11px] uppercase tracking-wider py-1.5 px-4 text-center">
                                            Paling Populer & Hemat
                                        </div>
                                    )}

                                    <div className="p-7 sm:p-8 space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
                                                <h3 className="text-xl font-bold tracking-tight">
                                                    {pkg.name}
                                                </h3>
                                                <p className={`text-xs ${isFeatured ? 'text-white/70' : 'text-slate-500'}`}>
                                                    {pkg.description || 'Akses ujian dan bahan ajar terstruktur'}
                                                </p>
                                            </div>
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isFeatured ? 'bg-white/10 text-[#F8A01B]' : 'bg-[#030C4D]/5 text-[#030C4D]'}`}>
                                                <Coins size={24} />
                                            </div>
                                        </div>

                                        {/* Token Amount Badge */}
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl md:text-5xl font-black tracking-tight text-[#F8A01B]">
                                                {pkg.token_amount}
                                            </span>
                                            <span className={`text-sm font-semibold uppercase tracking-wider ${isFeatured ? 'text-white/70' : 'text-slate-500'}`}>
                                                Token Koin
                                            </span>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100/10">
                                            <div className="text-xs uppercase tracking-wider font-semibold opacity-70 mb-1">
                                                Harga Paket
                                            </div>
                                            <div className="text-2xl sm:text-3xl font-extrabold">
                                                Rp {Number(pkg.price_idr).toLocaleString('id-ID')}
                                            </div>
                                        </div>

                                        {/* Features List */}
                                        <ul className="space-y-3 text-xs sm:text-sm pt-2">
                                            <li className="flex items-center gap-2.5">
                                                <Check size={16} className="text-[#F8A01B] shrink-0" />
                                                <span>Akses bahan ajar dan modul PDF</span>
                                            </li>
                                            <li className="flex items-center gap-2.5">
                                                <Check size={16} className="text-[#F8A01B] shrink-0" />
                                                <span>Dapat digunakan untuk ujian berbayar</span>
                                            </li>
                                            <li className="flex items-center gap-2.5">
                                                <Check size={16} className="text-[#F8A01B] shrink-0" />
                                                <span>Masa aktif saldo selamanya (tanpa hangus)</span>
                                            </li>
                                            <li className="flex items-center gap-2.5">
                                                <Check size={16} className="text-[#F8A01B] shrink-0" />
                                                <span>Pembayaran instan QRIS, VA, & E-Wallet via Midtrans</span>
                                            </li>
                                        </ul>
                                    </div>

                                    {/* Action Button */}
                                    <div className="p-7 sm:p-8 pt-0">
                                        <button
                                            type="button"
                                            onClick={() => handleBuyToken(pkg)}
                                            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                                                isFeatured
                                                    ? 'bg-[#F8A01B] hover:bg-[#e08e15] text-[#030C4D]'
                                                    : 'bg-[#030C4D] hover:bg-[#020510] text-white'
                                            }`}
                                        >
                                            <Zap size={16} />
                                            <span>Beli Paket Sekarang</span>
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Bottom Assurance Note */}
                <div className="mt-14 max-w-2xl mx-auto text-center bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-slate-600">
                    <ShieldCheck size={28} className="text-[#030C4D] shrink-0" />
                    <p className="text-left">
                        Transaksi aman didukung oleh payment gateway <strong>Midtrans</strong> resmi. Saldo token otomatis bertambah seketika setelah pembayaran terverifikasi.
                    </p>
                </div>

            </div>
        </section>
    );
}
