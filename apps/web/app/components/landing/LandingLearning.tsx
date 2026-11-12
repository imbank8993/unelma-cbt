"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowRight, BarChart3, BookOpen, Briefcase, CheckCircle2, ChevronDown, GraduationCap, HeartHandshake, Landmark,
    Languages, Lightbulb, PencilLine, School, ShieldCheck, Smartphone, Sparkles, Target, Trophy, Users, XCircle,
    type LucideIcon,
} from 'lucide-react';

/* ─────────────────────────── Pilih jalurmu ─────────────────────────── */

const PATHS: { icon: LucideIcon; title: string; desc: string; tone: string; ring: string }[] = [
    { icon: Sparkles, title: 'SD', desc: 'Belajar dasar dengan cara yang menyenangkan.', tone: 'bg-rose-50 text-rose-500', ring: 'hover:border-rose-200' },
    { icon: BookOpen, title: 'SMP', desc: 'Pahami konsep, latih soal bertahap.', tone: 'bg-sky-50 text-sky-600', ring: 'hover:border-sky-200' },
    { icon: GraduationCap, title: 'SMA / SMK', desc: 'Siap ulangan, ujian sekolah, dan asesmen.', tone: 'bg-blue-50 text-blue-700', ring: 'hover:border-blue-200' },
    { icon: Target, title: 'UTBK-SNBT', desc: 'Tembus PTN impian dengan tryout terukur.', tone: 'bg-violet-50 text-violet-600', ring: 'hover:border-violet-200' },
    { icon: Landmark, title: 'CPNS', desc: 'Kuasai SKD dan SKB dengan latihan sistem CAT.', tone: 'bg-emerald-50 text-emerald-600', ring: 'hover:border-emerald-200' },
    { icon: Briefcase, title: 'PPPK', desc: 'Kompetensi teknis, manajerial, dan sosio-kultural.', tone: 'bg-orange-50 text-orange-600', ring: 'hover:border-orange-200' },
    { icon: ShieldCheck, title: 'Kedinasan', desc: 'Persiapan seleksi sekolah ikatan dinas.', tone: 'bg-cyan-50 text-cyan-600', ring: 'hover:border-cyan-200' },
    { icon: Languages, title: 'Bahasa & TOEFL', desc: 'Tingkatkan skor dan kepercayaan diri.', tone: 'bg-pink-50 text-pink-600', ring: 'hover:border-pink-200' },
];

