"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, BadgeCheck, Clock, RefreshCw, UserCheck, X, XCircle } from 'lucide-react';
import {
    approveProctorApplication,
    listProctorApplications,
    rejectProctorApplication,
    type ProctorApplication,
    type ProctorApplicationStatus,
} from '@/lib/api/commissions';

type Filter = ProctorApplicationStatus | 'all';

const TABS: { key: Filter; label: string }[] = [
    { key: 'pending', label: 'Menunggu' },
    { key: 'approved', label: 'Disetujui' },
    { key: 'rejected', label: 'Ditolak' },
    { key: 'all', label: 'Semua' },
];

function StatusBadge({ status }: { status: ProctorApplicationStatus }) {
    if (status === 'approved') {
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold"><BadgeCheck size={12} /> Disetujui</span>;
    }
    if (status === 'rejected') {
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-800 border border-red-200 text-[11px] font-bold"><XCircle size={12} /> Ditolak</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold"><Clock size={12} /> Menunggu</span>;
}

const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export default function ProctorRequestsPage() {
    const [filter, setFilter] = useState<Filter>('pending');
    const [applications, setApplications] = useState<ProctorApplication[]>([]);
    const [counts, setCounts] = useState<Record<ProctorApplicationStatus, number>>({ pending: 0, approved: 0, rejected: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<ProctorApplication | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const requestSeq = useRef(0);

    const load = useCallback(async (status: Filter) => {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);
        const res = await listProctorApplications(status);
        if (seq !== requestSeq.current) return;
        if (!res.success) {
            setApplications([]);
            setError(String(res.error || 'Daftar pengajuan gagal dimuat.'));
        } else {
            setApplications(res.applications || []);
            setCounts(res.counts || { pending: 0, approved: 0, rejected: 0 });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load(filter);
    }, [filter, load]);

    const openDetail = (application: ProctorApplication) => {
        setSelected(application);
        setRejectReason('');
    };

    const approve = async () => {
        if (!selected || busy) return;
        if (!confirm(`Setujui ${selected.full_name} sebagai Proktor? Peran Siswa-nya akan diganti Proktor.`)) return;
        setBusy(true);
        const res = await approveProctorApplication(selected.id);
        setBusy(false);
        if (!res.success) {
            setToast({ type: 'error', text: String(res.error || 'Gagal menyetujui pengajuan.') });
            return;
        }
        setToast({ type: 'success', text: `${selected.full_name} kini berperan Proktor.` });
        setSelected(null);
        await load(filter);
    };

    const reject = async () => {
        if (!selected || busy) return;
        if (rejectReason.trim().length < 5) {
            setToast({ type: 'error', text: 'Tulis alasan penolakan minimal 5 karakter; alasan ini ditampilkan kepada pengaju.' });
            return;
        }
        setBusy(true);
        const res = await rejectProctorApplication(selected.id, rejectReason.trim());
        setBusy(false);
        if (!res.success) {
            setToast({ type: 'error', text: String(res.error || 'Gagal menolak pengajuan.') });
            return;
        }
        setToast({ type: 'success', text: `Pengajuan ${selected.full_name} ditolak.` });
        setSelected(null);
        await load(filter);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-16">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                        <UserCheck className="text-[#030C4D]" size={24} />
                        <span>Permintaan Proktor</span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Tinjau pengajuan pengguna (akun Google) yang ingin menjadi Proktor pembuat soal & bahan ajar.
                    </p>
                </div>
                <button type="button" onClick={() => void load(filter)} disabled={loading}
                    className="self-start sm:self-auto p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100" title="Segarkan">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {toast && (
                <div className={`p-3.5 rounded-xl border text-sm font-semibold flex items-center justify-between ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    <span>{toast.text}</span>
                    <button type="button" onClick={() => setToast(null)} className="text-xs underline cursor-pointer">Tutup</button>
                </div>
            )}

            <div className="inline-flex p-1.5 rounded-xl bg-slate-200/70 border border-slate-300/60 max-w-fit">
                {TABS.map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setFilter(tab.key)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${filter === tab.key ? 'bg-white text-[#030C4D] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                        {tab.label}
                        {tab.key !== 'all' && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100">{counts[tab.key as ProctorApplicationStatus] ?? 0}</span>}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                {error ? (
                    <div className="m-5 p-3.5 rounded-xl bg-red-50 text-red-800 border border-red-200 text-sm font-semibold flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2"><AlertCircle size={16} /> {error}</span>
                        <button type="button" onClick={() => void load(filter)} className="px-3 py-1.5 rounded-lg bg-white border border-red-300 text-xs cursor-pointer">Coba lagi</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                                <tr>
                                    <th className="py-3 px-5">Pengaju</th>
                                    <th className="py-3 px-5">Keahlian</th>
                                    <th className="py-3 px-5">Dikirim</th>
                                    <th className="py-3 px-5">Status</th>
                                    <th className="py-3 px-5 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={5} className="py-10 text-center text-slate-400">Memuat pengajuan...</td></tr>
                                ) : applications.length === 0 ? (
                                    <tr><td colSpan={5} className="py-12 text-center text-slate-400">Tidak ada pengajuan pada kategori ini.</td></tr>
                                ) : applications.map((app) => (
                                    <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="py-3.5 px-5">
                                            <div className="font-semibold text-slate-800">{app.full_name}</div>
                                            <div className="text-[11px] text-slate-500">{app.account_email || app.email}</div>
                                        </td>
                                        <td className="py-3.5 px-5 text-slate-700 max-w-xs truncate">{app.expertise || '-'}</td>
                                        <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap">{formatDate(app.submitted_at)}</td>
                                        <td className="py-3.5 px-5"><StatusBadge status={app.status} /></td>
                                        <td className="py-3.5 px-5 text-right">
                                            <button type="button" onClick={() => openDetail(app)}
                                                className="px-3 py-1.5 rounded-lg bg-[#030C4D] hover:bg-[#020510] text-white text-xs font-bold cursor-pointer">
                                                {app.status === 'pending' ? 'Tinjau' : 'Detail'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-extrabold text-base text-slate-900">Pengajuan Proktor</h3>
                            <button type="button" onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            {[
                                ['Nama (KTP)', selected.full_name],
                                ['Akun Google', selected.account_email || selected.email],
                                ['NIK', selected.nik],
                                ['WhatsApp', selected.whatsapp],
                                ['Rekening Utama', `${selected.bank1_name} · ${selected.bank1_account_number} a.n ${selected.bank1_account_name}`],
                                ['Rekening Cadangan', selected.bank2_name ? `${selected.bank2_name} · ${selected.bank2_account_number || '-'} a.n ${selected.bank2_account_name || '-'}` : '-'],
                                ['Dikirim', formatDate(selected.submitted_at)],
                                ['Status', ''],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-slate-50 rounded-xl p-3">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
                                    <div className="font-semibold text-slate-800 mt-0.5 break-words">
                                        {label === 'Status' ? <StatusBadge status={selected.status} /> : value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bidang Keahlian</div>
                                <p className="text-slate-800 mt-1 whitespace-pre-wrap">{selected.expertise || '-'}</p>
                            </div>
                            <div>
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pengalaman & Alasan</div>
                                <p className="text-slate-800 mt-1 whitespace-pre-wrap">{selected.motivation || '-'}</p>
                            </div>
                            {selected.status !== 'pending' && (
                                <p className="text-slate-500">
                                    Ditinjau {formatDate(selected.reviewed_at)}{selected.reviewed_by_name ? ` oleh ${selected.reviewed_by_name}` : ''}.
                                    {selected.rejection_reason ? ` Alasan: ${selected.rejection_reason}` : ''}
                                </p>
                            )}
                        </div>

                        {selected.status === 'pending' && (
                            <div className="space-y-3 border-t border-slate-100 pt-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Alasan penolakan (wajib bila menolak)</label>
                                    <textarea rows={2} maxLength={1000} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                                        placeholder="Contoh: NIK tidak sesuai nama, mohon perbaiki." />
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                    <button type="button" onClick={() => void reject()} disabled={busy}
                                        className="px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold disabled:opacity-60 cursor-pointer">
                                        Tolak
                                    </button>
                                    <button type="button" onClick={() => void approve()} disabled={busy}
                                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
                                        {busy ? 'Memproses...' : 'Setujui jadi Proktor'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
