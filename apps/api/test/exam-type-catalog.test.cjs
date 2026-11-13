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
const SKD_TYPE = DEFAULT_EXAM_TYPE_CATALOG.types.find(type => type.code === 'skd_cpns');
const skd = examTypeRuleSnapshot(SKD_TYPE);
const BUILTIN_CODES = ['daily', 'asas_asat', 'am', 'tryout', 'assignment', 'lainnya'];
const custom = catalog => catalog.types.filter(type => !type.builtin);
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
    assert.deepEqual(catalog.types.map(type => type.code), [...BUILTIN_CODES, 'skd_cpns']);
    const [type] = custom(catalog);
    assert.equal(type.code, 'skd_cpns');
    assert.equal(type.score_mode, 'raw');
    assert.deepEqual(type.pass_rule.subtests.map(s => [s.materi[0], s.passing_grade]), [['TWK', 65], ['TIU', 80], ['TKP', 166]]);
    assert.equal(type.pass_rule.total_passing_grade, null);
    // Jenis tambahan yang sengaja dikosongkan tetap kosong; jenis bawaan selalu ada.
    assert.deepEqual(parseExamTypeCatalog({ types: [] }).types.map(type => type.code), BUILTIN_CODES);
});

test('catalog validation: codes, scale-aware KKM, unique materi, and admin-friendly errors', () => {
    const catalog = custom(normalizeExamTypeCatalog({ types: [
        { label: 'Ujian TO', score_mode: 'raw', pass_rule: { mode: 'kkm', kkm: 250 } },
        { label: 'Kuis Bab', pass_rule: { mode: 'none' } },
    ] }));
    assert.equal(catalog[0].code, 'ujian_to');
    assert.equal(catalog[0].pass_rule.kkm, 250);
    assert.equal(catalog[1].score_mode, 'scaled');
    assert.equal(catalog[1].active, true);

    const rejects = (types, pattern) => assert.throws(() => normalizeExamTypeCatalog({ types }), pattern);
    rejects([{ label: 'X', code: 'quiz' }], /bawaan/);
    rejects([{ label: 'X', code: 'Bad Code' }], /huruf kecil/);
    assert.equal(custom(normalizeExamTypeCatalog({ types: [{ label: 'X' }, { label: '2026' }] })).map(t => t.code).join(), 'jenis_x,jenis_2026');
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
    assert.equal(custom(await settings.getExamTypeCatalog())[0].code, 'skd_cpns');
    await assert.rejects(settings.upsert('exam_type_catalog', { types: [{ label: 'X', code: 'pas' }] }), /bawaan/);
    await settings.upsert('exam_type_catalog', { types: [{ label: 'Ujian TO', score_mode: 'raw', pass_rule: { mode: 'kkm', kkm: '300' } }] });
    const stored = db.tables.acca_settings.find(row => row.key === 'exam_type_catalog').value;
    assert.equal(custom(stored)[0].code, 'ujian_to');
    assert.equal(custom(stored)[0].pass_rule.kkm, 300);
    assert.equal(custom(await settings.getExamTypeCatalog())[0].label, 'Ujian TO');
    const controller = read('apps/api/src/settings/settings.controller.ts');
    assert.ok(controller.indexOf("@Get('exam-types')") < controller.indexOf("@Get(':key')"), 'route must precede :key');
});

