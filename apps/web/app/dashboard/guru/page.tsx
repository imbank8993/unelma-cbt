import { redirect } from 'next/navigation';

/**
 * Peran Guru sudah dilebur ke Proktor. Dasbor lama memuat riwayat login
 * seluruh anggota (kini khusus Admin), jadi rute ini dialihkan ke dasbor
 * Proktor. Sub-halaman /dashboard/guru/* tetap dilayani untuk Proktor.
 */
export default function GuruDashboardRedirect() {
    redirect('/dashboard/proktor');
}
