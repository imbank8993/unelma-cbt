"use client";

import React from 'react';
import { ShieldCheck, Zap, BarChart3, Smartphone, Sparkles, CheckCircle2 } from 'lucide-react';

const FEATURES = [
    {
        icon: Zap,
        title: 'Auto-Save & Navigasi Cepat',
        description: 'Setiap jawaban tersimpan otomatis secara realtime. Navigasi nomor soal instan, lancar, dan aman dari risiko data hilang.',
        tag: 'Realtime Sync',
    },
    {
        icon: ShieldCheck,
        title: 'Keamanan Ujian Terintegrasi',
        description: 'Dilengkapi penguncian layar penuh (fullscreen lock), deteksi keluar jendela, serta kontrol proktor untuk menjaga integritas tes.',
        tag: 'Anti-Curang',
    },
    {
        icon: BarChart3,
        title: 'Penilaian & Analisis Otomatis',
        description: 'Koreksi instan untuk ragam bentuk soal dengan rekap skor akurat dan ekspor laporan nilai siap pakai dalam format Excel/PDF.',
        tag: 'Hasil Instan',
    },
    {
        icon: Smartphone,
        title: 'Akses Ringan Multi-Perangkat',
        description: 'Dapat diakses langsung melalui peramban web pada laptop, Chromebook, tablet, maupun smartphone tanpa perlu instalasi aplikasi rumit.',
        tag: 'Hemat Kuota',
    },
];

export default function LandingFeatures() {
    return (
        <section id="keunggulan" className="py-20 md:py-28 bg-white relative overflow-hidden">
            {/* Subtle ambient blur accents */}
            <div className="absolute top-1/2 -left-32 w-80 h-80 bg-blue-50/60 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 -right-32 w-80 h-80 bg-amber-50/60 rounded-full blur-3xl pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                {/* Header Section */}
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#030C4D] tracking-tight">
                        Dirancang Sederhana, <span className="text-[#F8A01B]">Cepat & Andal</span>
                    </h2>

                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
                        Fokus pada kemudahan pengalaman siswa saat mengerjakan ujian serta efisiensi guru dan proktor dalam mengelola asesmen pendidikan.
                    </p>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                    {FEATURES.map((item, idx) => (
                        <div
                            key={idx}
                            className="group relative bg-white rounded-2xl p-7 border border-slate-200/80 hover:border-[#030C4D]/25 shadow-xs hover:shadow-xl hover:shadow-[#030C4D]/5 transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between"
                        >
                            <div className="space-y-4">
                                <div className="w-12 h-12 rounded-xl bg-[#030C4D]/5 group-hover:bg-[#030C4D] text-[#030C4D] group-hover:text-white flex items-center justify-center transition-colors duration-300">
                                    <item.icon size={22} className="group-hover:scale-110 transition-transform duration-300" />
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#030C4D] transition-colors">
                                        {item.title}
                                    </h3>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        {item.description}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-5 mt-5 border-t border-slate-100 flex items-center gap-1.5 text-xs font-semibold text-[#030C4D]">
                                <CheckCircle2 size={14} className="text-[#F8A01B]" />
                                <span>Teruji & Terstandar</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