export function LandingPaths() {
    return (
        <section id="program" className="relative bg-white py-10 md:py-20">
            <div className="container mx-auto px-4 md:px-6">
                <SectionHeading title="Satu platform, banyak tujuan" lead="Apa pun tahap belajarmu, ada jalur yang dirancang untukmu, dari bangku SD hingga seleksi ASN." />
                <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
                    {PATHS.map(path => (
                        <div key={path.title}
                            className={`group rounded-3xl border-2 border-slate-100 bg-white p-4 transition-all md:p-6 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/60 ${path.ring}`}>
                            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${path.tone} transition-transform group-hover:rotate-6 md:h-14 md:w-14`}><path.icon size={24} /></span>
                            <h3 className="mt-3 text-base font-extrabold text-[#030C4D] md:mt-5 md:text-lg">{path.title}</h3>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500 md:text-sm">{path.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─────────────────────────── Coba 5 soal ─────────────────────────── */

const SAMPLES: { question: string; options: string[]; answer: number; explanation: string }[] = [
    {
        question: 'Ani membaca 12 halaman pada hari pertama. Setiap hari berikutnya ia membaca 3 halaman lebih banyak. Berapa halaman yang dibaca Ani pada hari ke-5?',
        options: ['21 halaman', '24 halaman', '27 halaman', '30 halaman'],
        answer: 1,
        explanation: 'Bertambah 3 setiap hari: 12 → 15 → 18 → 21 → 24. Jadi pada hari ke-5 Ani membaca 24 halaman.',
    },
    {
        question: 'Ibu membeli 3 kg jeruk seharga Rp15.000 per kg dan membayar dengan uang Rp50.000. Berapa kembaliannya?',
        options: ['Rp5.000', 'Rp10.000', 'Rp15.000', 'Rp35.000'],
        answer: 0,
        explanation: 'Harga jeruk 3 × Rp15.000 = Rp45.000. Kembaliannya Rp50.000 − Rp45.000 = Rp5.000.',
    },
    {
        question: 'Kata yang paling tepat untuk melengkapi kalimat berikut: "Budi sangat … sehingga selalu menyelesaikan tugas tepat waktu."',
        options: ['malas', 'disiplin', 'ceroboh', 'pemalu'],
        answer: 1,
        explanation: 'Menyelesaikan tugas tepat waktu menunjukkan sikap disiplin. Pilihan lain justru bertentangan dengan makna kalimat.',
    },
    {
        question: 'Semboyan "Bhinneka Tunggal Ika" pada lambang negara Indonesia memiliki arti…',
        options: ['Bersatu kita teguh', 'Berbeda-beda tetapi tetap satu', 'Rakyat adil dan makmur', 'Gotong royong'],
        answer: 1,
        explanation: 'Bhinneka Tunggal Ika berasal dari bahasa Jawa Kuno yang berarti "berbeda-beda tetapi tetap satu", menggambarkan persatuan dalam keberagaman.',
    },
    {
        question: 'Choose the correct sentence.',
        options: ['She go to school every day.', 'She goes to school every day.', 'She going to school every day.', 'She gone to school every day.'],
        answer: 1,
        explanation: 'Untuk kebiasaan dengan subjek "she", kata kerja simple present mendapat akhiran -s/-es: "goes".',
    },
];

export function LandingTryQuestion({ onStart }: { onStart: () => void }) {
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<(number | null)[]>(() => SAMPLES.map(() => null));
    const finished = index >= SAMPLES.length;
    const sample = SAMPLES[Math.min(index, SAMPLES.length - 1)];
    const picked = answers[index] ?? null;
    const answered = picked !== null;
    const correct = picked === sample.answer;
    const score = answers.filter((value, i) => value === SAMPLES[i].answer).length;
    const restart = () => { setIndex(0); setAnswers(SAMPLES.map(() => null)); };
    const pick = (option: number) => setAnswers(previous => previous.map((value, i) => i === index ? option : value));

    return (
        <section id="coba-soal" className="relative overflow-hidden bg-gradient-to-b from-[#F5F8FF] to-white py-10 md:py-20">
            <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl" />
            <div className="container relative mx-auto grid items-center gap-8 px-4 md:gap-12 md:px-6 lg:grid-cols-2">
                <div className="space-y-5">
                    <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-[#030C4D] md:text-4xl">Rasakan serunya latihan di Unelma</h2>
                    <p className="max-w-lg text-base leading-relaxed text-slate-600">
                        Coba 5 soal singkat dari berbagai jenjang. Setiap soal dilengkapi pembahasan yang menjelaskan <em>cara berpikirnya</em>, bukan sekadar kunci jawaban.
                    </p>
                    <ul className="space-y-2.5 text-sm text-slate-700">
                        {['Pembahasan langkah demi langkah', 'Tingkat kesulitan menyesuaikan kemampuan', 'Riwayat jawaban untuk dipelajari ulang'].map(item => (
                            <li key={item} className="flex items-center gap-2.5"><CheckCircle2 size={18} className="text-emerald-500" />{item}</li>
                        ))}
                    </ul>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-200/70 sm:p-8">
                    {/* Kemajuan: satu titik per soal */}
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex gap-1.5" aria-hidden="true">
                            {SAMPLES.map((item, i) => {
                                const value = answers[i];
                                const tone = value === null ? (i === index ? 'bg-[#030C4D]' : 'bg-slate-200') : value === item.answer ? 'bg-emerald-400' : 'bg-rose-300';
                                return <span key={i} className={`h-2 w-7 rounded-full transition-colors ${tone}`} />;
                            })}
                        </div>
                        <span className="text-xs font-bold text-slate-400">{finished ? 'Selesai' : `Soal ${index + 1}/${SAMPLES.length}`}</span>
                    </div>

                    {finished ? (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-4 text-center" aria-live="polite">
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500"><Trophy size={30} /></span>
                            <p className="mt-4 text-4xl font-extrabold text-[#030C4D]">{score}/{SAMPLES.length}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">
                                {score === SAMPLES.length ? 'Sempurna! Kamu siap untuk tantangan berikutnya.' : score >= 3 ? 'Bagus! Sedikit latihan lagi pasti makin mantap.' : 'Awal yang baik. Yuk belajar bersama Unelma!'}
                            </p>
                            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                                <button type="button" onClick={onStart} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#030C4D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a1a5c]">
                                    Latihan soal lainnya <ArrowRight size={15} className="text-[#F8A01B]" />
                                </button>
                                <button type="button" onClick={restart} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100">Ulangi dari awal</button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div key={index} initial={index === 0 ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                            <p className="text-base font-semibold leading-relaxed text-slate-800">{sample.question}</p>
                            <div className="mt-5 grid gap-2.5" role="group" aria-label="Pilihan jawaban">
                                {sample.options.map((option, optionIndex) => {
                                    const isAnswer = optionIndex === sample.answer;
                                    const isPicked = optionIndex === picked;
                                    const state = !answered ? 'border-slate-200 hover:border-[#030C4D] hover:bg-slate-50'
                                        : isAnswer ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                            : isPicked ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-100 opacity-60';
                                    return (
                                        <button key={option} type="button" disabled={answered} onClick={() => pick(optionIndex)} aria-pressed={isPicked}
                                            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all ${state}`}>
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-extrabold text-[#030C4D] shadow-sm">{String.fromCharCode(65 + optionIndex)}</span>
                                            <span className="flex-1">{option}</span>
                                            {answered && isAnswer && <CheckCircle2 size={18} className="text-emerald-500" />}
                                            {answered && isPicked && !isAnswer && <XCircle size={18} className="text-rose-500" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {answered && (
                                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-4" aria-live="polite">
                                    <div className={`rounded-2xl p-4 ${correct ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                                        <p className={`flex items-center gap-2 text-sm font-extrabold ${correct ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            {correct ? <><Trophy size={16} /> Hebat, jawabanmu benar!</> : <><Lightbulb size={16} /> Hampir! Yuk lihat pembahasannya</>}
                                        </p>
                                        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{sample.explanation}</p>
                                    </div>
                                    <button type="button" onClick={() => setIndex(index + 1)}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#030C4D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a1a5c] sm:w-auto">
                                        {index + 1 < SAMPLES.length ? 'Soal berikutnya' : 'Lihat skor'} <ArrowRight size={15} className="text-[#F8A01B]" />
                                    </button>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </section>
    );
}

/* ─────────────────────────── Cara belajar ─────────────────────────── */

const STEPS = [
    { icon: BookOpen, title: 'Pelajari materi', desc: 'Materi ringkas per BAB dan subbab, lengkap dengan gambar, video, dan contoh.', tone: 'from-sky-400 to-blue-600' },
    { icon: PencilLine, title: 'Latihan & tryout', desc: 'Kerjakan soal latihan dan tryout bersistem CBT seperti ujian sungguhan.', tone: 'from-amber-400 to-orange-500' },
    { icon: BarChart3, title: 'Lihat perkembangan', desc: 'Nilai, topik terkuat, dan topik yang perlu diulang tampil jelas.', tone: 'from-emerald-400 to-teal-600' },
];

export function LandingHowItWorks() {
    return (
        <section id="cara-belajar" className="bg-white py-10 md:py-20">
            <div className="container mx-auto px-4 md:px-6">
                <SectionHeading title="Tiga langkah yang terus berulang" lead="Belajar, berlatih, lalu evaluasi. Siklus sederhana yang membuat kemajuan terasa setiap minggu." />
                <div className="relative grid gap-4 md:grid-cols-3 md:gap-6">
                    <div className="pointer-events-none absolute left-[16%] right-[16%] top-10 hidden border-t-2 border-dashed border-slate-200 md:block" />
                    {STEPS.map((step, index) => (
                        <div key={step.title} className="relative flex items-center gap-4 text-left md:block md:text-center">
                            <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${step.tone} text-white shadow-lg md:mx-auto md:h-20 md:w-20 md:rounded-[1.75rem]`}>
                                <step.icon className="h-6 w-6 md:h-8 md:w-8" />
                                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-white bg-[#030C4D] text-[11px] font-extrabold md:h-8 md:w-8">{index + 1}</span>
                            </span>
                            <div>
                                <h3 className="text-base font-extrabold text-[#030C4D] md:mt-5 md:text-lg">{step.title}</h3>
                                <p className="mt-1 text-sm leading-relaxed text-slate-500 md:mx-auto md:max-w-xs">{step.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─────────────────────────── Untuk siapa ─────────────────────────── */

const AUDIENCES: { key: string; icon: LucideIcon; label: string; title: string; points: string[]; quote: string; who: string }[] = [
    { key: 'siswa', icon: Sparkles, label: 'Siswa', title: 'Belajar terasa seperti bermain', points: ['Misi harian dan lencana pencapaian', 'Materi sesuai kelas dan tujuanmu', 'Tryout dengan pembahasan lengkap'], quote: 'Latihannya seru, aku jadi semangat mengerjakan soal tiap hari.', who: 'Siswa kelas VIII' },
    { key: 'ortu', icon: HeartHandshake, label: 'Orang Tua', title: 'Tahu perkembangan anak tanpa menebak', points: ['Ringkasan nilai dan topik yang dikuasai', 'Pengingat jadwal ujian dan tryout', 'Lingkungan belajar aman tanpa iklan'], quote: 'Saya bisa lihat bagian mana yang anak saya masih kesulitan.', who: 'Orang tua siswa SD' },
    { key: 'sekolah', icon: School, label: 'Guru & Sekolah', title: 'Ujian sekolah rapi, aman, dan cepat dinilai', points: ['Bank soal, kelas, dan jadwal terpusat', 'Monitoring ujian langsung dan anti-curang', 'Analisis butir soal dan ekspor nilai'], quote: 'Penilaian Akhir Semester kini selesai tanpa kertas dan tanpa lembur.', who: 'Proktor sekolah' },
    { key: 'asn', icon: Landmark, label: 'Pejuang ASN', title: 'Simulasi CAT seperti hari-H', points: ['Tryout SKD dengan passing grade', 'Peringkat nasional dan analisis per subtes', 'Materi kompetensi PPPK lengkap'], quote: 'Simulasi waktunya persis, saya jadi tidak gugup saat tes asli.', who: 'Peserta seleksi CPNS' },
];

export function LandingAudience() {
    const [active, setActive] = useState(AUDIENCES[0].key);
    const current = AUDIENCES.find(item => item.key === active) || AUDIENCES[0];
    return (
        <section id="untuk-siapa" className="bg-[#030C4D] py-20 text-white md:py-28">
            <div className="container mx-auto px-4 md:px-6">
                <div className="mx-auto mb-6 max-w-2xl text-center md:mb-8">
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-4xl">Ramah untuk anak, nyaman untuk dewasa</h2>
                </div>
                <div className="mx-auto mb-6 flex max-w-3xl flex-wrap justify-center gap-2 md:mb-8" role="tablist" aria-label="Pengguna Unelma">
                    {AUDIENCES.map(item => (
                        <button key={item.key} type="button" role="tab" aria-selected={active === item.key} onClick={() => setActive(item.key)}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all md:px-5 md:py-2.5 md:text-sm ${active === item.key ? 'bg-[#F8A01B] text-[#030C4D]' : 'bg-white/10 text-blue-100 hover:bg-white/15'}`}>
                            <item.icon size={16} />{item.label}
                        </button>
                    ))}
                </div>
                <motion.div key={current.key} initial={current.key === AUDIENCES[0].key ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="mx-auto grid max-w-5xl gap-5 rounded-[2rem] bg-white p-5 text-slate-800 md:grid-cols-[1.2fr_1fr] md:gap-6 md:p-10" role="tabpanel">
                    <div>
                        <h3 className="text-2xl font-extrabold text-[#030C4D]">{current.title}</h3>
                        <ul className="mt-5 space-y-3">
                            {current.points.map(point => (
                                <li key={point} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={14} /></span>{point}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <figure className="flex flex-col justify-between rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-6">
                        <blockquote className="text-lg font-semibold leading-relaxed text-slate-700">“{current.quote}”</blockquote>
                        <figcaption className="mt-4 flex items-center gap-2 text-sm font-bold text-[#030C4D]"><Users size={16} className="text-[#F8A01B]" />{current.who}</figcaption>
                    </figure>
                </motion.div>
            </div>
        </section>
    );
}

/* ─────────────────────────── Fitur ─────────────────────────── */

const FEATURES: { icon: LucideIcon; title: string; desc: string; tone: string }[] = [
    { icon: BookOpen, title: 'Ruang Belajar', desc: 'Materi terstruktur per BAB, progres tersimpan otomatis.', tone: 'bg-blue-50 text-blue-700' },
    { icon: PencilLine, title: 'Latihan & Tryout CBT', desc: 'Pengalaman ujian komputer yang stabil, simpan otomatis tiap jawaban.', tone: 'bg-amber-50 text-amber-600' },
    { icon: BarChart3, title: 'Analisis Kemampuan', desc: 'Skor klasikal dan IRT, topik kuat dan lemah terlihat jelas.', tone: 'bg-emerald-50 text-emerald-600' },
    { icon: Users, title: 'Kelas Bersama Guru', desc: 'Gabung kelas dengan kode; ujian dan materi muncul otomatis.', tone: 'bg-violet-50 text-violet-600' },
    { icon: ShieldCheck, title: 'Aman & Berintegritas', desc: 'Layar penuh, deteksi keluar jendela, dan pengawasan proktor.', tone: 'bg-rose-50 text-rose-600' },
    { icon: Smartphone, title: 'Ringan di Semua Perangkat', desc: 'Laptop, tablet, atau HP: cukup lewat peramban, hemat kuota.', tone: 'bg-sky-50 text-sky-600' },
];

export function LandingFeatureGrid() {
    return (
        <section id="fitur" className="bg-white py-10 md:py-20">
            <div className="container mx-auto px-4 md:px-6">
                <SectionHeading title="Semua yang dibutuhkan untuk belajar dan berlatih" lead="Dibangun dari pengalaman menyelenggarakan ujian sekolah, kini untuk belajar setiap hari." />
                <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
                    {FEATURES.map(feature => (
                        <div key={feature.title} className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-slate-50/50 p-4 md:flex-row md:gap-4 md:p-6 transition-colors hover:bg-white hover:shadow-lg hover:shadow-slate-200/50">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl md:h-12 md:w-12 ${feature.tone}`}><feature.icon size={20} /></span>
                            <div>
                                <h3 className="text-sm font-extrabold text-[#030C4D] md:text-base">{feature.title}</h3>
                                <p className="mt-1 text-xs leading-relaxed text-slate-500 md:text-sm">{feature.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/* ─────────────────────────── FAQ & ajakan ─────────────────────────── */

const FAQS = [
    { q: 'Apakah Unelma gratis?', a: 'Mendaftar dan banyak materi bisa diakses gratis. Beberapa tryout dan materi premium memakai token yang bisa diisi kapan saja.' },
    { q: 'Usia berapa yang cocok?', a: 'Mulai dari siswa SD hingga dewasa yang bersiap seleksi CPNS, PPPK, atau kedinasan. Tampilan dan materi menyesuaikan tujuan yang dipilih.' },
    { q: 'Apakah perlu memasang aplikasi?', a: 'Tidak. Unelma berjalan di peramban pada laptop, tablet, maupun HP. Cukup masuk dengan akun Google.' },
    { q: 'Bagaimana sekolah memakai Unelma?', a: 'Sekolah mendapat ruang sendiri untuk kelas, bank soal, jadwal ujian, monitoring, dan rekap nilai. Hubungi kami untuk pendampingan.' },
];

export function LandingFaqCta({ onStart, loggedIn }: { onStart: () => void; loggedIn: boolean }) {
    const [open, setOpen] = useState<number | null>(0);
    return (
        <section id="faq" className="bg-gradient-to-b from-white to-[#FFFBF2] py-10 md:py-20">
            <div className="container mx-auto grid gap-8 px-4 md:gap-12 md:px-6 lg:grid-cols-2">
                <div>
                    <h2 className="text-2xl font-extrabold tracking-tight text-[#030C4D] md:text-4xl">Yang sering ditanyakan</h2>
                    <div className="mt-6 space-y-3">
                        {FAQS.map((item, index) => (
                            <div key={item.q} className="rounded-2xl border border-slate-200 bg-white">
                                <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}
                                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-bold text-[#030C4D]">
                                    {item.q}
                                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open === index ? 'rotate-180' : ''}`} />
                                </button>
                                {open === index && <p className="px-5 pb-4 text-sm leading-relaxed text-slate-600">{item.a}</p>}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#030C4D] via-[#0b1a6b] to-[#2563EB] p-6 text-white shadow-2xl shadow-[#030C4D]/25 md:p-12">
                    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
                    <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-[#F8A01B]/20" />
                    <div className="relative">
                        <h2 className="text-2xl font-extrabold leading-tight md:text-4xl">Mulai perjalanan belajarmu hari ini</h2>
                        <p className="mt-3 max-w-md text-blue-100">Pilih tujuanmu, kerjakan soal pertama, dan lihat seberapa jauh kamu bisa melangkah.</p>
                        <button type="button" onClick={onStart}
                            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#F8A01B] px-6 py-3.5 text-sm font-extrabold text-[#030C4D] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-amber-400">
                            {loggedIn ? 'Buka dashboard' : 'Daftar gratis dengan Google'} <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function SectionHeading({ title, lead }: { title: string; lead: string }) {
    return (
        <div className="mx-auto mb-8 max-w-2xl text-center md:mb-12">
            <h2 className="text-2xl font-extrabold tracking-tight text-[#030C4D] md:text-4xl">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 md:text-base">{lead}</p>
        </div>
    );
}
