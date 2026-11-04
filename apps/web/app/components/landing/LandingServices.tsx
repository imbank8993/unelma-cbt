"use client";

import React from 'react';
import { ShieldCheck, Monitor, GraduationCap, Server, ArrowRight, CheckCircle2 } from 'lucide-react';

const SERVICES = [
    {
        icon: Monitor,
        title: 'Platform CBT Modern & Andal',
        description: 'Sistem ujian berbasis web dengan arsitektur tangguh, sinkronisasi realtime, mode proctoring ketat, serta pencegah kecurangan teruji.',
        points: ['Antarmuka responsif ramah siswa', 'Analisis butir soal otomatis & IRT', 'Mode offline fallback saat koneksi putus']
    },
    {
        icon: ShieldCheck,
        title: 'Pendampingan Zona Integritas',
        description: 'Layanan konsultasi dan pendampingan tata kelola madrasah menuju Wilayah Bebas dari Korupsi (WBK) dan Wilayah Birokrasi Bersih Melayani (WBBM).',
        points: ['Penyusunan dokumen eviden digital', 'Standarisasi SOP pelayanan publik', 'Audit transparansi & kepatuhan madrasah']
    },
    {
        icon: GraduationCap,
        title: 'Bimbel & Bank Soal Terstandar',
        description: 'Koleksi soal terverifikasi kisi-kisi Kemenag dan Kemendikbudristek untuk jenjang MI, MTs, dan MA dengan analisis tingkat kesukaran.',
        points: ['Soal berbasis stimulus & literasi', 'Kunci jawaban & pembahasan runut', 'Kategori berjenjang sesuai kurikulum']
    },
    {
        icon: Server,
        title: 'Digitalisasi & Infrastruktur IT',
        description: 'Bantuan implementasi infrastruktur cloud, instalasi server lokal / hybrid, serta integrasi sistem identitas sekolah digital.',
        points: ['Integrasi Google Workspace / Single Sign-On', 'Setup cloud berkecepatan tinggi', 'Pemeliharaan & backup berkala']
    }
];

export default function LandingServices() {
    return (
        <section id="layanan" className="py-20 md:py-28 bg-slate-50 relative overflow-hidden">
            <div className="container mx-auto px-4 md:px-6 relative z-10">
                
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#030C4D]/8 text-[#030C4D] text-xs font-bold uppercase tracking-wider">
                        <span>Layanan Komprehensif</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-[#030C4D] tracking-tight">
                        Mendukung Penuh Ekosistem Madrasah
                    </h2>
                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                        Unelma Edu Indonesia hadir tidak hanya sebagai penyedia software, melainkan mitra transformasi pendidikan digital yang menyeluruh.
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
                    {SERVICES.map((srv, idx) => (
                        <div
                            key={idx}
                            className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between group"
                        >
                            <div className="space-y-4">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#030C4D] flex items-center justify-center group-hover:bg-[#030C4D] group-hover:text-white transition-all shadow-inner">
                                    <srv.icon size={28} />
                                </div>

                                <h3 className="text-xl font-bold text-slate-900 group-hover:text-[#030C4D] transition-colors">
                                    {srv.title}
                                </h3>

                                <p className="text-sm text-slate-600 leading-relaxed">
                                    {srv.description}
                                </p>

                                <ul className="space-y-2 pt-2 border-t border-slate-100">
                                    {srv.points.map((pt, pIdx) => (
                                        <li key={pIdx} className="flex items-center gap-2.5 text-xs text-slate-700 font-medium">
                                            <CheckCircle2 size={15} className="text-[#F8A01B] shrink-0" />
                                            <span>{pt}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
