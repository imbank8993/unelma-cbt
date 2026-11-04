"use client";

import React from 'react';
import { Calendar, ArrowRight, BookMarked } from 'lucide-react';
import Link from 'next/link';

const SAMPLE_POSTS = [
    {
        id: '1',
        title: 'Strategi Mempersiapkan Ujian Madrasah Berbasis Komputer (UM-CBT) 2026',
        category: 'Panduan CBT',
        date: '28 Oktober 2026',
        excerpt: 'Langkah taktis bagi proktor dan kepala madrasah dalam mematangkan infrastruktur jaringan dan kesiapan mental siswa menghadapi ujian digital.',
    },
    {
        id: '2',
        title: 'Mengenal Analisis Butir Soal Teori Respons Butir (IRT) pada Asesmen Madrasah',
        category: 'Evaluasi Pembelajaran',
        date: '15 Oktober 2026',
        excerpt: 'Bagaimana metode Item Response Theory (IRT) mampu mengukur kemampuan siswa lebih akurat dibandingkan skor konvensional.',
    },
    {
        id: '3',
        title: 'Transformasi Menuju Zona Integritas: Digitalisasi Pelayanan Pendidikan',
        category: 'Zona Integritas',
        date: '02 Oktober 2026',
        excerpt: 'Penerapan sistem ujian transparan dan arsip nilai digital sebagai salah satu indikator utama reformasi birokrasi madrasah.',
    }
];

export default function LandingPosts() {
    return (
        <section id="posts" className="py-20 md:py-28 bg-white relative overflow-hidden">
            <div className="container mx-auto px-4 md:px-6 relative z-10">
                
                {/* Header */}
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#030C4D]/8 text-[#030C4D] text-xs font-bold uppercase tracking-wider">
                        <BookMarked size={14} className="text-[#F8A01B]" />
                        <span>Artikel & Informasi</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-[#030C4D] tracking-tight">
                        Wawasan Terkini Pendidikan Digital
                    </h2>
                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                        Tips, panduan praktis, dan berita seputar asesmen pendidikan dan teknologi pembelajaran madrasah.
                    </p>
                </div>

                {/* Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {SAMPLE_POSTS.map((post) => (
                        <div
                            key={post.id}
                            className="bg-slate-50/70 rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between group"
                        >
                            <div className="space-y-3.5">
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                    <span className="font-bold text-[#F8A01B] uppercase tracking-wider text-[11px]">
                                        {post.category}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={13} />
                                        <span>{post.date}</span>
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#030C4D] transition-colors leading-snug">
                                    {post.title}
                                </h3>

                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                                    {post.excerpt}
                                </p>
                            </div>

                            <div className="pt-5 mt-5 border-t border-slate-200/60">
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#030C4D] group-hover:text-[#F8A01B] transition-colors">
                                    <span>Baca Selengkapnya</span>
                                    <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
