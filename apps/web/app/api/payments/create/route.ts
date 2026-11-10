import { proxyJson } from '@/lib/nest-proxy';
import { NextRequest } from 'next/server';

/**
 * Pembelian token wajib login: transaksi harus terikat ke user_id agar kredit
 * webhook masuk ke akun yang benar, dan agar pesanan anonim tidak bisa
 * membanjiri tabel transaksi maupun kuota API Snap.
 *
 * Tanpa sesi, proxy membalas 401 "…Silakan login ulang." — landing page
 * memakai kata "login" itu untuk mengarahkan pengguna ke halaman masuk.
 */
export async function POST(request: NextRequest) {
  return proxyJson(request, '/tokens/payments/create', 'POST');
}
