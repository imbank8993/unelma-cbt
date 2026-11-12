import { redirect } from 'next/navigation';

/** Analisis kini bergabung dengan Hasil dalam satu halaman. */
export default function StudentAnalyticsRedirect() {
    redirect('/dashboard/siswa/results?tab=analisis');
}
