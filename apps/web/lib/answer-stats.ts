import { hasStoredAnswer } from '@acca-cbt/shared';

export interface AnswerOutcome {
    is_correct?: boolean | null;
    is_answered?: boolean;
    essay_answer?: unknown;
    selected_option_id?: unknown;
    bank_questions?: { type?: string | null } | null;
}

/**
 * Soal kepribadian (cermin `apps/scoring/app/services/grading.py`): tidak
 * pernah benar/salah (`is_correct` null) dan tidak menyumbang nilai 0–100.
 * Jawabannya memberi poin ke dimensi kepribadian.
 */
export const PSYCHOMETRIC_TYPES = new Set(['likert', 'sjt', 'forced_choice', 'paired_comparison', 'checklist', 'ranking']);

export function isPsychometricType(type?: string | null): boolean {
    return PSYCHOMETRIC_TYPES.has((type || '').toLowerCase());
}

interface PointsAnswer {
    selected_option_id?: unknown;
    metadata?: { dimension_scores?: Record<string, number> | null } | null;
    bank_questions?: { type?: string | null; bank_question_options?: Array<{ id?: string; weight?: number | null }> | null } | null;
}

/** Jumlah poin dimensi satu jawaban; SJT tanpa hasil tersimpan memakai bobot opsi terpilih. */
export function psychometricPoints(answer: PointsAnswer): number | null {
    const stored = answer.metadata?.dimension_scores;
    if (stored && Object.keys(stored).length > 0) {
        return Object.values(stored).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }
    if ((answer.bank_questions?.type || '').toLowerCase() === 'sjt') {
        const option = answer.bank_questions?.bank_question_options?.find(item => item.id === answer.selected_option_id);
        if (option) return Math.max(Number(option.weight) || 0, 0);
    }
    return null;
}

export interface AnswerOutcomeSummary {
    total: number;
    correct: number;
    wrong: number;
    essays: number;
    answered: number;
    unanswered: number;
    ungraded: number;
}

const ESSAY_TYPES = new Set(['essay', 'esay', 'uraian']);

export type AnswerOutcomeFilter = 'all' | 'correct' | 'wrong' | 'unanswered';

export function isAnswerUnanswered(answer: AnswerOutcome): boolean {
    return answer.is_answered === false || !hasStoredAnswer(answer);
}

export function matchesAnswerOutcome(answer: AnswerOutcome, filter: AnswerOutcomeFilter): boolean {
    if (filter === 'all') return true;
    const unanswered = isAnswerUnanswered(answer);
    if (filter === 'unanswered') return unanswered;
    if (unanswered) return false;
    if (ESSAY_TYPES.has(answer.bank_questions?.type || '')) return false;
    if (isPsychometricType(answer.bank_questions?.type)) return false;
    return answer.is_correct === (filter === 'correct');
}

/** Hitung benar/salah hanya untuk soal objektif; esai tetap menunggu penilaian. */
export function summarizeAnswerOutcomes(answers: AnswerOutcome[]): AnswerOutcomeSummary {
    const answered = answers.filter(answer => !isAnswerUnanswered(answer));
    // Soal kepribadian tidak punya benar/salah dan tidak "menunggu penilaian".
    const objective = answered.filter(answer => !ESSAY_TYPES.has(answer.bank_questions?.type || '')
        && !isPsychometricType(answer.bank_questions?.type));
    return {
        total: answers.length,
        correct: objective.filter(answer => answer.is_correct === true).length,
        wrong: objective.filter(answer => answer.is_correct === false).length,
        essays: answered.filter(answer => ESSAY_TYPES.has(answer.bank_questions?.type || '')).length,
        answered: answered.length,
        unanswered: answers.length - answered.length,
        ungraded: objective.filter(answer => answer.is_correct == null).length,
    };
}
