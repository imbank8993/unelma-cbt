// Run from repository root: node --test apps/api/test/exam-type-catalog.test.cjs
// Jenis ujian kustom (Pengaturan → Jenis Ujian): mode nilai (skala 0–100 / skor
// mentah) dan aturan kelulusan (KKM / passing grade per subtes, mis. SKD CPNS).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });

const { fixtureDb } = require('./fixture-db.cjs');
const {
    DEFAULT_EXAM_TYPE_CATALOG, normalizeExamTypeCatalog, parseExamTypeCatalog, examTypeRule, examTypeRuleSnapshot,
} = require('../src/common/exam-type-catalog.ts');
const { evaluateExamPass, examPassStatuses, materiMatches, publicPassResult } = require('../src/common/exam-pass-status.ts');
const { SettingsService } = require('../src/settings/settings.service.ts');
const { ExamAdminService } = require('../src/proctor/exam-admin.service.ts');
const { assertQuestionStructure } = require('../src/questions/questions.service.ts');
const { studentExamMetadata } = require('../src/students/student-exam-metadata.ts');

const read = rel => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', rel), 'utf8');
const skd = examTypeRuleSnapshot(DEFAULT_EXAM_TYPE_CATALOG.types[0]);
const finished = { id: 'a1', status: 'submitted', total_score: 70, needs_manual_grading: false };

// 30 TWK (5 poin), 35 TIU (5 poin), 45 TKP (bobot 1–5) seperti SKD sebenarnya.
function skdQuestions() {
    const make = (prefix, count, topic) => Array.from({ length: count }, (_, i) => ({
        id: `${prefix}${i}`, type: 'mcq', score_default: 5, topic, metadata: {},
    }));
    return [...make('twk', 30, 'TWK - Pancasila'), ...make('tiu', 35, 'TIU'), ...make('tkp', 45, 'tkp: pelayanan publik')];
}
function answersFor(questions, scoreFor) {
    return questions.map(question => ({ question_id: question.id, score: scoreFor(question) }));
}

test('default catalog offers SKD CPNS with raw scores and PG TWK 65 / TIU 80 / TKP 166', () => {
    const catalog = parseExamTypeCatalog(null);
    assert.equal(catalog.types.length, 1);
    const [type] = catalog.types;
    assert.equal(type.code, 'skd_cpns');
    assert.equal(type.score_mode, 'raw');
    assert.deepEqual(type.pass_rule.subtests.map(s => [s.materi[0], s.passing_grade]), [['TWK', 65], ['TIU', 80], ['TKP', 166]]);
    assert.equal(type.pass_rule.total_passing_grade, null);
    // Katalog yang sengaja dikosongkan tetap kosong (bukan kembali ke bawaan).
    assert.deepEqual(parseExamTypeCatalog({ types: [] }).types, []);
});

test('catalog validation: codes, scale-aware KKM, unique materi, and admin-friendly errors', () => {
    const catalog = normalizeExamTypeCatalog({ types: [
        { label: 'Ujian TO', score_mode: 'raw', pass_rule: { mode: 'kkm', kkm: 250 } },
        { label: 'Kuis Bab', pass_rule: { mode: 'none' } },
    ] });
    assert.equal(catalog.types[0].code, 'ujian_to');
    assert.equal(catalog.types[0].pass_rule.kkm, 250);
    assert.equal(catalog.types[1].score_mode, 'scaled');
    assert.equal(catalog.types[1].active, true);

    const rejects = (types, pattern) => assert.throws(() => normalizeExamTypeCatalog({ types }), pattern);
    rejects([{ label: 'X', code: 'tryout' }], /bawaan/);
    rejects([{ label: 'X', code: 'Bad Code' }], /huruf kecil/);
    assert.equal(normalizeExamTypeCatalog({ types: [{ label: 'X' }, { label: '2026' }] }).types.map(t => t.code).join(), 'jenis_x,jenis_2026');
    rejects([{ label: 'A', code: 'aa' }, { label: 'B', code: 'aa' }], /ganda/);
    rejects([{ label: 'Skala', pass_rule: { mode: 'kkm', kkm: 250 } }], /antara 0 dan 100/);
    rejects([{ label: 'Kosong', pass_rule: { mode: 'kkm', kkm: null } }], /angka/);
    rejects([{ label: 'X', score_mode: 'percent' }], /Mode nilai/);
    rejects([{ label: 'X', pass_rule: { mode: 'passing_grade', subtests: [] } }], /minimal satu subtes/);
    rejects([{ label: 'X', pass_rule: { mode: 'passing_grade', subtests: [{ name: 'TWK', materi: [], passing_grade: 65 }] } }], /materi kisi-kisi/);
    rejects([{ label: 'X', pass_rule: { mode: 'passing_grade', subtests: [
        { name: 'A', materi: ['TWK'], passing_grade: 1 }, { name: 'B', materi: ['twk'], passing_grade: 1 },
    ] } }], /dipakai oleh subtes/);
    assert.throws(() => normalizeExamTypeCatalog('nope'), /tidak valid/);
});

