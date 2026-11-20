const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { LearningGoalsService } = require('../src/students/learning-goals.service.ts');
const { LearningGoalDto } = require('../src/students/dto/students.dto.ts');
const { LEARNING_GRADE_LEVELS } = require('../src/learning/learning.dto.ts');

const USER = { id: '44444444-4444-4444-8444-444444444444', roles: ['Siswa'] };
const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

/** Adapter tiruan: mencatat query dan mengembalikan hasil yang disiapkan. */
function fakeDb({ row = null, error = null, upsertError = null } = {}) {
    const calls = [];
    const chain = (table) => {
        const query = { table, filters: [] };
        const api = {
            select: (cols) => { query.select = cols; return api; },
            eq: (col, val) => { query.filters.push([col, val]); return api; },
            maybeSingle: async () => { calls.push(query); return { data: row, error }; },
            upsert: async (payload, options) => { calls.push({ table, upsert: payload, options }); return { error: upsertError }; },
        };
        return api;
    };
    return { calls, from: chain };
}

test('DTO tujuan belajar hanya menerima kode program yang valid, target pendek, dan tanggal YYYY-MM-DD', async () => {
    const ok = plainToInstance(LearningGoalDto, { programs: ['cpns', 'pppk'], target: 'Lolos SKD', targetDate: '2027-10-01' });
    assert.deepEqual(await validate(ok), []);
    assert.deepEqual(await validate(plainToInstance(LearningGoalDto, { programs: ['olimpiade_sains'] })), [], 'program tambahan dari Pengaturan Daftar');
    const bad = plainToInstance(LearningGoalDto, { programs: ['Bukan Kode!'], target: 'x'.repeat(121), targetDate: '01-10-2027' });
    assert.deepEqual((await validate(bad)).map(e => e.property).sort(), ['programs', 'target', 'targetDate']);
    assert.ok((await validate(plainToInstance(LearningGoalDto, { programs: [] }))).length > 0, 'minimal satu program');
});

test('tujuan dibaca dan disimpan hanya untuk pemegang token, tanpa duplikat program', async () => {
    const db = fakeDb({ row: { programs: ['cpns'], target: 'Lolos SKD', target_date: new Date('2027-10-01T00:00:00Z') } });
    const service = new LearningGoalsService(db);
    assert.deepEqual(await service.get(USER), { goal: { programs: ['cpns'], target: 'Lolos SKD', targetDate: '2027-10-01' }, stored: true });
    assert.deepEqual(db.calls[0].filters, [['user_id', USER.id]]);

    const saved = await service.save(USER, { programs: ['cpns', 'cpns', 'utbk'], target: '  Lolos  ', targetDate: '2027-10-01' });
    assert.deepEqual(saved.goal.programs, ['cpns', 'utbk']);
    const write = db.calls[1];
    assert.equal(write.table, 'cbt_learning_goals');
    assert.equal(write.upsert.user_id, USER.id);
    assert.equal(write.upsert.target, 'Lolos');
    assert.deepEqual(write.options, { onConflict: 'user_id' });
});

test('sebelum migrasi dijalankan: baca jatuh ke cadangan perangkat, simpan memberi pesan jelas', async () => {
    const missing = { message: 'relation "public.cbt_learning_goals" does not exist' };
    const service = new LearningGoalsService(fakeDb({ error: missing, upsertError: missing }));
    assert.deepEqual(await service.get(USER), { goal: null, stored: false });
    await assert.rejects(service.save(USER, { programs: ['cpns'] }), /belum diaktifkan/);
    await assert.rejects(new LearningGoalsService(fakeDb({ error: { message: 'timeout' } })).get(USER), /belum dapat dimuat/);
});

