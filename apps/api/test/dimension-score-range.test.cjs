// Run from repository root: node --test apps/api/test/dimension-score-range.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const {
    dimensionScoreRange, generateInterpretations, uncoveredScores,
} = require('../../web/lib/dimension-score-range.ts');

const DIM = 'dim-integritas';
const OTHER = 'dim-lain';
const likert = (dimension_id = DIM) => ({ type: 'likert', dimension_id });

test('likert and SJT add up per dimension, mirroring the scoring service', () => {
    const questions = [likert(), likert(), likert(), likert(), likert(OTHER),
        { type: 'sjt', dimension_id: DIM, bank_question_options: [{ weight: 1 }, { weight: 3 }, { weight: 5 }, { weight: 0 }] },
        { type: 'mcq', dimension_id: DIM, bank_question_options: [{ weight: 9 }] }];
    // 4 likert (1–5) + SJT (0–5); PG tidak menyumbang poin dimensi.
    assert.deepEqual(dimensionScoreRange(questions, DIM), { min: 4, max: 25, questionCount: 5 });
    assert.equal(dimensionScoreRange([likert(OTHER)], DIM), null);
});

test('option-level dimensions: forced choice, checklist, and ranking', () => {
    const forced = { type: 'forced_choice', bank_question_options: [
        { weight: 2, metadata: { dimension_id: DIM } }, { weight: 1, metadata: { dimension_id: OTHER } }] };
    assert.deepEqual(dimensionScoreRange([forced], DIM), { min: 0, max: 2, questionCount: 1 });

    const checklist = { type: 'checklist', bank_question_options: [
        { metadata: { dimension_id: DIM } }, { weight: 2, metadata: { dimension_id: DIM } }, { metadata: { dimension_id: OTHER } }] };
    assert.deepEqual(dimensionScoreRange([checklist], DIM), { min: 0, max: 3, questionCount: 1 });

    // 4 opsi, 2 milik DIM: teratas 4+3 = 7, terbawah 1+2 = 3.
    const ranking = { type: 'ranking', bank_question_options: [
        { metadata: { dimension_id: DIM } }, { metadata: { dimension_id: DIM } }, { metadata: { dimension_id: OTHER } }, {}] };
    assert.deepEqual(dimensionScoreRange([ranking], DIM), { min: 3, max: 7, questionCount: 1 });
});

test('generated levels cover every score exactly once, with no gaps or overlaps', () => {
    for (const [min, max] of [[4, 20], [5, 25], [0, 2], [3, 4], [1, 100], [0, 7]]) {
        const levels = generateInterpretations('Integritas', { min, max, questionCount: 1 });
        assert.equal(levels[0].min_score, min);
        assert.equal(levels.at(-1).max_score, max);
        for (let i = 1; i < levels.length; i += 1) assert.equal(levels[i].min_score, levels[i - 1].max_score + 1);
        assert.ok(levels.every(level => level.min_score <= level.max_score));
        assert.deepEqual(uncoveredScores({ min, max }, levels), []);
    }
    const levels = generateInterpretations('Integritas', { min: 4, max: 20, questionCount: 4 });
    assert.deepEqual(levels.map(level => [level.min_score, level.max_score, level.title]),
        [[4, 9, 'Integritas rendah'], [10, 14, 'Integritas sedang'], [15, 20, 'Integritas tinggi']]);
    assert.match(levels[2].interpretation, /Integritas kamu tinggi/);
});

test('gaps in hand-written ranges are reported', () => {
    assert.deepEqual(uncoveredScores({ min: 4, max: 12 }, [{ min_score: 4, max_score: 6 }, { min_score: 9, max_score: 11 }]), [7, 8, 12]);
});
