"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Compass, PencilLine, Route, Users, HelpCircle, X, Menu, LogIn, LayoutDashboard } from 'lucide-react';

interface LandingHeaderProps {
    currentUser?: { name?: string; role?: string } | null;
}

export default function LandingHeader({ currentUser }: LandingHeaderProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const menuItems = [
        { name: 'Program', href: '#program', icon: Compass },
        { name: 'Coba Soal', href: '#coba-soal', icon: PencilLine },
        { name: 'Cara Belajar', href: '#cara-belajar', icon: Route },
        { name: 'Untuk Siapa', href: '#untuk-siapa', icon: Users },
        { name: 'FAQ', href: '#faq', icon: HelpCircle },
    ];

    return (
        <>
            <header
                className={`fixed top-0 left-0 right-0 z-50 py-3 md:py-3.5 transition-all duration-300 ${
                    isScrolled
                        ? 'bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-200/80'
                        : 'bg-white/80 backdrop-blur-xs border-b border-slate-100'
                }`}
            >
                <div className="container mx-auto px-4 md:px-6">
                    <div className="flex items-center justify-between">
                        {/* Logo Area */}
                        <Link href="/" className="flex items-center gap-2.5 md:gap-3 group cursor-pointer">
                            <div className="relative w-10 h-10 md:w-11 md:h-11 overflow-hidden rounded-xl flex items-center justify-center p-1 bg-white border border-slate-150 shadow-xs group-hover:scale-105 transition-transform">
                                <Image
                                    src="/unelma.png"
                                    alt="Unelma Logo"
                                    width={44}
                                    height={44}
                                    className="object-contain"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) parent.innerHTML = '<span class="text-[#030C4D] font-black text-xl">U</span>';
                                    }}
                                />
                            </div>
                            <div className="flex flex-col leading-tight">
                                <span className="text-base md:text-lg font-black tracking-tight text-[#030C4D]">
                                    Unelma Edu
                                </span>
                                <span className="text-[11px] md:text-xs font-bold text-[#F8A01B] tracking-wide">
                                    Indonesia
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Nav */}
                        <nav className="hidden lg:flex items-center gap-1">
                            {menuItems.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    className="flex items-center gap-2 text-slate-700 hover:text-[#030C4D] hover:bg-amber-50 text-sm font-semibold px-3.5 py-2 rounded-full transition-all"
                                >
                                    <item.icon size={14} className="text-[#F8A01B]" />
                                    <span>{item.name}</span>
                                </a>
                            ))}
                        </nav>

                        {/* Action CTA */}
                        <div className="hidden lg:flex items-center gap-3">
                            {currentUser ? (
                                <Link
                                    href="/dashboard"
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#030C4D] hover:bg-[#0a1a5c] text-white text-sm font-bold transition-all shadow-md shadow-[#030C4D]/15"
                                >
                                    <LayoutDashboard size={14} className="text-[#F8A01B]" />
                                    <span>Lanjut Belajar</span>
                                </Link>
                            ) : (
                                <Link
                                    href="/login"
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#030C4D] hover:bg-[#0a1a5c] text-white text-sm font-bold transition-all shadow-md shadow-[#030C4D]/15"
                                >
                                    <LogIn size={14} className="text-[#F8A01B]" />
                                    <span>Login</span>
                                </Link>
                            )}
                        </div>

                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="lg:hidden text-[#030C4D] p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            aria-label="Toggle menu"
                        >
                            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Drawer */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="absolute top-0 right-0 bottom-0 w-72 bg-white pt-20 px-6 pb-8 flex flex-col justify-between shadow-2xl border-l border-slate-200">
                        <nav className="space-y-2 mt-2">
                            {menuItems.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 text-slate-800 hover:text-[#030C4D] font-bold py-3 px-4 rounded-xl hover:bg-slate-100 text-sm transition-all"
                                >
                                    <item.icon size={18} className="text-[#F8A01B]" />
                                    <span>{item.name}</span>
                                </a>
                            ))}
                        </nav>

                        <div className="pt-6 border-t border-slate-100">
                            <Link
                                href={currentUser ? '/dashboard' : '/login'}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#030C4D] text-white font-bold text-xs uppercase tracking-wider shadow-md hover:bg-[#0a1a5c]"
                            >
                                {currentUser ? (
                                    <>
                                        <LayoutDashboard size={16} className="text-[#F8A01B]" />
                                        <span>Buka Dashboard</span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn size={16} className="text-[#F8A01B]" />
                                        <span>Login</span>
                                    </>
                                )}
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
