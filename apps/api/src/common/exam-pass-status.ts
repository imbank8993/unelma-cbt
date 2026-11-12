import { BadRequestException } from '@nestjs/common';
import type { DbSession } from '../prisma/prisma-db-adapter';
import { chunk } from './chunk';
import { readExamQuestionVersion } from './exam-question-snapshots';
import { withQuestionTopics } from './exam-question-topics';
import {
    examTypeRule,
    normalizeMateri,
    type ExamScoreMode,
    type ExamSubtestRule,
    type ExamTypeRuleSnapshot,
} from './exam-type-catalog';

/**
 * Hasil satu pengerjaan menurut aturan jenis ujian kustomnya.
 *
 * Dihitung saat dibaca (bukan disimpan) dari nilai yang sudah tersimpan:
 *  - skor mentah   → jumlah `cbt_answers.score` soal akademik yang tidak dibatalkan;
 *  - KKM           → nilai sesuai mode (0–100 atau skor mentah) ≥ KKM;
 *  - passing grade → skor mentah per subtes (soal dipetakan lewat materi
 *    kisi-kisi). Lulus bila SETIAP subtes ≥ PG-nya (dan total ≥ PG total bila diatur).
 *
 * Karena dihitung dari nilai tersimpan, koreksi kunci, regrade, dan penilaian
 * esai otomatis ikut tercermin tanpa jalur tulis tambahan.
 */
export type ExamPassState = 'passed' | 'failed' | 'pending' | 'unmapped' | 'none';

export interface ExamSubtestResult {
    key: string;
    name: string;
    score: number;
    max_score: number;
    passing_grade: number;
    passed: boolean;
    question_count: number;
}

export interface ExamPassResult {
    type_code: string;
    type_label: string;
    score_mode: ExamScoreMode;
    mode: 'none' | 'kkm' | 'passing_grade';
    status: ExamPassState;
    /** Nilai yang dibandingkan/ditampilkan sesuai mode: 0–100 atau skor mentah. */
    score: number | null;
    max_score: number | null;
    raw_score: number;
    raw_max_score: number;
    kkm?: number;
    total_passing_grade?: number | null;
    subtests?: ExamSubtestResult[];
    unmapped_question_count?: number;
}

export interface PassAttempt {
    id: string;
    status?: string | null;
    total_score?: number | string | null;
    needs_manual_grading?: boolean | null;
}

export interface PassQuestion {
    id: string;
    topic?: string | null;
    score_default?: unknown;
    metadata?: unknown;
    type?: string;
}

export interface PassAnswer {
    question_id: string;
    score?: number | string | null;
}

const FINISHED = new Set(['submitted', 'auto_submitted']);
const NON_ACADEMIC = new Set(['likert', 'sjt', 'forced_choice', 'checklist', 'ranking', 'paired_comparison']);

const round = (value: number) => Math.round(value * 100) / 100;

