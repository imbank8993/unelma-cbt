"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, ArrowUp, Instagram } from 'lucide-react';

export default function LandingFooter() {
    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <footer id="footer" className="bg-[#030C4D] text-white pt-16 pb-10 border-t border-white/10 relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#0a1a5c] rounded-full blur-3xl pointer-events-none opacity-50" />

            <div className="container mx-auto px-4 md:px-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-12 mb-12">
                    
                    {/* Brand Info */}
                    <div className="md:col-span-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg">
                                <Image
                                    src="/unelma.png"
                                    alt="Unelma Logo"
                                    width={44}
                                    height={44}
                                    className="object-contain"
                                />
                            </div>
                            <div>
                                <h3 className="text-xl font-black tracking-tight text-white leading-tight">
                                    Unelma Edu
                                </h3>
                                <p className="text-xs font-bold text-[#F8A01B] tracking-wide">
                                    Indonesia
                                </p>
                            </div>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm">
                            Platform belajar dan latihan soal untuk semua usia: dari pelajaran SD hingga persiapan UTBK, CPNS, PPPK, dan kedinasan.
                        </p>
                    </div>

                    {/* Nav Links */}
                    <div className="md:col-span-3 space-y-3">
                        <h4 className="text-xs font-bold text-[#F8A01B] uppercase tracking-wider">
                            Navigasi Utama
                        </h4>
                        <ul className="space-y-2.5 text-xs text-slate-300">
                            <li>
                                <a href="#home" className="hover:text-white transition-colors">
                                    Beranda
                                </a>
                            </li>
                            <li>
                                <a href="#program" className="hover:text-white transition-colors">
                                    Program Belajar
                                </a>
                            </li>
                            <li>
                                <a href="#coba-soal" className="hover:text-white transition-colors">
                                    Coba Latihan Soal
                                </a>
                            </li>
                            <li>
                                <Link href="/login" className="hover:text-white transition-colors">
                                    Login
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Contact Info */}
                    <div className="md:col-span-4 space-y-3">
                        <h4 className="text-xs font-bold text-[#F8A01B] uppercase tracking-wider">
                            Hubungi Kami
                        </h4>
                        <ul className="space-y-2.5 text-xs text-slate-300">
                            <li className="flex items-start gap-2.5">
                                <Mail size={15} className="text-[#F8A01B] shrink-0 mt-0.5" />
                                <span>unelma.edu@gmail.com</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <MessageCircle size={15} className="text-[#F8A01B] shrink-0 mt-0.5" />
                                <a
                                    href="https://wa.me/6285151263063"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-white underline decoration-white/30"
                                >
                                    WhatsApp: +62 851-5126-3063
                                </a>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <Instagram size={15} className="text-[#F8A01B] shrink-0 mt-0.5" />
                                <a
                                    href="https://www.instagram.com/unelma_id/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-white underline decoration-white/30"
                                >
                                    Instagram: @unelma_id
                                </a>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <MapPin size={15} className="text-[#F8A01B] shrink-0 mt-0.5" />
                                <span>Indonesia</span>
                            </li>
                        </ul>
                    </div>

                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
                    <p>© 2026 Unelma Edu Indonesia. Hak cipta dilindungi undang-undang.</p>
                    
                    <button
                        onClick={scrollToTop}
                        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-[#F8A01B] transition-colors cursor-pointer"
                    >
                        <span>Kembali ke atas</span>
                        <ArrowUp size={14} />
                    </button>
                </div>
            </div>
        </footer>
    );
}