test('materi matching is case-insensitive and accepts "TWK - topik" but not "TWKX"', () => {
    assert.equal(materiMatches('TWK', 'twk'), true);
    assert.equal(materiMatches('  twk - Pancasila ', 'TWK'), true);
    assert.equal(materiMatches('TWK: Nasionalisme', 'TWK'), true);
    assert.equal(materiMatches('TWKX', 'TWK'), false);
    assert.equal(materiMatches(null, 'TWK'), false);
});

test('SKD passes only when every subtest reaches its passing grade', () => {
    const questions = skdQuestions();
    // TWK 14 benar = 70, TIU 17 benar = 85, TKP rata-rata 4 = 180 → lulus.
    const pass = answersFor(questions, q => q.id.startsWith('twk') ? (Number(q.id.slice(3)) < 14 ? 5 : 0)
        : q.id.startsWith('tiu') ? (Number(q.id.slice(3)) < 17 ? 5 : 0) : 4);
    const result = evaluateExamPass(skd, finished, questions, pass);
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.subtests.map(s => [s.key, s.score, s.max_score]), [['twk', 70, 150], ['tiu', 85, 175], ['tkp', 180, 225]]);
    assert.equal(result.raw_score, 335);
    assert.equal(result.score, 335);
    assert.equal(result.max_score, 550);

    // Total tinggi tetapi TWK 60 < 65 → tidak lulus.
    const failTwk = answersFor(questions, q => q.id.startsWith('twk') ? (Number(q.id.slice(3)) < 12 ? 5 : 0) : 5);
    const failed = evaluateExamPass(skd, finished, questions, failTwk);
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.subtests.map(s => s.passed), [false, true, true]);
});

test('SKD status is pending while grading and unmapped when a subtest has no questions', () => {
    const questions = skdQuestions();
    const full = answersFor(questions, () => 5);
    assert.equal(evaluateExamPass(skd, { ...finished, total_score: null }, questions, full).status, 'pending');
    assert.equal(evaluateExamPass(skd, { ...finished, needs_manual_grading: true }, questions, full).status, 'pending');
    assert.equal(evaluateExamPass(skd, { ...finished, status: 'in_progress' }, questions, full).status, 'pending');

    const noTkp = questions.filter(q => !q.id.startsWith('tkp')).concat({ id: 'x', type: 'mcq', score_default: 5, topic: 'Lain-lain' });
    const unmapped = evaluateExamPass(skd, finished, noTkp, full);
    assert.equal(unmapped.status, 'unmapped');
    assert.equal(unmapped.unmapped_question_count, 1);
    assert.equal(publicPassResult(unmapped).unmapped_question_count, undefined);
});

test('cancelled and psychometric questions never count toward raw or subtest scores', () => {
    const questions = [
        { id: 'a', type: 'mcq', score_default: 5, topic: 'TWK' },
        { id: 'b', type: 'mcq', score_default: 5, topic: 'TWK', metadata: { score_excluded: true } },
        { id: 'c', type: 'sjt', score_default: 5, topic: 'TWK' },
        { id: 't', type: 'mcq', score_default: 5, topic: 'TIU' },
        { id: 'k', type: 'mcq', score_default: 5, topic: 'TKP' },
    ];
    const result = evaluateExamPass(skd, finished, questions, answersFor(questions, () => 5));
    assert.equal(result.subtests[0].score, 5);
    assert.equal(result.subtests[0].question_count, 1);
    assert.equal(result.raw_max_score, 15);
});

