import { apiGet, apiSend } from './api/client';
import { learningPrograms, type LearningProgram } from './learning-catalog';

/**
 * Tujuan belajar siswa (Sekolah, UTBK, CPNS, PPPK, ...). Sumber utamanya server
 * (`/api/students/learning-goal`) agar ikut terbawa antar perangkat. Salinan di
 * perangkat dipakai sebagai cadangan bila server belum siap/terputus, dan
 * dipindahkan ke server sekali saat server masih kosong.
 */
export interface LearningGoal {
    programs: LearningProgram[];
    /** Target bebas, misalnya "Lolos SKD dengan nilai 400". */
    target?: string;
    /** Tanggal ujian/seleksi yang dituju (YYYY-MM-DD). */
    targetDate?: string;
}

const storageKey = (userId: string) => `unelma:learning-goal:${userId}`;
const PROGRAM_VALUES = new Set(learningPrograms.map(item => item.value));

/** Rapikan data dari server/penyimpanan lokal; null bila tidak valid. */
export function normalizeLearningGoal(raw: unknown): LearningGoal | null {
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as { programs?: unknown; target?: unknown; targetDate?: unknown };
    if (!Array.isArray(value.programs)) return null;
    const programs = [...new Set(value.programs.filter((item): item is LearningProgram => PROGRAM_VALUES.has(item as LearningProgram)))];
    if (!programs.length) return null;
    return {
        programs,
        target: typeof value.target === 'string' && value.target.trim() ? value.target.trim().slice(0, 120) : undefined,
        targetDate: typeof value.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.targetDate) ? value.targetDate : undefined,
    };
}

function readLocal(userId: string): LearningGoal | null {
    try { return normalizeLearningGoal(JSON.parse(window.localStorage.getItem(storageKey(userId)) || 'null')); } catch { return null; }
}
function writeLocal(userId: string, goal: LearningGoal) {
    try { window.localStorage.setItem(storageKey(userId), JSON.stringify(goal)); } catch { /* penyimpanan penuh/diblokir */ }
}

/** Ambil tujuan dari server; jatuh ke salinan perangkat bila server belum bisa. */
export async function loadLearningGoal(userId: string): Promise<LearningGoal | null> {
    const local = readLocal(userId);
    const res = await apiGet<{ goal: unknown; stored: boolean }>('/api/students/learning-goal').catch(() => null);
    if (!res || !res.success || !res.stored) return local;
    const remote = normalizeLearningGoal(res.goal);
    if (remote) { writeLocal(userId, remote); return remote; }
    // Server kosong tetapi perangkat punya tujuan lama: pindahkan sekali ke server.
    if (local) await apiSend('/api/students/learning-goal', local, 'PUT').catch(() => null);
    return local;
}

/** Simpan ke server (sumber utama) dan perangkat (cadangan). */
export async function saveLearningGoal(userId: string, goal: LearningGoal): Promise<{ synced: boolean; error?: string }> {
    writeLocal(userId, goal);
    const res = await apiSend<{ goal: unknown }>('/api/students/learning-goal', goal, 'PUT').catch(() => null);
    if (res?.success) return { synced: true };
    return { synced: false, error: res && !res.success ? res.error : undefined };
}

/** Sisa hari menuju tanggal target (0 = hari ini), atau null bila tidak ada/sudah lewat. */
export function daysUntil(date: string | undefined, now: number): number | null {
    if (!date || !Number.isFinite(now)) return null;
    const [year, month, day] = date.split('-').map(Number);
    const target = new Date(year, month - 1, day).getTime();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const days = Math.round((target - today.getTime()) / 86_400_000);
    return Number.isFinite(days) && days >= 0 ? days : null;
}

export const programLabel = (program: LearningProgram) => learningPrograms.find(item => item.value === program)?.label || program;
