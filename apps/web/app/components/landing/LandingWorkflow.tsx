"use client";

import React from 'react';
import Link from 'next/link';
import { UserCheck, CalendarCheck, Award, ArrowRight, ShieldCheck } from 'lucide-react';

const STEPS = [
    {
        number: '01',
        icon: UserCheck,
        title: 'Masuk dengan Google',
        description: 'Cukup satu klik menggunakan akun Google resmi. Profil dan identitas otomatis terhubung tanpa perlu kata sandi baru.',
    },
    {
        number: '02',
        icon: CalendarCheck,
        title: 'Pilih Jadwal Ujian',
        description: 'Buka modul atau jadwal evaluasi yang telah disiapkan proktor. Konfirmasi data diri dan mulai pengerjaan soal.',
    },
    {
        number: '03',
        icon: Award,
        title: 'Kerjakan & Terbit Skor',
        description: 'Jawab soal dengan panduan waktu akurat. Jawaban tersimpan otomatis dan rekap nilai siap diproses oleh guru.',
    },
];

export default function LandingWorkflow() {
    return (
        <section id="alur" className="py-20 md:py-28 bg-slate-50/60 relative overflow-hidden border-y border-slate-100">
            {/* Subtle glow accent */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-blue-50/40 via-amber-50/40 to-transparent blur-3xl pointer-events-none" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#030C4D] tracking-tight">
                        3 Langkah Mudah <span className="text-[#F8A01B]">Memulai Ujian</span>
                    </h2>

                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
                        Alur asesmen yang ringkas dan bebas hambatan, mempermudah siswa langsung fokus pada materi soal tanpa kendala teknis.
                    </p>
                </div>

                {/* Steps Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
                    {STEPS.map((step, idx) => (
                        <div
                            key={idx}
                            className="relative bg-white rounded-2xl p-8 border border-slate-200/80 shadow-xs hover:shadow-xl hover:shadow-[#030C4D]/5 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between group"
                        >
                            {/* Step Number Watermark / Badge */}
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-3xl font-black text-slate-200 group-hover:text-[#F8A01B] transition-colors">
                                    {step.number}
                                </span>
                                <div className="w-12 h-12 rounded-xl bg-[#030C4D]/5 text-[#030C4D] group-hover:bg-[#030C4D] group-hover:text-white flex items-center justify-center transition-colors">
                                    <step.icon size={22} />
                                </div>
                            </div>

                            <div className="space-y-2 mb-6">
                                <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#030C4D] transition-colors">
                                    {step.title}
                                </h3>
                                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                                    {step.description}
                                </p>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-[#F8A01B] group-hover:text-[#030C4D] transition-colors">
                                <span>Langkah {idx + 1} Selesai</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Callout Card */}
                <div className="mt-16 max-w-4xl mx-auto bg-gradient-to-r from-white via-white to-amber-50/40 rounded-3xl p-8 md:p-10 border border-slate-200 shadow-md flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
                    <div className="space-y-2 max-w-xl">
                        <h4 className="text-xl sm:text-2xl font-bold text-slate-900">
                            Mulai Pengalaman Ujian Digital Terbaik Bersama Unelma CBT
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-600">
                            Akses langsung dasbor siswa atau proktor menggunakan akun Google terverifikasi Anda.
                        </p>
                    </div>

                    <Link
                        href="/login"
                        className="shrink-0 px-6 py-3.5 rounded-xl bg-[#030C4D] hover:bg-[#0a1a5c] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                    >
                        <span>Masuk ke Akun</span>
                        <ArrowRight size={15} className="text-[#F8A01B]" />
                    </Link>
                </div>
            </div>
        </section>
    );
}
