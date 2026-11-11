import { getUserTokenBalance, unlockItemWithTokens } from '@/lib/api/tokens';
import { alertDialog, confirmDialog } from '@/lib/confirm-dialog';

export interface PaidExamLike {
    id: string;
    title: string;
    is_paid?: boolean;
    token_price?: number;
    isUnlocked?: boolean;
    isInProgress?: boolean;
}

/** Ujian berbayar yang belum dibuka siswa ini (pengerjaan berjalan tidak dikunci server). */
export function needsTokenUnlock(exam: PaidExamLike): boolean {
    return Boolean(exam.is_paid && (exam.token_price ?? 0) > 0 && !exam.isUnlocked && !exam.isInProgress);
}

/**
 * Gerbang sebelum masuk halaman ujian: siswa menyetujui dan membayar tarif token
 * DI KARTU, bukan baru ditolak setelah membuka halaman ujian.
 *
 * Mengembalikan true bila ujian boleh dibuka (gratis, sudah dibuka, atau baru
 * saja berhasil dibayar). `onTopUp` dipanggil bila saldo kurang dan siswa
 * memilih mengisi token.
 */
export async function unlockPaidExamBeforeStart(exam: PaidExamLike, onTopUp: () => void): Promise<boolean> {
    if (!needsTokenUnlock(exam)) return true;
    const price = exam.token_price ?? 0;

    const balanceRes = await getUserTokenBalance();
    const balance = balanceRes.success ? Number(balanceRes.token_balance) || 0 : null;

    if (balance !== null && balance < price) {
        const topUp = await confirmDialog({
            title: 'Saldo Token Tidak Cukup',
            text: `"${exam.title}" memerlukan ${price} token, sedangkan saldo Anda ${balance} token. Isi token terlebih dahulu untuk mengerjakan ujian ini.`,
            confirmText: 'Top Up Token',
            cancelText: 'Nanti',
            variant: 'warning',
        });
        if (topUp) onTopUp();
        return false;
    }

    const agreed = await confirmDialog({
        title: 'Buka Ujian Berbayar',
        text: balance !== null
            ? `"${exam.title}" memerlukan ${price} token. Saldo Anda ${balance} token, sisa ${balance - price} token setelah dibuka. Token dipotong sekali dan ujian langsung dapat dikerjakan.`
            : `"${exam.title}" memerlukan ${price} token. Token dipotong sekali dan ujian langsung dapat dikerjakan.`,
        confirmText: `Bayar ${price} Token`,
        cancelText: 'Batal',
        variant: 'primary',
    });
    if (!agreed) return false;

    const res = await unlockItemWithTokens('exam', exam.id, price);
    if (!res.success) {
        await alertDialog({
            title: 'Ujian Belum Dapat Dibuka',
            text: res.error || 'Gagal membuka akses ujian. Silakan coba lagi.',
            variant: 'danger',
        });
        return false;
    }
    return true;
}