test('exam creation accepts only active custom types and freezes their rule on the exam', async () => {
    const catalog = { types: [
        { ...SKD_TYPE },
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
    assert.match(source, /metadata: this\.withExamTypeRule\(this\.buildMetadata\(examType, dto, \{\}, true\), examTypeRule\)/);
    assert.match(source, /const examTypeRule = typeChanged\s*\n\s*\|\| \(!isBuiltinExamType\(requestedType\)/);
    const dto = read('apps/api/src/proctor/dto/proctor.dto.ts');
    assert.match(dto, /@Matches\(EXAM_TYPE_CODE_PATTERN/);
});

test('built-in types live in the catalog: fixed code and pattern, editable label, rules, visibility, and creators', async () => {
    // Katalog lama (hanya jenis tambahan) mendapat jenis bawaan di depan.
    const legacy = normalizeExamTypeCatalog({ types: [{ code: 'skd_cpns', label: 'SKD CPNS' }] });
    assert.deepEqual(legacy.types.map(type => type.code), [...BUILTIN_CODES, 'skd_cpns']);
    assert.deepEqual(legacy.types.map(type => type.pattern), ['regular', 'folder', 'folder', 'regular', 'assignment', 'regular', 'regular']);

    const catalog = normalizeExamTypeCatalog({ types: [
        { code: 'asas_asat', label: 'Penilaian Akhir Semester', pattern: 'regular', creators: 'staff', pass_rule: { mode: 'kkm', kkm: 70 } },
        { code: 'tryout', label: 'Try Out', active: false, creators: 'admin' },
        { code: 'daily', label: 'Ulangan Harian', score_mode: 'raw' },
    ] });
    const asas = catalog.types.find(type => type.code === 'asas_asat');
    assert.equal(asas.pattern, 'folder', 'pola jenis bawaan tidak dapat diubah');
    assert.equal(asas.creators, 'admin', 'folder ujian selalu hanya Admin');
    assert.equal(asas.builtin, true);
    assert.throws(() => normalizeExamTypeCatalog({ types: [{ label: 'Aneh', pattern: 'kuis' }] }), /Ujian Biasa, Folder Ujian, atau Tugas/);
    assert.throws(() => normalizeExamTypeCatalog({ types: [{ label: 'Ulangan Harian', code: 'uh' }] }), /sudah dipakai jenis bawaan/);

    const { builtinExamTypeRule } = require('../src/common/exam-type-catalog.ts');
    // Belum diubah = tidak ada aturan beku, ujian berperilaku persis seperti sebelumnya.
    assert.equal(builtinExamTypeRule(parseExamTypeCatalog(null), 'daily'), null);
    const pas = builtinExamTypeRule(catalog, 'pat');
    assert.deepEqual([pas.code, pas.label, pas.pass_rule.kkm], ['pat', 'Penilaian Akhir Semester', 70]);
    assert.equal(examTypeRule({ exam_type: 'pat', metadata: { exam_type_rule: pas } }).pass_rule.kkm, 70);
    assert.equal(builtinExamTypeRule(catalog, 'daily').score_mode, 'raw');

    const service = new ExamAdminService(null, null, null, { getExamTypeCatalog: async () => catalog });
    assert.equal((await service.resolveExamTypeRule('daily')).score_mode, 'raw');
    service.isElevated = async () => false;
    await assert.rejects(service.assertMayUseExamType({ id: 'guru' }, 'org', 'tryout'), /tidak ditampilkan/);
    await assert.rejects(service.assertMayUseExamType({ id: 'guru' }, 'org', 'pas'), /Hanya Admin/);
    await service.assertMayUseExamType({ id: 'guru' }, 'org', 'daily');
    const adminOnly = normalizeExamTypeCatalog({ types: [{ code: 'tryout', label: 'Try Out', creators: 'admin' }] });
    const gated = new ExamAdminService(null, null, null, { getExamTypeCatalog: async () => adminOnly });
    gated.isElevated = async () => false;
    await assert.rejects(gated.assertMayUseExamType({ id: 'guru' }, 'org', 'tryout'), /Hanya Admin yang dapat membuat ujian Try Out/);
    gated.isElevated = async () => true;
    await gated.assertMayUseExamType({ id: 'admin' }, 'org', 'tryout');

    const schedules = read('apps/api/src/pas/pas-schedules.service.ts');
    assert.match(schedules, /\.\.\.\(typeRule \? \{ \[EXAM_TYPE_RULE_METADATA_KEY\]: typeRule \} : \{\}\)/);
});

test('added types choose a pattern: folder and assignment map to the codes their flows use', async () => {
    const { folderExamTypeRule } = require('../src/common/exam-type-catalog.ts');
    const catalog = normalizeExamTypeCatalog({ types: [
        { code: 'ujian_pts', label: 'PTS', pattern: 'folder', creators: 'staff', pass_rule: { mode: 'kkm', kkm: 70 } },
        { label: 'Tugas Proyek', pattern: 'assignment' },
        { label: 'Kuis Bab', pattern: 'regular' },
    ] });
    const byCode = Object.fromEntries(custom(catalog).map(type => [type.code, type]));
    assert.deepEqual([byCode.ujian_pts.pattern, byCode.ujian_pts.creators], ['folder', 'admin'], 'folder selalu hanya Admin');
    assert.equal(byCode.tugas_proyek.pattern, 'assignment');

    // Tugas tambahan disimpan sebagai `assignment`, nama aslinya dibekukan di aturan.
    const proyek = examTypeRuleSnapshot(byCode.tugas_proyek);
    assert.deepEqual([proyek.code, proyek.catalog_code, proyek.label], ['assignment', 'tugas_proyek', 'Tugas Proyek']);
    assert.equal(examTypeRuleSnapshot(byCode.kuis_bab).catalog_code, undefined);

    const service = new ExamAdminService(null, null, null, { getExamTypeCatalog: async () => catalog });
    assert.equal((await service.resolveExamTypeRule('tugas_proyek')).code, 'assignment');
    await assert.rejects(service.resolveExamTypeRule('ujian_pts'), /folder ujian/);
    service.isElevated = async () => false;
    await assert.rejects(service.assertMayUseExamType({ id: 'guru' }, 'org', 'ujian_pts'), /Hanya Admin/);

    // Folder PTS: ujian folder tetap ber-kode `pas`, dengan nama dan KKM PTS.
    const pts = folderExamTypeRule(catalog, 'ujian_pts', 'pas');
    assert.deepEqual([pts.code, pts.catalog_code, pts.label, pts.pass_rule.kkm], ['pas', 'ujian_pts', 'PTS', 70]);
    assert.equal(examTypeRule({ exam_type: 'pas', metadata: { exam_type_rule: pts } }).label, 'PTS');
    assert.equal(folderExamTypeRule(catalog, null, 'pas'), null, 'folder ASAS/ASAT bawaan tanpa aturan beku');

    const source = read('apps/api/src/proctor/exam-admin.service.ts');
    assert.match(source, /const examType = examTypeRule\?\.code \?\? requestedType;/);
    assert.match(source, /existing\.metadata\?\.\[EXAM_TYPE_RULE_METADATA_KEY\]\?\.catalog_code \|\| existing\.exam_type/);
    const migration = read('database/migrations/20261115_01_exam_type_catalog_patterns.sql');
    assert.match(migration, /CHECK \(exam_type ~ '\^\[a-z\]\[a-z0-9_\]\{1,39\}\$'\)/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS catalog_type text/);
});

test('built-in types can be deleted and restored; deleted ones cannot be chosen', async () => {
    const catalog = normalizeExamTypeCatalog({ types: [{ code: 'daily', label: 'Ulangan Harian' }], removed: ['tryout', 'lainnya', 'bukan_bawaan'] });
    assert.deepEqual(catalog.removed, ['tryout', 'lainnya']);
    assert.ok(!catalog.types.some(type => type.code === 'tryout'));
    assert.ok(catalog.types.some(type => type.code === 'am'), 'yang tidak dihapus tetap diisi');
    // Dipulihkan = dikirim lagi di daftar jenis, sehingga keluar dari `removed`.
    const restored = normalizeExamTypeCatalog({ types: [{ code: 'tryout', label: 'Try Out' }], removed: ['tryout'] });
    assert.equal(restored.removed, undefined);

    const service = new ExamAdminService(null, null, null, { getExamTypeCatalog: async () => catalog });
    service.isElevated = async () => true;
    await assert.rejects(service.assertMayUseExamType({ id: 'admin' }, 'org', 'tryout'), /sudah dihapus/);
    await service.assertMayUseExamType({ id: 'admin' }, 'org', 'daily');
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
