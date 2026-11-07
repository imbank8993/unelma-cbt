"use client";

import React, { useEffect, useState } from 'react';
import {
    Coins,
    Sliders,
    CheckCircle2,
    Clock,
    AlertCircle,
    ArrowUpRight,
    Search,
    Shield,
    UploadCloud,
    X,
    ExternalLink,
    Building2,
    DollarSign,
    Users
} from 'lucide-react';
import {
    getAdminCommissionsSummary,
    processAdminPayout,
    updateCommissionConfig,
    updateProctorPermissions,
    type CommissionConfig,
    type ProctorSummaryItem
} from '@/lib/api/commissions';

export default function AdminCommissionsPage() {
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState<CommissionConfig>({
        admin_share_pct: 40,
        proctor_share_pct: 60,
        token_idr_rate: 5000,
        min_withdrawal_tokens: 200,
        min_exam_token_price: 1,
        min_material_token_price: 1,
    });
    const [proctors, setProctors] = useState<ProctorSummaryItem[]>([]);
    const [search, setSearch] = useState('');
    const [savingConfig, setSavingConfig] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Modal Pencairan
    const [selectedProc, setSelectedProc] = useState<ProctorSummaryItem | null>(null);
    const [payoutPeriod, setPayoutPeriod] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
    const [proofUrl, setProofUrl] = useState('');
    const [payoutNotes, setPayoutNotes] = useState('');
    const [processingPayout, setProcessingPayout] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await getAdminCommissionsSummary();
            if (res.success) {
                if (res.config) setConfig(res.config);
                if (res.proctors) setProctors(res.proctors);
            }
        } catch (err) {
            console.error('Error loading commissions summary:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingConfig(true);
        setFeedback(null);
        try {
            const res = await updateCommissionConfig(config);
            if (res.success) {
                setFeedback({ type: 'success', text: 'Pengaturan komisi dan harga minimal berhasil disimpan.' });
                await loadData();
            } else {
                throw new Error(res.error || 'Gagal menyimpan konfigurasi.');
            }
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || 'Terjadi kesalahan sistem.' });
        } finally {
            setSavingConfig(false);
        }
    };

    const handleTogglePermission = async (proc: ProctorSummaryItem, field: 'can_create_exams' | 'can_create_materials') => {
        if (!proc.profile_id) {
            alert('Proktor ini belum melengkapi profil registrasi proktor.');
            return;
        }
        try {
            const nextVal = !proc[field];
            const res = await updateProctorPermissions(proc.profile_id, {
                [field]: nextVal,
            });
            if (res.success) {
                await loadData();
            } else {
                alert(res.error || 'Gagal memperbarui izin proktor.');
            }
        } catch (err: any) {
            alert(err.message || 'Gagal mengubah izin.');
        }
    };

    const handleOpenPayoutModal = (proc: ProctorSummaryItem) => {
        setSelectedProc(proc);
        setProofUrl('');
        setPayoutNotes(`Pencairan komisi periode ${payoutPeriod}`);
    };

    const handleSubmitPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProc) return;
        if (!proofUrl.trim()) {
            alert('Harap masukkan URL bukti transfer.');
            return;
        }

        setProcessingPayout(true);
        try {
            const res = await processAdminPayout({
                proctor_id: selectedProc.user_id,
                period_month: payoutPeriod,
                total_tokens: selectedProc.gross_tokens,
                proctor_tokens: selectedProc.pending_tokens,
                total_idr: selectedProc.pending_idr,
                transfer_proof_url: proofUrl.trim(),
                notes: payoutNotes,
            });

            if (res.success) {
                alert('Pencairan komisi proktor berhasil diproses!');
                setSelectedProc(null);
                await loadData();
            } else {
                throw new Error(res.error || 'Gagal memproses pencairan.');
            }
        } catch (err: any) {
            alert(err.message || 'Terjadi kesalahan saat memproses pencairan.');
        } finally {
            setProcessingPayout(false);
        }
    };

    const filteredProctors = proctors.filter((p) => {
        const q = search.toLowerCase();
        return (
            p.full_name?.toLowerCase().includes(q) ||
            p.email?.toLowerCase().includes(q) ||
            p.whatsapp?.includes(q) ||
            p.bank1_name?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-16">
            {/* Page Header (Clean & Elegan) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                        <DollarSign className="text-[#030C4D]" size={24} />
                        <span>Komisi Proktor & Pencairan</span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Atur persentase bagi hasil, batas minimal penarikan bulanan, serta proses pencairan transfer dana proktor.
                    </p>
                </div>
            </div>

            {feedback && (
                <div className={`p-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-between ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Tutup</button>
                </div>
            )}

            {/* Panel Pengaturan Komisi (Admin & Superadmin) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                            <Sliders size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Konfigurasi Pembagian Komisi</h2>
                            <p className="text-xs text-slate-500">Skema bagi hasil antara pengelola dan proktor pembuat konten</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Bagi Hasil Admin (%)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={config.admin_share_pct}
                            onChange={(e) => {
                                const adm = Number(e.target.value);
                                setConfig({ ...config, admin_share_pct: adm, proctor_share_pct: Math.max(0, 100 - adm) });
                            }}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                            required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">Bagian pengelola CBT (misal 40%)</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Bagi Hasil Proktor (%)
                        </label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={config.proctor_share_pct}
                            onChange={(e) => {
                                const proc = Number(e.target.value);
                                setConfig({ ...config, proctor_share_pct: proc, admin_share_pct: Math.max(0, 100 - proc) });
                            }}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                            required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">Bagian proktor pembuat (misal 60%)</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Kurs 1 Token (Rupiah)
                        </label>
                        <input
                            type="number"
                            min="100"
                            step="500"
                            value={config.token_idr_rate}
                            onChange={(e) => setConfig({ ...config, token_idr_rate: Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                            required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">Konversi 1 token ke IDR saat dicairkan</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Minimal Token Dicairkan
                        </label>
                        <input
                            type="number"
                            min="10"
                            value={config.min_withdrawal_tokens}
                            onChange={(e) => setConfig({ ...config, min_withdrawal_tokens: Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                            required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">Ambang batas (misal 200 token/bulan)</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Minimal Tarif Ujian (Token)
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={config.min_exam_token_price}
                            onChange={(e) => setConfig({ ...config, min_exam_token_price: Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                            required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">Mencegah harga ujian terlalu minim</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                            Minimal Tarif Bahan Ajar (Token)
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={config.min_material_token_price}
                            onChange={(e) => setConfig({ ...config, min_material_token_price: Number(e.target.value) })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                            required
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">Mencegah harga bahan ajar terlalu minim</span>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                        <button
                            type="submit"
                            disabled={savingConfig}
                            className="px-6 py-2.5 bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-60 cursor-pointer"
                        >
                            {savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan Komisi'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Daftar Rekap Proktor & Pencairan */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Users size={18} className="text-[#030C4D]" />
                            <span>Daftar Komisi Proktor</span>
                        </h2>
                        <p className="text-xs text-slate-500">
                            Status kelayakan pencairan: akumulasi (&lt; {config.min_withdrawal_tokens} token) atau siap dicairkan (&ge; {config.min_withdrawal_tokens} token)
                        </p>
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Cari nama, email, bank..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#030C4D]/20 focus:border-[#030C4D]"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                <th className="py-3 px-4">Proktor & Kontak</th>
                                <th className="py-3 px-4">Rekening Transfer</th>
                                <th className="py-3 px-4 text-center">Izin Konten</th>
                                <th className="py-3 px-4 text-right">Siswa Membuka</th>
                                <th className="py-3 px-4 text-right">Total Komisi</th>
                                <th className="py-3 px-4 text-right">Belum Dicairkan</th>
                                <th className="py-3 px-4 text-center">Status</th>
                                <th className="py-3 px-4 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-slate-400">
                                        Memuat data komisi proktor...
                                    </td>
                                </tr>
                            ) : filteredProctors.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-slate-400">
                                        Tidak ada data proktor yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                filteredProctors.map((proc) => (
                                    <tr key={proc.user_id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-3.5 px-4">
                                            <div className="font-bold text-slate-900">{proc.full_name || 'Tanpa Nama'}</div>
                                            <div className="text-[11px] text-slate-500">{proc.email}</div>
                                            {proc.whatsapp && (
                                                <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                                    WA: {proc.whatsapp}
                                                </div>
                                            )}
                                        </td>

                                        <td className="py-3.5 px-4">
                                            {proc.bank1_name ? (
                                                <div className="space-y-0.5">
                                                    <div className="font-bold text-slate-800">
                                                        {proc.bank1_name} - {proc.bank1_account_number}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500">
                                                        a.n {proc.bank1_account_name}
                                                    </div>
                                                    {proc.bank2_name && (
                                                        <div className="text-[10px] text-slate-400">
                                                            Rek 2: {proc.bank2_name} ({proc.bank2_account_number})
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 italic text-[11px]">Belum mendaftarkan rekening</span>
                                            )}
                                        </td>

                                        <td className="py-3.5 px-4 text-center">
                                            <div className="inline-flex flex-col gap-1 items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleTogglePermission(proc, 'can_create_exams')}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${proc.can_create_exams ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                                                    title="Klik untuk ubah izin buat ujian"
                                                >
                                                    Ujian {proc.can_create_exams ? '✓' : '✗'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleTogglePermission(proc, 'can_create_materials')}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${proc.can_create_materials ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}
                                                    title="Klik untuk ubah izin buat bahan ajar"
                                                >
                                                    Materi {proc.can_create_materials ? '✓' : '✗'}
                                                </button>
                                            </div>
                                        </td>

                                        <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                                            {proc.total_unlocks.toLocaleString('id-ID')} siswa
                                        </td>

                                        <td className="py-3.5 px-4 text-right">
                                            <div className="font-extrabold text-slate-900">
                                                {proc.proctor_tokens_earned.toLocaleString('id-ID')} Token
                                            </div>
                                            <div className="text-[11px] text-slate-500">
                                                Rp {proc.total_idr_earned.toLocaleString('id-ID')}
                                            </div>
                                        </td>

                                        <td className="py-3.5 px-4 text-right">
                                            <div className="font-extrabold text-[#F8A01B]">
                                                {proc.pending_tokens.toLocaleString('id-ID')} Token
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-semibold">
                                                Rp {proc.pending_idr.toLocaleString('id-ID')}
                                            </div>
                                        </td>

                                        <td className="py-3.5 px-4 text-center">
                                            {proc.is_eligible ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                                                    <CheckCircle2 size={12} />
                                                    <span>Siap Dicairkan</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                                                    <Clock size={12} />
                                                    <span>Akumulasi ({proc.pending_tokens}/{config.min_withdrawal_tokens})</span>
                                                </span>
                                            )}
                                        </td>

                                        <td className="py-3.5 px-4 text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenPayoutModal(proc)}
                                                disabled={!proc.is_eligible || proc.pending_tokens === 0}
                                                className="px-3 py-1.5 bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold rounded-lg transition-all shadow-xs disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                Cairkan
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Pencairan Komisi Proktor */}
            {selectedProc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-extrabold text-base text-slate-900">
                                Proses Pencairan Komisi Proktor
                            </h3>
                            <button
                                onClick={() => setSelectedProc(null)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Nama Proktor:</span>
                                <span className="font-bold text-slate-800">{selectedProc.full_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Rekening Tujuan:</span>
                                <span className="font-bold text-slate-800">
                                    {selectedProc.bank1_name} ({selectedProc.bank1_account_number}) a.n {selectedProc.bank1_account_name}
                                </span>
                            </div>
                            <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                                <span className="text-slate-700">Jumlah Token Dicairkan:</span>
                                <span className="text-[#F8A01B]">{selectedProc.pending_tokens} Token</span>
                            </div>
                            <div className="flex justify-between font-bold text-sm">
                                <span className="text-slate-900">Total Nominal Transfer:</span>
                                <span className="text-emerald-700">Rp {selectedProc.pending_idr.toLocaleString('id-ID')}</span>
                            </div>
                        </div>

                        <form onSubmit={handleSubmitPayout} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Periode Pencairan (Bulan)
                                </label>
                                <input
                                    type="month"
                                    value={payoutPeriod}
                                    onChange={(e) => setPayoutPeriod(e.target.value)}
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    URL / Tautan Bukti Transfer *
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://... (link upload atau gambar bukti transfer)"
                                    value={proofUrl}
                                    onChange={(e) => setProofUrl(e.target.value)}
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                                    required
                                />
                                <span className="text-[11px] text-slate-400 mt-1 block">
                                    Salin link bukti transfer perbankan agar dapat dilihat oleh proktor
                                </span>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Catatan Tambahan (Opsional)
                                </label>
                                <textarea
                                    value={payoutNotes}
                                    onChange={(e) => setPayoutNotes(e.target.value)}
                                    rows={2}
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedProc(null)}
                                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={processingPayout}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-60"
                                >
                                    {processingPayout ? 'Memproses...' : 'Tandai Sudah Dicairkan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
