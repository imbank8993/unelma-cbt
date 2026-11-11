import { redirect } from 'next/navigation';

/**
 * ASAS/ASAT/AM adalah urusan sekolah dan dikelola Admin. Proktor yang membuka
 * alamat lama ini (bookmark/riwayat) diarahkan ke daftar ujiannya sendiri,
 * alih-alih melihat halaman yang semua permintaannya ditolak server.
 */
export default function ProctorPasPeriodRedirectPage() {
    redirect('/dashboard/proktor/exams');
}
