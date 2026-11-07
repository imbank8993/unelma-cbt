"use client";

import React, { useEffect, useState } from 'react';
import {
    Coins,
    DollarSign,
    CheckCircle2,
    Clock,
    CreditCard,
    FileText,
    ExternalLink,
    AlertCircle,
    UserCheck,
    Layers,
    BookOpen,
    Edit3,
    X,
    Eye
} from 'lucide-react';
import {
    getProctorMySummary,
    registerProctorProfile,
    type ProctorMySummaryResponse,
    type ProctorPayout
} from '@/lib/api/commissions';

export default function ProctorCommissionsPage() {
    const [data, setData] = useState<ProctorMySummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Profile & Bank modal
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [formFullName, setFormFullName] = useState('');
    const [formNik, setFormNik] = useState('');
    const [formWhatsapp, setFormWhatsapp] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formBank1Name, setFormBank1Name] = useState('');
    const [formBank1AccName, setFormBank1AccName] = useState('');
    const [formBank1AccNum, setFormBank1AccNum] = useState('');
    const [formBank2Name, setFormBank2Name] = useState('');
    const [formBank2AccName, setFormBank2AccName] = useState('');
    const [formBank2AccNum, setFormBank2AccNum] = useState('');

    // Transfer Proof modal
    const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await getProctorMySummary();
            if (res.success) {
                setData(res);
                if (res.profile) {
                    setFormFullName(res.profile.full_name || '');
                    setFormNik(res.profile.nik || '');
                    setFormWhatsapp(res.profile.whatsapp || '');
                    setFormEmail(res.profile.email || '');
                    setFormBank1Name(res.profile.bank1_name || '');
                    setFormBank1AccName(res.profile.bank1_account_name || '');
                    setFormBank1AccNum(res.profile.bank1_account_number || '');
                    setFormBank2Name(res.profile.bank2_name || '');
                    setFormBank2AccName(res.profile.bank2_account_name || '');
                    setFormBank2AccNum(res.profile.bank2_account_number || '');
                }
            }
        } catch (err) {
            console.error('Error loading proctor commission:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingProfile(true);
        setFeedback(null);
        try {
            const res = await registerProctorProfile({
                full_name: formFullName,
                nik: formNik,
                whatsapp: formWhatsapp,
                email: formEmail,
                bank1_name: formBank1Name,
                bank1_account_name: formBank1AccName,
                bank1_account_number: formBank1AccNum,
                bank2_name: formBank2Name || undefined,
                bank2_account_name: formBank2AccName || undefined,
                bank2_account_number: formBank2AccNum || undefined,
            });

            if (res.success) {
                setFeedback({ type: 'success', text: 'Data profil dan rekening proktor berhasil diperbarui.' });
                setIsProfileModalOpen(false);
                await loadData();
            } else {
                throw new Error(res.error || 'Gagal menyimpan data.');
            }
        } catch (err: any) {
            setFeedback({ type: 'error', text: err.message || 'Terjadi kesalahan sistem.' });
        } finally {
            setSavingProfile(false);
        }
    };

    const summary = data?.summary || {
        total_unlocks: 0,
        gross_tokens: 0,
        proctor_tokens_earned: 0,
        total_idr_earned: 0,
        paid_tokens: 0,
        paid_idr: 0,
        pending_tokens: 0,
        pending_idr: 0,
        status: 'accumulating' as const,
        is_eligible: false,
    };

    const minThreshold = data?.config?.min_withdrawal_tokens || 200;
    const progressPct = Math.min(100, Math.round((summary.pending_tokens / minThreshold) * 100));

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-16">
            {/* Page Header (Clean & Elegan) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                        <DollarSign className="text-[#030C4D]" size={24} />
                        <span>Komisi Saya</span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Pantau perolehan komisi token dari ujian dan bahan ajar Anda serta riwayat transfer bulanan.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(true)}
                    className="px-4 py-2.5 bg-[#030C4D] hover:bg-[#020510] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer shadow-xs"
                >
                    <CreditCard size={15} />
                    <span>{data?.profile ? 'Ubah Data Rekening' : 'Lengkapi Rekening'}</span>
                </button>
            </div>

            {feedback && (
                <div className={`p-4 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-between ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="font-bold underline text-xs">Tutup</button>
                </div>
            )}

            {/* Banner Status Rekening & Profil */}
            {data?.profile ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <UserCheck size={24} />
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-800 text-sm">{data.profile.full_name}</h3>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                                    Proktor Terverifikasi
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Rekening Utama: <strong className="text-slate-800">{data.profile.bank1_name}</strong> - {data.profile.bank1_account_number} (a.n {data.profile.bank1_account_name})
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto text-xs font-semibold text-slate-600">
                        <span>WA: {data.profile.whatsapp}</span>
                        <span>•</span>
                        <span>NIK: {data.profile.nik}</span>
                    </div>
                </div>
            ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="text-amber-700 shrink-0" size={24} />
                        <div>
                            <h4 className="font-bold text-amber-900 text-sm">Data Rekening Belum Lengkap</h4>
                            <p className="text-xs text-amber-800">
                                Harap masukkan nomor rekening dan identitas NIK Anda agar admin dapat mentransfer komisi bulanan Anda.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsProfileModalOpen(true)}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl self-start sm:self-auto cursor-pointer"
                    >
                        Lengkapi Sekarang
                    </button>
                </div>
            )}

            {/* Statistik Komisi Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Siswa Membuka
                    </span>
                    <div className="text-2xl font-black text-slate-800">
                        {loading ? '...' : summary.total_unlocks.toLocaleString('id-ID')}
                    </div>
                    <span className="text-[11px] text-slate-500 block">Akses ujian & modul bahan ajar</span>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Komisi ({data?.config?.proctor_share_pct || 60}%)
                    </span>
                    <div className="text-2xl font-black text-slate-800">
                        {loading ? '...' : summary.proctor_tokens_earned.toLocaleString('id-ID')} Token
                    </div>
                    <span className="text-[11px] text-emerald-600 font-semibold block">
                        Rp {summary.total_idr_earned.toLocaleString('id-ID')}
                    </span>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Sudah Dicairkan
                    </span>
                    <div className="text-2xl font-black text-emerald-700">
                        {loading ? '...' : summary.paid_tokens.toLocaleString('id-ID')} Token
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                        Rp {summary.paid_idr.toLocaleString('id-ID')}
                    </span>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Saldo Belum Dicairkan
                    </span>
                    <div className="text-2xl font-black text-[#F8A01B]">
                        {loading ? '...' : summary.pending_tokens.toLocaleString('id-ID')} Token
                    </div>
                    <span className="text-[11px] text-slate-500 block">
                        Rp {summary.pending_idr.toLocaleString('id-ID')}
                    </span>
                </div>
            </div>

            {/* Status Ambang Batas Pencairan */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                            {summary.is_eligible ? (
                                <CheckCircle2 className="text-emerald-600" size={18} />
                            ) : (
                                <Clock className="text-amber-500" size={18} />
                            )}
                            <span>
                                Status Pencairan: {summary.is_eligible ? 'Siap Dicairkan (Memenuhi Syarat)' : 'Akumulasi Berjalan'}
                            </span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {summary.is_eligible
                                ? `Saldo Anda telah mencapai batas minimal ${minThreshold} token dan akan diproses pada siklus transfer bulanan.`
                                : `Minimal penarikan adalah ${minThreshold} token. Token Anda saat ini (${summary.pending_tokens} token) akan terus diakumulasikan ke bulan berikutnya.`}
                        </p>
                    </div>

                    <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-slate-600">
                            {summary.pending_tokens} / {minThreshold} Token ({progressPct}%)
                        </span>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ${summary.is_eligible ? 'bg-emerald-500' : 'bg-[#F8A01B]'}`}
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            {/* Rincian Komisi per Ujian */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <Layers size={16} className="text-[#030C4D]" />
                        <span>Rincian Pendapatan per Modul Ujian</span>
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                <th className="py-3 px-4">Judul Ujian</th>
                                <th className="py-3 px-4 text-center">Tarif per Siswa</th>
                                <th className="py-3 px-4 text-center">Siswa Membuka</th>
                                <th className="py-3 px-4 text-right">Gross Token</th>
                                <th className="py-3 px-4 text-right">Komisi Proktor</th>
                                <th className="py-3 px-4 text-right">Estimasi IDR</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data?.exams?.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-400">
                                        Belum ada modul ujian berbayar yang dibuka siswa.
                                    </td>
                                </tr>
                            ) : (
                                data?.exams?.map((e) => (
                                    <tr key={e.id} className="hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-bold text-slate-800">{e.title}</td>
                                        <td className="py-3 px-4 text-center font-bold text-amber-700">
                                            {e.token_price} Token
                                        </td>
                                        <td className="py-3 px-4 text-center font-semibold text-slate-700">
                                            {e.total_students} siswa
                                        </td>
                                        <td className="py-3 px-4 text-right font-medium text-slate-600">
                                            {e.total_tokens} Token
                                        </td>
                                        <td className="py-3 px-4 text-right font-extrabold text-[#030C4D]">
                                            {e.proctor_tokens} Token
                                        </td>
                                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                                            Rp {Number(e.proctor_idr).toLocaleString('id-ID')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Riwayat Pencairan Bulanan */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <FileText size={16} className="text-[#030C4D]" />
                        <span>Riwayat Pencairan Komisi Bulanan</span>
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                <th className="py-3 px-4">Periode Bulan</th>
                                <th className="py-3 px-4 text-right">Token Dicairkan</th>
                                <th className="py-3 px-4 text-right">Nominal Transfer (Rp)</th>
                                <th className="py-3 px-4 text-center">Status</th>
                                <th className="py-3 px-4 text-center">Bukti Transfer</th>
                                <th className="py-3 px-4">Keterangan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data?.payouts?.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-400">
                                        Belum ada riwayat pencairan dana.
                                    </td>
                                </tr>
                            ) : (
                                data?.payouts?.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-50/50">
                                        <td className="py-3 px-4 font-bold text-slate-800">{p.period_month}</td>
                                        <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                                            {p.proctor_tokens} Token
                                        </td>
                                        <td className="py-3 px-4 text-right font-extrabold text-emerald-700">
                                            Rp {Number(p.total_idr).toLocaleString('id-ID')}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
                                                Sudah Ditransfer
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {p.transfer_proof_url ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setViewProofUrl(p.transfer_proof_url!)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs transition-colors"
                                                >
                                                    <Eye size={12} />
                                                    <span>Lihat Bukti</span>
                                                </button>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                                            {p.notes || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Lengkapi Profil & Rekening */}
            {isProfileModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-extrabold text-base text-slate-900">
                                Data Rekening & Identitas Proktor
                            </h3>
                            <button onClick={() => setIsProfileModalOpen(false)} className="text-slate-400 p-1">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Nama Lengkap *</label>
                                    <input
                                        type="text"
                                        value={formFullName}
                                        onChange={(e) => setFormFullName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">NIK (16 Digit) *</label>
                                    <input
                                        type="text"
                                        maxLength={16}
                                        value={formNik}
                                        onChange={(e) => setFormNik(e.target.value.replace(/\D/g, ''))}
                                        placeholder="3201..."
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Nomor WhatsApp *</label>
                                    <input
                                        type="text"
                                        value={formWhatsapp}
                                        onChange={(e) => setFormWhatsapp(e.target.value)}
                                        placeholder="0812..."
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 mb-1">Email *</label>
                                    <input
                                        type="email"
                                        value={formEmail}
                                        onChange={(e) => setFormEmail(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-3 space-y-3">
                                <h4 className="font-bold text-slate-900">Data Rekening Utama (Wajib)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Nama Bank *</label>
                                        <input
                                            type="text"
                                            placeholder="BCA / Mandiri / BRI / BSI"
                                            value={formBank1Name}
                                            onChange={(e) => setFormBank1Name(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Nama Pemegang *</label>
                                        <input
                                            type="text"
                                            value={formBank1AccName}
                                            onChange={(e) => setFormBank1AccName(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Nomor Rekening *</label>
                                        <input
                                            type="text"
                                            value={formBank1AccNum}
                                            onChange={(e) => setFormBank1AccNum(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 pt-3 space-y-3">
                                <h4 className="font-bold text-slate-900">Rekening Tambahan (Opsional)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Nama Bank</label>
                                        <input
                                            type="text"
                                            value={formBank2Name}
                                            onChange={(e) => setFormBank2Name(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Nama Pemegang</label>
                                        <input
                                            type="text"
                                            value={formBank2AccName}
                                            onChange={(e) => setFormBank2AccName(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-700 mb-1">Nomor Rekening</label>
                                        <input
                                            type="text"
                                            value={formBank2AccNum}
                                            onChange={(e) => setFormBank2AccNum(e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsProfileModalOpen(false)}
                                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingProfile}
                                    className="px-5 py-2 bg-[#030C4D] hover:bg-[#020510] text-white rounded-xl font-bold disabled:opacity-60"
                                >
                                    {savingProfile ? 'Menyimpan...' : 'Simpan Data Rekening'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Bukti Transfer */}
            {viewProofUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-extrabold text-sm text-slate-900">Bukti Transfer Pencairan</h3>
                            <button onClick={() => setViewProofUrl(null)} className="text-slate-400 p-1">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="rounded-xl overflow-hidden border border-slate-200 max-h-[60vh] flex items-center justify-center bg-slate-50">
                            {viewProofUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) ? (
                                <img src={viewProofUrl} alt="Bukti Transfer" className="max-w-full max-h-[60vh] object-contain" />
                            ) : (
                                <iframe src={viewProofUrl} className="w-full h-96" title="Bukti Transfer" />
                            )}
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <a
                                href={viewProofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                            >
                                <ExternalLink size={14} />
                                <span>Buka di tab baru</span>
                            </a>
                            <button
                                onClick={() => setViewProofUrl(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
