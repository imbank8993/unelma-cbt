/**
 * Riwayat pengerjaan ulang. Ujian berbayar boleh dikerjakan ulang (lihat
 * `allowsPaidRetake`); semua pengerjaan tetap tersimpan, tetapi nilai resmi
 * siswa untuk satu ujian adalah pengerjaan SELESAI yang TERAKHIR.
 */
export const FINISHED_ATTEMPT_STATUSES = ['submitted', 'auto_submitted'];

export interface AttemptHistoryRow {
    id: string;
    exam_id?: string | null;
    user_id?: string | null;
    status?: string | null;
    finished_at?: string | null;
}

export interface AttemptOrder {
    attempt_number: number;
    attempt_count: number;
    is_latest_attempt: boolean;
}

const groupKey = (row: AttemptHistoryRow) => `${row.user_id ?? ''}:${row.exam_id ?? row.id}`;
const finishedTime = (row: AttemptHistoryRow) => Date.parse(row.finished_at || '') || 0;

/**
 * Nomor urut (1 = pertama) per siswa per ujian untuk pengerjaan yang sudah
 * selesai, beserta penanda pengerjaan terakhir (= nilai resmi). Baris yang
 * belum selesai tidak diberi nomor.
 */
export function finishedAttemptOrder(rows: AttemptHistoryRow[]): Map<string, AttemptOrder> {
    const groups = new Map<string, AttemptHistoryRow[]>();
    for (const row of rows) {
        if (row.status != null && !FINISHED_ATTEMPT_STATUSES.includes(row.status)) continue;
        const group = groups.get(groupKey(row)) || [];
        group.push(row);
        groups.set(groupKey(row), group);
    }
    const order = new Map<string, AttemptOrder>();
    for (const group of groups.values()) {
        const sorted = [...group].sort((a, b) => finishedTime(a) - finishedTime(b) || String(a.id).localeCompare(String(b.id)));
        sorted.forEach((row, index) => order.set(row.id, {
            attempt_number: index + 1, attempt_count: sorted.length, is_latest_attempt: index === sorted.length - 1,
        }));
    }
    return order;
}

/** Buang pengerjaan selesai yang sudah digantikan pengerjaan ulang yang lebih baru. */
export function withoutSupersededAttempts<T extends AttemptHistoryRow>(rows: T[]): T[] {
    const order = finishedAttemptOrder(rows);
    return rows.filter(row => order.get(row.id)?.is_latest_attempt !== false);
}