test('migrasi, rute proxy, dan katalog bahan ajar selaras dengan program tujuan', () => {
    const migration = read('../../../database/migrations/20261112_01_learning_goals.sql');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.cbt_learning_goals/);
    for (const program of ['sekolah', 'utbk', 'cpns', 'pppk', 'kedinasan', 'bahasa', 'umum']) assert.match(migration, new RegExp(`'${program}'`));
    const route = read('../../web/app/api/students/learning-goal/route.ts');
    assert.match(route, /proxyGet\(request, '\/students\/learning-goal'\)/);
    assert.match(route, /proxyJson\(request, '\/students\/learning-goal', 'PUT'\)/);
    for (const level of ['utbk', 'cpns', 'pppk', 'kedinasan', 'bahasa', '10']) assert.ok(LEARNING_GRADE_LEVELS.includes(level), level);
    const dashboard = read('../../web/app/dashboard/siswa/page.tsx');
    assert.match(dashboard, /loadLearningGoal\(user\.id\)/);
    assert.match(dashboard, /saveLearningGoal\(userId, next\)/);
});

test('program ujian: DTO menerima program yang dikenal (termasuk SNPDB) dan siswa menerimanya lewat metadata', async () => {
    const { CreateExamDto } = require('../src/proctor/dto/proctor.dto.ts');
    const { studentExamMetadata } = require('../src/students/student-exam-metadata.ts');
    const base = { title: 'Tryout SNPDB #1', duration: 60 };
    const errorsFor = async (program) => (await validate(plainToInstance(CreateExamDto, { ...base, program }))).map(e => e.property);
    assert.ok(!(await errorsFor('snpdb')).includes('program'));
    assert.ok(!(await errorsFor('utbk')).includes('program'));
    assert.ok(!(await errorsFor('olimpiade_sains')).includes('program'), 'program tambahan dari Pengaturan Daftar');
    assert.ok((await errorsFor('ujian-bebas')).includes('program'));
    assert.ok((await errorsFor('10')).includes('program'));
    assert.deepEqual(studentExamMetadata({ is_public: true, program: 'snpdb', answer_keys: 'rahasia' }), { is_public: true, program: 'snpdb' });

    const ok = plainToInstance(LearningGoalDto, { programs: ['snpdb', 'utbk'] });
    assert.deepEqual(await validate(ok), []);
    const migration = read('../../../database/migrations/20261119_01_learning_program_catalog.sql');
    assert.match(migration, /cardinality\(programs\) BETWEEN 1 AND 40/);
    assert.match(migration, /\[a-z\]\[a-z0-9_\]\{1,31\}/);
});

test('jadwal siswa: ujian wajib selalu tampil, tryout pilihan disaring sesuai tujuan belajar', () => {
    const schedule = read('../../web/app/dashboard/siswa/schedule/page.tsx');
    assert.match(schedule, /const isRequired = \(exam: StudentScheduledExam\) => exam\.metadata\?\.is_public !== true;/);
    assert.match(schedule, /programsOf\(exam\)\.some\(program => program === 'umum' \|\| goalPrograms\.includes\(program\)\)/);
    assert.match(schedule, /if \(programFilter === 'untukmu'\) return inGoals\(exam\);/);
    assert.match(schedule, /Wajib dari sekolah \/ kelas/);
    const dashboard = read('../../web/app/dashboard/siswa/page.tsx');
    assert.match(dashboard, /if \(exam\.metadata\?\.is_public !== true \|\| !examGoals\.length\) return true;/);
    const modal = read('../../web/components/exams/CreateExamModal.tsx');
    assert.match(modal, /programs: formData\.programs\.length \? formData\.programs : \['umum'\],/);
});

