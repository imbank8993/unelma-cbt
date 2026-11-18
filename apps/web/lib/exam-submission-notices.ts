import type { ExamSubmissionRegistration } from './exam-durable-storage';

export const EXAM_SUBMISSION_NOTICE_KEY = 'acca_exam_delivery_notices_v1';
const MAX_NOTICES = 100;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
type Notice = { scope: string; error: string; at: number };
type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** A new user, device, or exam generation is a different delivery issue. */
export function examSubmissionScope(entry: ExamSubmissionRegistration): string {
    return JSON.stringify([entry.userId, entry.deviceId, entry.examId, entry.attemptId,
        Date.parse(entry.startedAt), Date.parse(entry.personalEndTime)]);
}

export function createExamSubmissionNoticeGate(storage: () => NoticeStorage | null, now = Date.now) {
    let memory: Notice[] = [];
    const read = () => {
        let stored: Notice[] = [];
        try {
            const value: unknown = JSON.parse(storage()?.getItem(EXAM_SUBMISSION_NOTICE_KEY) || '[]');
            if (Array.isArray(value)) stored = value.filter((item): item is Notice => item && typeof item.scope === 'string' &&
                typeof item.error === 'string' && Number.isFinite(item.at));
        } catch { /* In-memory suppression still works if browser storage is blocked. */ }
        const unique = new Map<string, Notice>();
        for (const item of [...stored, ...memory]) {
            if (item.at + MAX_AGE_MS <= now()) continue;
            const key = JSON.stringify([item.scope, item.error]);
            if ((unique.get(key)?.at ?? -Infinity) < item.at) unique.set(key, item);
        }
        return [...unique.values()].sort((a, b) => a.at - b.at).slice(-MAX_NOTICES);
    };
    const save = (notices: Notice[]) => {
        const unique = new Map(notices.map(item => [JSON.stringify([item.scope, item.error]), item]));
        memory = [...unique.values()].slice(-MAX_NOTICES);
        try { storage()?.setItem(EXAM_SUBMISSION_NOTICE_KEY, JSON.stringify(memory)); } catch { /* Keep the in-memory copy. */ }
    };
    return {
        claim(entry: ExamSubmissionRegistration, error: string): boolean {
            const scope = examSubmissionScope(entry);
            const notices = read();
            if (notices.some(item => item.scope === scope && item.error === error)) return false;
            save([...notices, { scope, error, at: now() }]);
            return true;
        },
        clear(entry: ExamSubmissionRegistration): void {
            const scope = examSubmissionScope(entry);
            save(read().filter(item => item.scope !== scope));
        },
    };
}

const browserGate = createExamSubmissionNoticeGate(() => {
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
});

/** The lock suppresses the same toast across simultaneously open browser tabs. */
export async function claimExamSubmissionWarning(entry: ExamSubmissionRegistration, error: string): Promise<boolean> {
    const claim = () => browserGate.claim(entry, error);
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        try { return await navigator.locks.request('unelma-exam-delivery-notices', claim); } catch { /* Older/private browser fallback. */ }
    }
    return claim();
}
export function clearExamSubmissionWarnings(entry: ExamSubmissionRegistration): void { browserGate.clear(entry); }
