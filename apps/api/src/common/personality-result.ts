const PERSONALITY_TYPES = new Set(['sjt', 'likert', 'forced_choice', 'checklist', 'ranking', 'paired_comparison']);

/** Public result aggregates only: never include frozen questions or answer keys. */
export function personalityResultSummary(questions: { type?: string }[], metadata: Record<string, unknown> | null | undefined, graded: boolean) {
    const personalityQuestions = questions.filter(question => PERSONALITY_TYPES.has((question.type || '').toLowerCase())).length;
    const academicQuestions = questions.length - personalityQuestions;
    const scores = metadata?.dimension_scores;
    const values = scores && typeof scores === 'object' && !Array.isArray(scores) ? Object.values(scores) : null;
    const valid = values !== null && values.every(value => typeof value === 'number' && Number.isFinite(value));
    // Empty dimensions after completed grading mean no points (e.g. all unanswered).
    // Missing/invalid metadata must not look like a zero score.
    const total = valid && (values.length > 0 || graded) ? values.reduce<number>((sum, value) => sum + (value as number), 0) : null;
    return { academicQuestions, personalityQuestions, totalScore: personalityQuestions && total !== null && Number.isFinite(total) ? total : null,
        dimensionCount: valid ? values.length : 0 };
}
