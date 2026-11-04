"use client";

import React, { useState } from 'react';
import { BookOpen, FileCheck, Layers, ArrowRight, Award, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface BankSoalSample {
    id: string;
    title: string;
    level: string;
    category: string;
    questionsCount: number;
    description: string;
    badge: string;
}

const SAMPLE_BANKS: BankSoalSample[] = [
    {
        id: '1',
        title: 'Asesmen Fikih Madrasah Aliyah',
        level: 'Kelas XII MA',
        category: 'MA',
        questionsCount: 50,
        description: 'Paket evaluasi komprehensif materi munakahat, mawaris, dan muamalah berstandar kurikulum nasional.',
        badge: 'Terpopuler'
    },
    {
        id: '2',
        title: 'Sejarah Kebudayaan Islam (SKI)',
        level: 'Kelas IX MTs',
        category: 'MTs',
        questionsCount: 45,
        description: 'Materi peradaban Islam di Nusantara, Walisongo, dan kerajaan Islam dengan analisis kronologis.',
        badge: 'Lengkap'
    },
    {
        id: '3',
        title: 'Bahasa Arab Terpadu',
        level: 'Kelas XI MA/SMA',
        category: 'MA',
        questionsCount: 40,
        description: 'Dilengkapi stimulus wacana qiroah, pemahaman teks kontekstual, dan kaidah qowaid.',
        badge: 'Terbaru'
    },
    {
        id: '4',
        title: 'Literasi & Numerasi Matematika',
        level: 'Kelas VI MI',
        category: 'MI',
        questionsCount: 35,
        description: 'Latihan soal penalaran matematika berbasis pemecahan masalah sehari-hari dan AKMI.',
        badge: 'AKMI Ready'
    },
    {
        id: '5',
        title: 'Akidah Akhlak Generasi Digital',
        level: 'Kelas VIII MTs',
        category: 'MTs',
        questionsCount: 50,
        description: 'Penguatan tauhid, adab bermedia sosial, dan keteladanan sifat-sifat mulia para Nabi.',
        badge: 'Rekomendasi'
    },
    {
        id: '6',
        title: 'Biologi & Sains Terintegrasi',
        level: 'Kelas XII MA/SMA',
        category: 'MA',
        questionsCount: 50,
        description: 'Metabolisme, genetika, bioteknologi modern dengan visualisasi data dan soal stimulus saintifik.',
        badge: 'HOTs'
    }
];

export default function LandingBankSoal() {
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const categories = [
        { id: 'all', label: 'Semua Bank Soal' },
        { id: 'MA', label: 'Madrasah Aliyah (MA)' },
        { id: 'MTs', label: 'Madrasah Tsanawiyah (MTs)' },
        { id: 'MI', label: 'Madrasah Ibtidaiyah (MI)' }
    ];

    const filteredBanks = SAMPLE_BANKS.filter((item) => {
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.level.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <section id="bank-soal" className="py-20 md:py-28 bg-slate-50 relative overflow-hidden">
            <div className="container mx-auto px-4 md:px-6 relative z-10">
                
                {/* Section Header */}
                <div className="max-w-3xl mx-auto text-center space-y-4 mb-12">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#030C4D]/8 text-[#030C4D] text-xs font-bold uppercase tracking-wider">
                        <BookOpen size={14} className="text-[#F8A01B]" />
                        <span>Koleksi Soal Terstandar</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-[#030C4D] tracking-tight">
                        Bank Soal Berkualitas Siap Pakai
                    </h2>
                    <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                        Dirancang oleh tim pengajar berpengalaman dengan kisi-kisi dan stimulus modern yang siap diujikan langsung di platform Unelma CBT.
                    </p>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10 max-w-5xl mx-auto">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {categories.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => setSelectedCategory(c.id)}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                    selectedCategory === c.id
                                        ? 'bg-[#030C4D] text-white shadow-md'
                                        : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                                }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Cari mata pelajaran..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-full text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#030C4D]"
                        />
                    </div>
                </div>

                {/* Bank Soal Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    {filteredBanks.map((bank) => (
                        <div
                            key={bank.id}
                            className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between group"
                        >
                            <div className="space-y-3.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-blue-50 text-[#030C4D] border border-blue-100 uppercase tracking-wider">
                                        {bank.level}
                                    </span>
                                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F8A01B]/15 text-[#b36c03]">
                                        {bank.badge}
                                    </span>
                                </div>

                                <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#030C4D] transition-colors leading-snug">
                                    {bank.title}
                                </h3>

                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                    {bank.description}
                                </p>
                            </div>

                            <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                                    <Layers size={14} className="text-[#030C4D]" />
                                    <span>{bank.questionsCount} Butir Soal</span>
                                </div>

                                <Link
                                    href="/login"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#030C4D] group-hover:text-[#F8A01B] transition-colors"
                                >
                                    <span>Gunakan</span>
                                    <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom Callout */}
                <div className="mt-12 text-center">
                    <p className="text-xs text-slate-500">
                        Membutuhkan bank soal khusus untuk madrasah atau institusi Anda?{' '}
                        <a href="#footer" className="text-[#030C4D] font-bold underline hover:text-[#F8A01B]">
                            Hubungi Tim Edukasi Unelma
                        </a>
                    </p>
                </div>

            </div>
        </section>
    );
}