function numeric(value: unknown): number | null {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

/** "TWK", "twk - Pancasila", "TWK: Nasionalisme" cocok dengan materi "TWK". */
export function materiMatches(topic: string | null | undefined, materi: string): boolean {
    const normalizedTopic = normalizeMateri(topic);
    const alias = normalizeMateri(materi);
    if (!normalizedTopic || !alias) return false;
    if (normalizedTopic === alias) return true;
    return normalizedTopic.startsWith(alias) && /[^\p{L}\p{N}]/u.test(normalizedTopic.charAt(alias.length));
}

export function subtestForTopic(subtests: ExamSubtestRule[], topic: string | null | undefined): ExamSubtestRule | null {
    return subtests.find(subtest => subtest.materi.some(materi => materiMatches(topic, materi))) || null;
}

function isCounted(question: PassQuestion): boolean {
    const metadata = (question.metadata && typeof question.metadata === 'object' ? question.metadata : {}) as Record<string, unknown>;
    return metadata.score_excluded !== true && !NON_ACADEMIC.has((question.type || '').toLowerCase());
}

/** Apakah perhitungan butuh soal & jawaban (bukan cukup `total_score`). */
export function needsAnswerScores(rule: ExamTypeRuleSnapshot | null): boolean {
    return Boolean(rule && (rule.score_mode === 'raw' || rule.pass_rule.mode === 'passing_grade'));
}

/** Hitung hasil satu pengerjaan. Murni — tanpa akses database. */
export function evaluateExamPass(
    rule: ExamTypeRuleSnapshot | null,
    attempt: PassAttempt,
    questions: PassQuestion[] = [],
    answers: PassAnswer[] = [],
): ExamPassResult | null {
    if (!rule) return null;
    const total = numeric(attempt.total_score);
    const pending = !FINISHED.has(attempt.status || '') || total == null || attempt.needs_manual_grading === true;

    const scores = new Map<string, number>();
    for (const answer of answers) {
        const value = numeric(answer.score);
        if (value != null) scores.set(answer.question_id, (scores.get(answer.question_id) || 0) + value);
    }
    const subtests = rule.pass_rule.mode === 'passing_grade' ? rule.pass_rule.subtests : [];
    const rows = new Map<string, ExamSubtestResult>(subtests.map(subtest => [subtest.key, {
        key: subtest.key, name: subtest.name, score: 0, max_score: 0,
        passing_grade: subtest.passing_grade, passed: false, question_count: 0,
    }]));
    let rawScore = 0;
    let rawMax = 0;
    let unmapped = 0;
    for (const question of questions) {
        if (!isCounted(question)) continue;
        const earned = scores.get(question.id) || 0;
        const max = numeric(question.score_default) ?? 0;
        rawScore += earned;
        rawMax += max;
        if (!subtests.length) continue;
        const subtest = subtestForTopic(subtests, question.topic);
        if (!subtest) { unmapped += 1; continue; }
        const row = rows.get(subtest.key)!;
        row.question_count += 1;
        row.max_score += max;
        row.score += earned;
    }

    const raw = rule.score_mode === 'raw';
    const base = {
        type_code: rule.code, type_label: rule.label, score_mode: rule.score_mode,
        raw_score: round(rawScore), raw_max_score: round(rawMax),
        score: raw ? round(rawScore) : total == null ? null : round(total),
        max_score: raw ? round(rawMax) : 100,
    };

    if (rule.pass_rule.mode === 'none') return { ...base, mode: 'none', status: pending ? 'pending' : 'none' };

    if (rule.pass_rule.mode === 'kkm') {
        const kkm = rule.pass_rule.kkm;
        return { ...base, mode: 'kkm', kkm,
            status: pending || base.score == null ? 'pending' : base.score >= kkm ? 'passed' : 'failed' };
    }

    const results = [...rows.values()].map(row => ({
        ...row, score: round(row.score), max_score: round(row.max_score), passed: row.score >= row.passing_grade,
    }));
    const subtestTotal = round(results.reduce((sum, row) => sum + row.score, 0));
    const { total_passing_grade } = rule.pass_rule;
    const passed = results.every(row => row.passed) && (total_passing_grade == null || subtestTotal >= total_passing_grade);
    const status: ExamPassState = results.some(row => row.question_count === 0) ? 'unmapped'
        : pending ? 'pending' : passed ? 'passed' : 'failed';
    return {
        ...base, mode: 'passing_grade', status, subtests: results,
        total_passing_grade, unmapped_question_count: unmapped,
    };
}

/**
 * Hasil banyak pengerjaan dari SATU ujian. Map kosong bila ujian tidak memakai
 * jenis ujian kustom.
 */
export async function examPassStatuses(
    db: DbSession,
    exam: { id: string; exam_type?: string | null; metadata?: Record<string, unknown> | null },
    attempts: PassAttempt[],
    preloaded: { questions?: PassQuestion[] } = {},
): Promise<Map<string, ExamPassResult>> {
    const result = new Map<string, ExamPassResult>();
    const rule = examTypeRule(exam);
    if (!rule || attempts.length === 0) return result;

    let questions: PassQuestion[] = [];
    const answers = new Map<string, PassAnswer[]>();
    if (needsAnswerScores(rule)) {
        questions = preloaded.questions?.every(question => 'topic' in question)
            ? preloaded.questions
            : await withQuestionTopics(db, ((preloaded.questions as any) || await readExamQuestionVersion(db, exam.id)) as any);
        for (const ids of chunk(attempts.map(attempt => attempt.id), 300)) {
            const { data, error } = await db.from('cbt_answers').select('attempt_id, question_id, score').in('attempt_id', ids);
            if (error) throw new BadRequestException('Nilai per subtes belum dapat dihitung.');
            for (const row of (data || []) as Array<PassAnswer & { attempt_id: string }>) {
                const list = answers.get(row.attempt_id) || [];
                list.push(row);
                answers.set(row.attempt_id, list);
            }
        }
    }
    for (const attempt of attempts) {
        const status = evaluateExamPass(rule, attempt, questions, answers.get(attempt.id) || []);
        if (status) result.set(attempt.id, status);
    }
    return result;
}

/** Ringkasan yang aman untuk siswa: tanpa jumlah soal tak terpetakan. */
export function publicPassResult(result: ExamPassResult | undefined | null): ExamPassResult | null {
    if (!result) return null;
    const { unmapped_question_count: _hidden, ...rest } = result;
    return rest;
}
