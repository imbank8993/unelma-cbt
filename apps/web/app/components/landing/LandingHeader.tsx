"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Home, BookOpen, Ticket, Package, FileText, MessageCircle, X, Menu, LogIn, LayoutDashboard } from 'lucide-react';

interface LandingHeaderProps {
    currentUser?: { name?: string; role?: string } | null;
}

export default function LandingHeader({ currentUser }: LandingHeaderProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 40);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const textColor = isScrolled ? 'text-slate-800' : 'text-white';
    const hoverColor = isScrolled ? 'hover:text-[#F8A01B]' : 'hover:text-[#F8A01B]';
    const bgColor = isScrolled ? 'bg-white/95 backdrop-blur-md shadow-md border-b border-slate-100' : 'bg-transparent';

    const menuItems = [
        { name: 'Beranda', href: '#home', icon: Home },
        { name: 'Paket Token', href: '#paket-token', icon: Ticket },
        { name: 'Layanan', href: '#layanan', icon: Package },
        { name: 'Artikel', href: '#posts', icon: FileText },
        { name: 'Kontak', href: '#footer', icon: MessageCircle },
    ];

    return (
        <>
            <header className={`fixed top-0 left-0 right-0 z-50 py-3 md:py-4 transition-all duration-300 ${bgColor}`}>
                <div className="container mx-auto px-4 md:px-6">
                    <div className="flex items-center justify-between">
                        {/* Logo Area */}
                        <Link href="/" className="flex items-center gap-2.5 md:gap-3 group cursor-pointer">
                            <div className={`relative w-10 h-10 md:w-11 md:h-11 overflow-hidden rounded-xl flex items-center justify-center p-1.5 transition-all ${isScrolled ? 'bg-[#030C4D]/5 shadow-xs' : 'bg-white shadow-lg'}`}>
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
                                <span className={`text-base md:text-lg font-black tracking-tight ${textColor}`}>
                                    Unelma Edu
                                </span>
                                <span className="text-[11px] md:text-xs font-bold text-[#F8A01B] tracking-wide">
                                    Indonesia
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Nav */}
                        <nav className="hidden lg:flex items-center gap-1.5">
                            {menuItems.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center gap-2 ${textColor} ${hoverColor} text-sm font-semibold px-3.5 py-2 rounded-full transition-all ${isScrolled ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                                >
                                    <item.icon size={15} />
                                    <span>{item.name}</span>
                                </a>
                            ))}
                        </nav>

                        {/* Action CTA */}
                        <div className="hidden lg:flex items-center gap-3">
                            {currentUser ? (
                                <Link
                                    href="/dashboard"
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F8A01B] hover:bg-[#e08e15] text-[#030C4D] text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-[#F8A01B]/20"
                                >
                                    <LayoutDashboard size={15} />
                                    <span>Dashboard ({currentUser.role || 'User'})</span>
                                </Link>
                            ) : (
                                <Link
                                    href="/login"
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                                        isScrolled
                                            ? 'bg-[#030C4D] hover:bg-[#020510] text-white shadow-md'
                                            : 'bg-white hover:bg-slate-100 text-[#030C4D] shadow-lg'
                                    }`}
                                >
                                    <LogIn size={15} />
                                    <span>Masuk CBT</span>
                                </Link>
                            )}
                        </div>

                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className={`lg:hidden ${textColor} p-2`}
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
                    <div className="absolute inset-0 bg-[#030C4D] pt-20 px-6 pb-8 flex flex-col justify-between">
                        <nav className="space-y-3 mt-4">
                            {menuItems.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 text-white hover:text-[#F8A01B] font-semibold py-3 px-4 rounded-xl hover:bg-white/10 transition-all text-base"
                                >
                                    <item.icon size={20} />
                                    <span>{item.name}</span>
                                </a>
                            ))}
                        </nav>

                        <div className="pt-6 border-t border-white/10">
                            <Link
                                href={currentUser ? '/dashboard' : '/login'}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#F8A01B] text-[#030C4D] font-bold text-sm uppercase tracking-wider shadow-lg"
                            >
                                {currentUser ? (
                                    <>
                                        <LayoutDashboard size={18} />
                                        <span>Buka Dashboard</span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn size={18} />
                                        <span>Masuk ke Akun CBT</span>
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
