// Run from repository root: node --test apps/api/test/exam-question-cache.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('EXAM-CACHE-01: soal beku dipakai bersama siswa dan kuncinya mengikuti revisi soal langsung', () => {
    const service = read('apps/api/src/students/exam-attempts.service.ts');
    // Muat soal awal dan check-updates sama-sama memakai cache snapshot per ujian.
    assert.match(service, /await this\.cachedFrozenQuestions\(examId, row\.question_bank_id,/);
    assert.doesNotMatch(service, /options\.cached/);
    // Revisi guru saat ujian berjalan langsung memakai entri baru, bukan menunggu TTL.
    assert.match(service, /const key = `\$\{examId\}:\$\{bankId \|\| ''\}:\$\{Number\(liveRevision\) \|\| 0\}`/);
});
