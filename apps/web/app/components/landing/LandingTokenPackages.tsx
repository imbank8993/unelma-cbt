"use client";

import React from 'react';
import { Ticket, Check, Sparkles, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface PackageItem {
    id: string;
    name: string;
    tokens: number;
    price: string;
    badge?: string;
    isPopular?: boolean;
    description: string;
    features: string[];
}

const PACKAGES: PackageItem[] = [
    {
        id: 'starter',
        name: 'Paket Starter',
        tokens: 100,
        price: 'Rp 250.000',
        description: 'Ideal untuk tryout kelas, ujian harian bertahap, atau evaluasi uji coba perdana.',
        features: [
            '100 Token Peserta Ujian',
            'Akses Semua Jenis Butir Soal',
            'Deteksi Kecurangan Standar',
            'Analisis Nilai & Ekspor Excel',
            'Masa Aktif 1 Semester'
        ]
    },
    {
        id: 'sekolah',
        name: 'Paket Sekolah Unggulan',
        tokens: 500,
        price: 'Rp 950.000',
        badge: 'Paling Populer',
        isPopular: true,
        description: 'Pilihan paling efisien untuk pelaksanaan PAS/PAT serentak satu jenjang madrasah.',
        features: [
            '500 Token Peserta Ujian',
            'Dukungan Mode Proktor & Pengawas',
            'Sinkronisasi Realtime Anti-Kecurangan',
            'Bank Soal Terintegrasi',
            'Ekspor Analisis Butir Soal IRT',
            'Prioritas Bantuan Teknis'
        ]
    },
    {
        id: 'lembaga',
        name: 'Paket Institusi / Yayasan',
        tokens: 1500,
        price: 'Rp 2.450.000',
        badge: 'Kapasitas Besar',
        description: 'Didesain untuk gabungan madrasah, KKM, atau yayasan pendidikan skala besar.',
        features: [
            '1.500+ Token Peserta Ujian',
            'Manajemen Multi-Kelas & Jadwal Paralel',
            'Kapasitas Server Dedicated Anti-Lag',
            'Audit Keamanan Lengkap & Log Ujian',
            'Dukungan Penuh Tim Ahli Unelma'
        ]
    }
];

export default function LandingTokenPackages() {
    return (
        <section id="token" className="py-20 md:py-28 bg-white relative overflow-hidden">
            <div className="container mx-auto px-4 md:px-6 relative z-10">
                
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F8A01B]/15 text-[#b36c03] text-xs font-bold uppercase tracking-wider">
                        <Ticket size={14} className="text-[#F8A01B]" />
                        <span>Kapasitas Fleksibel</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-[#030C4D] tracking-tight">
                        Paket Token CBT Sesuai Kebutuhan
                    </h2>
                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                        Bayar sesuai kuota token yang digunakan oleh madrasah Anda. Tanpa biaya instalasi server rumit.
                    </p>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
                    {PACKAGES.map((pkg) => (
                        <div
                            key={pkg.id}
                            className={`rounded-3xl p-7 sm:p-8 flex flex-col justify-between transition-all duration-300 relative ${
                                pkg.isPopular
                                    ? 'bg-[#030C4D] text-white shadow-2xl shadow-[#030C4D]/30 border-2 border-[#F8A01B] scale-100 md:-translate-y-2'
                                    : 'bg-white text-slate-800 border border-slate-200 shadow-sm hover:shadow-lg'
                            }`}
                        >
                            {pkg.badge && (
                                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#F8A01B] text-[#030C4D] text-[11px] font-black uppercase tracking-wider shadow-md">
                                    {pkg.badge}
                                </div>
                            )}

                            <div>
                                <div className="space-y-2 mb-6">
                                    <h3 className={`text-xl font-black tracking-tight ${pkg.isPopular ? 'text-white' : 'text-[#030C4D]'}`}>
                                        {pkg.name}
                                    </h3>
                                    <p className={`text-xs leading-relaxed ${pkg.isPopular ? 'text-white/80' : 'text-slate-500'}`}>
                                        {pkg.description}
                                    </p>
                                </div>

                                <div className="mb-6 pb-6 border-b border-slate-100 dark:border-white/10">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl sm:text-4xl font-black tracking-tight">
                                            {pkg.price}
                                        </span>
                                    </div>
                                    <span className={`text-xs font-semibold ${pkg.isPopular ? 'text-[#F8A01B]' : 'text-[#030C4D]'}`}>
                                        Termasuk {pkg.tokens} Token Ujian Siswa
                                    </span>
                                </div>

                                {/* Feature List */}
                                <ul className="space-y-3.5 mb-8">
                                    {pkg.features.map((feat, idx) => (
                                        <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm">
                                            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                                pkg.isPopular ? 'bg-[#F8A01B] text-[#030C4D]' : 'bg-blue-50 text-[#030C4D]'
                                            }`}>
                                                <Check size={11} strokeWidth={3} />
                                            </div>
                                            <span className={pkg.isPopular ? 'text-white/90' : 'text-slate-600'}>
                                                {feat}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <a
                                    href="https://wa.me/6281234567890?text=Halo%20Unelma%20Edu,%20saya%20tertarik%20konsultasi%20paket%20token%20CBT"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                                        pkg.isPopular
                                            ? 'bg-[#F8A01B] hover:bg-[#e08e15] text-[#030C4D] shadow-[#F8A01B]/20'
                                            : 'bg-[#030C4D] hover:bg-[#020510] text-white shadow-[#030C4D]/20'
                                    }`}
                                >
                                    <span>Pesan Paket Token</span>
                                    <ArrowRight size={14} />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