test('Pengaturan Daftar: katalog program divalidasi, program struktural selalu ada, label bahan ajar menerima kode baru', async () => {
    const { normalizeLearningProgramCatalog, parseLearningProgramCatalog, DEFAULT_LEARNING_PROGRAM_CATALOG, LEARNING_GRADE_LEVEL_PATTERN } = require('../src/common/learning-programs.ts');
    const catalog = normalizeLearningProgramCatalog({ programs: [{ code: 'utbk', label: '  UTBK  SNBT ', hint: 'TPS', icon: 'target', hue: 999 }, { code: 'olimpiade', label: 'Olimpiade', icon: 'bom', active: false }] });
    assert.deepEqual(catalog.programs.map(p => p.code), ['utbk', 'olimpiade', 'sekolah', 'umum']);
    assert.equal(catalog.programs[0].label, 'UTBK SNBT');
    assert.equal(catalog.programs[0].hue, 359);
    assert.equal(catalog.programs[1].icon, 'sparkles');
    assert.equal(catalog.programs[1].active, false);
    assert.throws(() => normalizeLearningProgramCatalog({ programs: [{ code: '10', label: 'X' }] }), /tidak valid/);
    assert.throws(() => normalizeLearningProgramCatalog({ programs: [{ code: 'cpns', label: 'A' }, { code: 'cpns', label: 'B' }] }), /lebih dari sekali/);
    assert.throws(() => normalizeLearningProgramCatalog({ programs: [{ code: 'cpns', label: ' ' }] }), /wajib diisi/);
    assert.equal(parseLearningProgramCatalog(null), DEFAULT_LEARNING_PROGRAM_CATALOG);
    for (const level of ['', '1', '12', 'utbk', 'olimpiade_sains']) assert.match(level, LEARNING_GRADE_LEVEL_PATTERN, level);
    for (const level of ['0', '13', 'UTBK', 'a']) assert.doesNotMatch(level, LEARNING_GRADE_LEVEL_PATTERN, level);
    const settings = read('../src/settings/settings.service.ts');
    assert.match(settings, /LEARNING_PROGRAM_CATALOG_SETTING_KEY\) value = normalizeLearningProgramCatalog\(value\)/);
});

test('label program ujian bisa lebih dari satu: DTO, metadata, dan cadangan ujian lama', async () => {
    const { CreateExamDto } = require('../src/proctor/dto/proctor.dto.ts');
    const { examProgramsFromDto, examProgramMetadata } = require('../src/common/learning-programs.ts');
    const errorsFor = async (programs) => (await validate(plainToInstance(CreateExamDto, { title: 'Tryout', duration: 60, programs }))).map(e => e.property);
    assert.ok(!(await errorsFor(['utbk', 'snpdb'])).includes('programs'));
    assert.ok((await errorsFor(['utbk', 'Bukan Kode'])).includes('programs'));
    assert.ok((await errorsFor(Array.from({ length: 11 }, (_, i) => `p${i}x`))).includes('programs'));

    assert.deepEqual(examProgramMetadata(examProgramsFromDto({ programs: ['utbk', 'snpdb', 'utbk'] }, {})), { program: 'utbk', programs: ['utbk', 'snpdb'] });
    assert.deepEqual(examProgramMetadata(examProgramsFromDto({ program: 'cpns' }, { programs: ['utbk'] })), { program: 'cpns', programs: ['cpns'] });
    assert.deepEqual(examProgramMetadata(examProgramsFromDto({}, { program: 'utbk' })), { program: 'utbk', programs: ['utbk'] }, 'ujian lama dengan satu label');
    assert.deepEqual(examProgramMetadata(examProgramsFromDto({}, { programs: ['utbk', 'cpns'] })), { program: 'utbk', programs: ['utbk', 'cpns'] });
    assert.deepEqual(examProgramMetadata(examProgramsFromDto({ programs: [] }, {})), { program: 'umum', programs: ['umum'] });
    assert.deepEqual(examProgramMetadata(examProgramsFromDto({}, {})), {}, 'ujian tanpa label tetap tanpa label');

    const { studentExamMetadata } = require('../src/students/student-exam-metadata.ts');
    assert.deepEqual(studentExamMetadata({ is_public: true, program: 'utbk', programs: ['utbk', 'snpdb'] }), { is_public: true, program: 'utbk', programs: ['utbk', 'snpdb'] });
    const service = read('../src/proctor/exam-admin.service.ts');
    assert.match(service, /examProgramMetadata\(examProgramsFromDto\(dto, existing\)\)/);
});
