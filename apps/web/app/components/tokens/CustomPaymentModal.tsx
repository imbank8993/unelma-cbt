"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  X, Check, Copy, ArrowLeft, RefreshCw, Clock, ShieldCheck,
  QrCode, CreditCard, AlertCircle, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  createPayment,
  checkPaymentStatus,
  type TokenPackage,
  type CorePaymentDetails,
  type PaymentCreateResult
} from '@/lib/api/tokens';

export interface CustomPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  pkg: TokenPackage | null;
  onSuccess: (tokensCredited: number) => void;
}

type MethodType = 'qris' | 'bca_va' | 'mandiri_bill' | 'bni_va' | 'bri_va' | 'permata_va' | 'cimb_va';

interface MethodOption {
  id: MethodType;
  name: string;
  category: 'qris' | 'va';
  bankLabel?: string;
  badge: string;
  badgeColor: string;
  description: string;
}

const PAYMENT_METHODS: MethodOption[] = [
  {
    id: 'qris',
    name: 'QRIS (Semua E-Wallet & M-Banking)',
    category: 'qris',
    badge: 'QRIS',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'GoPay, OVO, Dana, ShopeePay, BCA Mobile, Livin, BRImo, dll.',
  },
  {
    id: 'bca_va',
    name: 'BCA Virtual Account',
    category: 'va',
    bankLabel: 'BCA',
    badge: 'BCA',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Transfer via m-BCA, KlikBCA, atau ATM BCA',
  },
  {
    id: 'mandiri_bill',
    name: 'Mandiri Bill Payment',
    category: 'va',
    bankLabel: 'Mandiri',
    badge: 'Mandiri',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Transfer via Livin\' by Mandiri atau ATM Mandiri',
  },
  {
    id: 'bni_va',
    name: 'BNI Virtual Account',
    category: 'va',
    bankLabel: 'BNI',
    badge: 'BNI',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
    description: 'Transfer via BNI Mobile Banking atau ATM BNI',
  },
  {
    id: 'bri_va',
    name: 'BRI Virtual Account (BRIVA)',
    category: 'va',
    bankLabel: 'BRI',
    badge: 'BRI',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    description: 'Transfer via BRImo, Internet Banking, atau ATM BRI',
  },
  {
    id: 'permata_va',
    name: 'Permata Virtual Account',
    category: 'va',
    bankLabel: 'Permata',
    badge: 'Permata',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Transfer via PermataMobile X atau ATM Permata/Prima/ALTO',
  },
];

