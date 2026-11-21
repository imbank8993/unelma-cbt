const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const catalog = require('../../web/lib/learning-catalog.ts');
const { normalizeLearningGoal } = require('../../web/lib/learning-goal.ts');
const { normalizeLearningProgramCatalog, LEARNING_PROGRAM_CODE_PATTERN } = require('../src/common/learning-programs.ts');

test('program "sekolah" tampil sebagai jenjang SD, SMP, SMA, bukan satu kategori', () => {
    const shown = catalog.learningPrograms.map(item => item.value);
    assert.ok(!shown.includes('sekolah'));
    assert.deepEqual(shown.slice(0, 3), ['sd', 'smp', 'sma']);
    assert.deepEqual(catalog.learningPrograms.slice(0, 3).map(item => item.label), ['SD', 'SMP', 'SMA']);
    for (const code of catalog.SCHOOL_STAGE_CODES) assert.match(code, LEARNING_PROGRAM_CODE_PATTERN);
});

test('bahan ajar dipetakan ke jenjang dari kelas tersimpan tanpa migrasi', () => {
    assert.deepEqual(['1', '6', '7', '9', '10', '12'].map(catalog.learningProgramOf), ['sd', 'sd', 'smp', 'smp', 'sma', 'sma']);
    assert.equal(catalog.learningProgramOf(''), 'umum');
    assert.equal(catalog.learningProgramOf('utbk'), 'utbk');
    assert.equal(catalog.learningGradeHeading('10'), 'SMA · Kelas X');
    assert.ok(catalog.learningGradeOptions.some(item => item.value === '7' && item.label === 'SMP · Kelas VII'));
});

test('label ujian dan tujuan belajar lama "sekolah" dibaca sebagai SD, SMP, SMA', () => {
    assert.deepEqual(catalog.examProgramsOf({ programs: ['sekolah', 'utbk'] }), ['sd', 'smp', 'sma', 'utbk']);
    assert.deepEqual(catalog.examProgramsOf({ program: 'sekolah' }), ['sd', 'smp', 'sma']);
    assert.deepEqual(catalog.examProgramsOf({ programs: ['smp'] }), ['smp']);
    assert.deepEqual(normalizeLearningGoal({ programs: ['sekolah', 'sma'] }).programs, ['sd', 'smp', 'sma']);
    assert.equal(catalog.learningProgramLabel('sma'), 'SMA');
});

test('kode jenjang dicadangkan: Admin tidak bisa membuat program "sd", "smp", atau "sma"', () => {
    for (const code of ['sd', 'smp', 'sma']) {
        assert.throws(() => normalizeLearningProgramCatalog({ programs: [{ code, label: code.toUpperCase() }] }), /jenjang SD\/SMP\/SMA/);
    }
    const web = catalog.normalizeLearningProgramCatalog({ programs: [{ code: 'sd', label: 'SD lama' }, { code: 'utbk', label: 'UTBK' }] });
    assert.deepEqual(web.map(item => item.value), ['utbk', 'sekolah', 'umum']);
});