test('KKM compares the 0–100 score or the raw total according to the score mode', () => {
    const scaled = { code: 'harian', label: 'Harian', score_mode: 'scaled', pass_rule: { mode: 'kkm', kkm: 75 } };
    assert.equal(evaluateExamPass(scaled, { ...finished, total_score: 75 }).status, 'passed');
    assert.equal(evaluateExamPass(scaled, { ...finished, total_score: '74.99' }).status, 'failed');
    assert.equal(evaluateExamPass(scaled, { ...finished, total_score: 80 }).max_score, 100);

    const raw = { code: 'ujian_to', label: 'Ujian TO', score_mode: 'raw', pass_rule: { mode: 'kkm', kkm: 12 } };
    const questions = [1, 2, 3].map(i => ({ id: `q${i}`, type: 'mcq', score_default: 5 }));
    const result = evaluateExamPass(raw, { ...finished, total_score: 66.67 }, questions, [
        { question_id: 'q1', score: 5 }, { question_id: 'q2', score: '5' }, { question_id: 'q3', score: 0 },
    ]);
    // Skor mentah 10 < KKM 12 → tidak lulus, walau nilai skala 66,67.
    assert.deepEqual([result.status, result.score, result.max_score], ['failed', 10, 15]);

    const none = { ...raw, pass_rule: { mode: 'none' } };
    const noRule = evaluateExamPass(none, finished, questions, [{ question_id: 'q1', score: 5 }]);
    assert.deepEqual([noRule.status, noRule.raw_score], ['none', 5]);
    assert.equal(evaluateExamPass(null, finished), null);
});

test('examPassStatuses reads answer scores per attempt and skips exams without a custom type', async () => {
    const db = fixtureDb({ cbt_answers: [
        { attempt_id: 'a1', question_id: 'q1', score: 5 },
        { attempt_id: 'a1', question_id: 'q2', score: 3 },
        { attempt_id: 'a2', question_id: 'q1', score: 0 },
    ] });
    const rule = { code: 'ujian_to', label: 'Ujian TO', score_mode: 'raw', pass_rule: { mode: 'kkm', kkm: 6 } };
    const exam = { id: 'e', exam_type: 'ujian_to', metadata: { exam_type_rule: rule } };
    const questions = [{ id: 'q1', type: 'mcq', score_default: 5, topic: null }, { id: 'q2', type: 'mcq', score_default: 5, topic: null }];
    const statuses = await examPassStatuses(db, exam, [{ ...finished, id: 'a1' }, { ...finished, id: 'a2' }], { questions });
    assert.deepEqual([statuses.get('a1').status, statuses.get('a1').raw_score], ['passed', 8]);
    assert.equal(statuses.get('a2').status, 'failed');

    const builtin = await examPassStatuses(db, { id: 'e', exam_type: 'daily', metadata: {} }, [finished]);
    assert.equal(builtin.size, 0);
    // Aturan yang tidak cocok dengan exam_type (mis. jenis diganti lewat jalur lain) diabaikan.
    assert.equal(examTypeRule({ exam_type: 'tryout', metadata: { exam_type_rule: rule } }), null);
});

test('settings store a normalized catalog and fall back to SKD CPNS when unset', async () => {
    const db = fixtureDb({ acca_settings: [] });
    const settings = new SettingsService(db);
    assert.equal((await settings.getExamTypeCatalog()).types[0].code, 'skd_cpns');
    await assert.rejects(settings.upsert('exam_type_catalog', { types: [{ label: 'X', code: 'pas' }] }), /bawaan/);
    await settings.upsert('exam_type_catalog', { types: [{ label: 'Ujian TO', score_mode: 'raw', pass_rule: { mode: 'kkm', kkm: '300' } }] });
    const stored = db.tables.acca_settings.find(row => row.key === 'exam_type_catalog').value;
    assert.equal(stored.types[0].code, 'ujian_to');
    assert.equal(stored.types[0].pass_rule.kkm, 300);
    assert.equal((await settings.getExamTypeCatalog()).types[0].label, 'Ujian TO');
    const controller = read('apps/api/src/settings/settings.controller.ts');
    assert.ok(controller.indexOf("@Get('exam-types')") < controller.indexOf("@Get(':key')"), 'route must precede :key');
});