export default function CustomPaymentModal({
  isOpen,
  onClose,
  pkg,
  onSuccess,
}: CustomPaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<MethodType>('qris');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activePayment, setActivePayment] = useState<PaymentCreateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [creditedAmount, setCreditedAmount] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(15 * 60); // 15 menit bawaan
  const [guideTab, setGuideTab] = useState<'mbanking' | 'atm'>('mbanking');

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setActivePayment(null);
      setErrorMessage(null);
      setIsSuccess(false);
      setSelectedMethod('qris');
      setTimeLeft(15 * 60);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen]);

  // Hitung mundur waktu kadaluarsa pembayaran
  useEffect(() => {
    if (!activePayment || isSuccess) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activePayment, isSuccess]);

  // Polling status otomatis setiap 3.5 detik saat layar pembayaran aktif
  useEffect(() => {
    if (!activePayment || isSuccess) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const orderId = activePayment.order_id;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await checkPaymentStatus(orderId);
        if (res.success && res.status === 'success') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setIsSuccess(true);
          const credited = res.token_amount || pkg?.token_amount || 0;
          setCreditedAmount(credited);
          onSuccess(credited);
        } else if (res.success && res.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setErrorMessage('Transaksi telah dibatalkan atau kedaluwarsa.');
        }
      } catch {
        // Polling silent retry
      }
    }, 3500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activePayment, isSuccess, pkg, onSuccess]);

  if (!isOpen || !pkg) return null;

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleStartPayment = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await createPayment({
        package_id: pkg.id,
        payment_method: selectedMethod,
      });

      if (!res.success) {
        if (res.error?.toLowerCase().includes('login') || res.error?.toLowerCase().includes('unauthorized') || res.error?.toLowerCase().includes('sesi')) {
          window.location.href = `/login?redirect=/dashboard/siswa/tokens`;
          return;
        }
        throw new Error(res.error || 'Gagal membuat tagihan pembayaran.');
      }

      setActivePayment(res);
      // Set perkiraan expiry jika ada di response
      if (res.payment_details?.expiry_time) {
        const expiry = new Date(res.payment_details.expiry_time).getTime();
        const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
        if (diff > 0) setTimeLeft(diff);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem saat membuat tagihan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualCheckStatus = async () => {
    if (!activePayment) return;
    setIsChecking(true);
    setErrorMessage(null);

    try {
      const res = await checkPaymentStatus(activePayment.order_id);
      if (res.success && res.status === 'success') {
        setIsSuccess(true);
        const credited = res.token_amount || pkg.token_amount || 0;
        setCreditedAmount(credited);
        onSuccess(credited);
      } else if (res.success && res.status === 'failed') {
        setErrorMessage('Transaksi ini telah dibatalkan atau kedaluwarsa di sistem pembayaran.');
      } else {
        setErrorMessage('Pembayaran belum terdeteksi. Silakan selesaikan pembayaran terlebih dahulu.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memeriksa status pembayaran.');
    } finally {
      setIsChecking(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const details = activePayment?.payment_details;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden relative"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            {activePayment && !isSuccess ? (
              <button
                type="button"
                onClick={() => {
                  setActivePayment(null);
                  setErrorMessage(null);
                }}
                className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
                title="Ganti Metode"
              >
                <ArrowLeft size={18} />
              </button>
            ) : null}
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-[#F8A01B]">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                {isSuccess
                  ? 'Pembayaran Berhasil'
                  : activePayment
                  ? 'Selesaikan Pembayaran'
                  : 'Beli Paket Token'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isSuccess
                  ? 'Saldo token telah masuk ke akun Anda'
                  : activePayment
                  ? `Order #${activePayment.order_id}`
                  : `${pkg.name} (${pkg.token_amount} Token)`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Ringkasan Paket Token */}
          <div className="bg-gradient-to-br from-[#030C4D]/5 to-[#F8A01B]/10 rounded-2xl p-4 border border-[#030C4D]/10 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#030C4D]/70 block">
                Paket Pilihan
              </span>
              <h4 className="font-extrabold text-slate-900 text-base">{pkg.name}</h4>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">
                +{pkg.token_amount} Saldo Token
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Tagihan
              </span>
              <span className="text-xl sm:text-2xl font-black text-[#030C4D]">
                Rp {Number(pkg.price_idr).toLocaleString('id-ID')}
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* ── STEP 3: SUKSES ── */}
          {isSuccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 mx-auto animate-in zoom-in-75 duration-300">
                <Check size={32} strokeWidth={3} />
              </div>

              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900">Pembayaran Berhasil!</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Selamat! Pembayaran Anda telah kami terima dan saldo token langsung ditambahkan ke akun Anda.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-sm">
                <span>+{creditedAmount} Token Berhasil Masuk</span>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 bg-[#030C4D] hover:bg-[#020510] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Selesai & Gunakan Token
                </button>
              </div>
            </div>
          ) : !activePayment ? (
            /* ── STEP 1: PILIH METODE PEMBAYARAN ── */
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block">
                  Pilih Metode Pembayaran
                </label>
                <p className="text-[11px] text-slate-500">
                  Semua transaksi diproses langsung di website ini secara aman.
                </p>
              </div>

              <div className="space-y-2">
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = selectedMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethod(method.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-[#030C4D] bg-[#030C4D]/5 ring-1 ring-[#030C4D] shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
                            method.category === 'qris'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 text-[#030C4D] border-slate-200'
                          }`}
                        >
                          {method.category === 'qris' ? (
                            <QrCode size={18} />
                          ) : (
                            <CreditCard size={18} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs">
                              {method.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${method.badgeColor}`}
                            >
                              {method.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1">
                            {method.description}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-[#030C4D] bg-[#030C4D]'
                            : 'border-slate-300'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleStartPayment}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-[#030C4D] hover:bg-[#020510] text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Membuat Tagihan...</span>
                    </>
                  ) : (
                    <>
                      <span>Lanjut Pembayaran</span>
                      <ShieldCheck size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ── STEP 2: LAYAR PEMBAYARAN AKTIF (QRIS / VA) ── */
            <div className="space-y-5">
              {/* Status Header & Countdown */}
              <div className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-bold text-slate-700">Menunggu Pembayaran</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 font-semibold font-mono text-xs">
                  <Clock size={14} className="text-amber-600" />
                  <span>Sisa waktu: {formatCountdown(timeLeft)}</span>
                </div>
              </div>

              {/* TAMPILAN QRIS */}
              {details?.payment_method === 'qris' ? (
                <div className="text-center space-y-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs inline-block mx-auto">
                    {details.qr_url ? (
                      /* Menggunakan img standar untuk QR Code Midtrans agar bebas CORS */
                      <img
                        src={details.qr_url}
                        alt="QRIS Unelma CBT"
                        className="w-56 h-56 mx-auto rounded-lg object-contain"
                      />
                    ) : (
                      <div className="w-56 h-56 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                        QR Code Sedang Dimuat...
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-700">
                      <QrCode size={14} className="text-rose-600" />
                      <span>QRIS Nasional Terpadu</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Buka aplikasi <strong>BCA Mobile, Livin, BRImo, GoPay, OVO, Dana, ShopeePay</strong>, atau e-wallet lainnya, lalu arahkan kamera ke QR Code di atas.
                  </p>
                </div>
              ) : (
                /* TAMPILAN VIRTUAL ACCOUNT / MANDIRI BILL */
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      {details?.bank?.toUpperCase()} {details?.biller_code ? 'BILL PAYMENT' : 'VIRTUAL ACCOUNT'}
                    </span>

                    {/* Nomor VA Standar (BCA / BNI / BRI / Permata) */}
                    {details?.va_number && (
                      <div className="flex items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                            Nomor Virtual Account
                          </span>
                          <span className="font-mono text-lg sm:text-xl font-black text-slate-900 tracking-wider">
                            {details.va_number}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(details.va_number!, 'va')}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          {copiedKey === 'va' ? (
                            <>
                              <Check size={14} className="text-emerald-600" />
                              <span className="text-emerald-600">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Khusus Mandiri Bill Payment */}
                    {details?.biller_code && details?.bill_key && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                              Kode Perusahaan (Biller Code)
                            </span>
                            <span className="font-mono text-base font-black text-slate-900">
                              {details.biller_code}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(details.biller_code!, 'biller')}
                            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-xs flex items-center gap-1"
                          >
                            {copiedKey === 'biller' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            <span>Salin</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                              Nomor Tagihan (Bill Key)
                            </span>
                            <span className="font-mono text-base font-black text-slate-900">
                              {details.bill_key}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(details.bill_key!, 'billkey')}
                            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-xs flex items-center gap-1"
                          >
                            {copiedKey === 'billkey' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            <span>Salin</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Panduan Pembayaran Singkat */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div className="flex border-b border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => setGuideTab('mbanking')}
                        className={`flex-1 py-2 font-bold text-center transition-colors cursor-pointer ${
                          guideTab === 'mbanking'
                            ? 'bg-white text-[#030C4D] border-b-2 border-[#030C4D]'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Mobile Banking
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuideTab('atm')}
                        className={`flex-1 py-2 font-bold text-center transition-colors cursor-pointer ${
                          guideTab === 'atm'
                            ? 'bg-white text-[#030C4D] border-b-2 border-[#030C4D]'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        ATM
                      </button>
                    </div>

                    <div className="p-3 text-slate-600 space-y-1.5 leading-relaxed bg-white">
                      {guideTab === 'mbanking' ? (
                        <ol className="list-decimal pl-4 space-y-1">
                          <li>Buka aplikasi Mobile Banking pada smartphone Anda.</li>
                          <li>Pilih menu <strong>Transfer</strong> &gt; <strong>Virtual Account</strong>.</li>
                          <li>Masukkan Nomor Virtual Account yang tertera di atas.</li>
                          <li>Pastikan nominal pembayaran dan nama penerima sesuai.</li>
                          <li>Masukkan PIN Mobile Banking Anda untuk menyelesaikan transfer.</li>
                        </ol>
                      ) : (
                        <ol className="list-decimal pl-4 space-y-1">
                          <li>Masukkan kartu ATM dan 6 digit PIN Anda.</li>
                          <li>Pilih menu <strong>Transaksi Lainnya</strong> &gt; <strong>Transfer / Pembayaran</strong>.</li>
                          <li>Pilih <strong>Virtual Account</strong> dan masukkan nomor VA di atas.</li>
                          <li>Periksa rincian pada layar lalu tekan <strong>Ya / Benar</strong>.</li>
                        </ol>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Aksi Cek Status & Ganti Metode */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isChecking}
                  className="w-full py-3 bg-[#030C4D] hover:bg-[#020510] text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
                  <span>{isChecking ? 'Memeriksa ke Gateway...' : 'Saya Sudah Bayar (Cek Status)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivePayment(null);
                    setErrorMessage(null);
                  }}
                  className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-colors cursor-pointer text-center block"
                >
                  Ganti Metode Pembayaran
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-500">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Verifikasi Otomatis Terenkripsi</span>
          </div>
          <span>Unelma CBT</span>
        </div>
      </div>
    </div>
  );
}