test('exam creation accepts only active custom types and freezes their rule on the exam', async () => {
    const catalog = { types: [
        { ...DEFAULT_EXAM_TYPE_CATALOG.types[0] },
        { code: 'lama', label: 'Lama', description: '', active: false, score_mode: 'scaled', pass_rule: { mode: 'none' } },
    ] };
    const service = new ExamAdminService(null, null, null, { getExamTypeCatalog: async () => catalog });
    assert.equal(await service.resolveExamTypeRule('daily'), null);
    const snapshot = await service.resolveExamTypeRule('skd_cpns');
    assert.deepEqual([snapshot.code, snapshot.label, snapshot.score_mode], ['skd_cpns', 'SKD CPNS', 'raw']);
    await assert.rejects(service.resolveExamTypeRule('lama'), /dinonaktifkan/);
    await assert.rejects(service.resolveExamTypeRule('tidak_ada'), /tidak tersedia/);
    await assert.rejects(service.resolveExamTypeRule('quiz'), /tidak dikenal/);

    assert.deepEqual(service.withExamTypeRule({ a: 1 }, snapshot), { a: 1, exam_type_rule: snapshot });
    assert.deepEqual(service.withExamTypeRule({ a: 1, exam_type_rule: snapshot }, null), { a: 1 });
    assert.deepEqual(service.withExamTypeRule({ a: 1, exam_type_rule: snapshot }, undefined), { a: 1, exam_type_rule: snapshot });

    const source = read('apps/api/src/proctor/exam-admin.service.ts');
    assert.match(source, /metadata: this\.withExamTypeRule\(this\.buildMetadata\(examType, dto, \{\}\), examTypeRule\)/);
    assert.match(source, /examType !== existing\.exam_type\s*\n\s*\|\| \(!isBuiltinExamType\(examType\)/);
    const dto = read('apps/api/src/proctor/dto/proctor.dto.ts');
    assert.match(dto, /@Matches\(EXAM_TYPE_CODE_PATTERN/);
});

test('weighted MCQ (TKP) is validated, graded from option weight, and never exposed to students', () => {
    const options = [{ text: 'A', isCorrect: true, order: 0, weight: 5 }, { text: 'B', isCorrect: false, order: 1, weight: 2 }];
    assert.doesNotThrow(() => assertQuestionStructure({ type: 'mcq', options, metadata: { option_scoring: 'weighted' } }));
    assert.throws(() => assertQuestionStructure({ type: 'mcq_complex', options, metadata: { option_scoring: 'weighted' } }), /Pilihan Ganda biasa/);
    assert.throws(() => assertQuestionStructure({ type: 'mcq', options: options.map(o => ({ ...o, weight: -1 })), metadata: { option_scoring: 'weighted' } }), /bobot/);
    assert.throws(() => assertQuestionStructure({ type: 'mcq', options: options.map(o => ({ ...o, weight: 0 })), metadata: { option_scoring: 'weighted' } }), /lebih dari 0/);

    const grading = read('apps/scoring/app/services/grading.py');
    assert.match(grading, /if qtype == "mcq" and uses_weighted_options\(question\):/);
    assert.match(grading, /score_earned = min\(max\(_option_weight\(selected\), 0\), default_score\)/);
    const editor = read('apps/web/app/components/questions/QuestionEditorModal.tsx');
    assert.match(editor, /selectedType === 'mcq' && metadata\?\.option_scoring === 'weighted'\) \? \(opt\.weight \?\? 0\)/);

    const student = read('apps/api/src/students/student-question.ts');
    assert.doesNotMatch(student, /weight/);
});

test('students see the type label before results and the pass result only once results are released', () => {
    const metadata = studentExamMetadata({ is_public: true, exam_type_rule: { code: 'skd_cpns', label: 'SKD CPNS', pass_rule: { mode: 'kkm', kkm: 1 } } });
    assert.deepEqual(metadata, { is_public: true, exam_type_label: 'SKD CPNS' });

    const students = read('apps/api/src/students/students.service.ts');
    assert.match(students, /if \(row\.exams\?\.show_results !== true \|\| !examTypeRule\(row\.exams\)\) continue;/);
    assert.match(students, /pass_result: publicPassResult\(passResults\.get\(row\.id\)\)/);
    const monitoring = read('apps/api/src/proctor/exam-monitoring.service.ts');
    assert.match(monitoring, /pass_result: passResults\.get\(attempt\.id\) \|\| null/);
    const sidebar = read('apps/web/app/components/Sidebar.tsx');
    assert.equal((sidebar.match(/'\/dashboard\/admin\/exam-types'/g) || []).length, 2);
});
