const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const { ForbiddenException } = require('@nestjs/common');
const { isPaidItemLocked } = require('../src/common/paid-content.ts');
const { LearningService } = require('../src/learning/learning.service.ts');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const ORG = 'org-1';
const MATERIAL = '33333333-3333-4333-8333-333333333333';

/** DB palsu: setiap tabel mengembalikan baris tetap untuk rantai select/eq/maybeSingle. */
function fakeDb(tables) {
    return {
        from(table) {
            const chain = {
                select() { return chain; }, eq() { return chain; }, in() { return chain; }, order() { return chain; },
                async maybeSingle() { return { data: tables[table] ?? null, error: null }; },
            };
            return chain;
        },
    };
}

function learningFixture({ unlocked, roles = ['Siswa'], paid = true }) {
    const row = {
        id: MATERIAL, organization_id: ORG, created_by: 'guru-1', title: 'Materi Premium', description: '',
        status: 'published', format: 'html', content_html: '<p>RAHASIA</p>', conversion_notes: 'catatan',
        file_key: 'materials/a.pdf', rendered_pdf_key: null, is_paid: paid, token_price: 5, content_version: 1, revision: 1,
    };
    const db = fakeDb({ cbt_learning_materials: row, cbt_learning_progress: null, unlocked_items: unlocked ? { id: 'u-1' } : null });
    const authz = {
        async assertOrgRole(_user, _org, allowed) {
            if (!allowed.some((role) => roles.includes(role))) throw new ForbiddenException('bukan');
        },
    };
    const storage = { async getObject() { return { body: 'PDF' }; } };
    return new LearningService(db, authz, storage, {});
}

test('isPaidItemLocked: gratis tidak terkunci, berbayar terkunci sampai dibuka', async () => {
    assert.equal(await isPaidItemLocked(fakeDb({}), 'u', 'exam', { id: 'e', is_paid: false, token_price: 5 }), false);
    assert.equal(await isPaidItemLocked(fakeDb({}), 'u', 'exam', { id: 'e', is_paid: true, token_price: 0 }), false);
    assert.equal(await isPaidItemLocked(fakeDb({ unlocked_items: null }), 'u', 'exam', { id: 'e', is_paid: true, token_price: 5 }), true);
    assert.equal(await isPaidItemLocked(fakeDb({ unlocked_items: { id: 'x' } }), 'u', 'exam', { id: 'e', is_paid: true, token_price: '5' }), false);
});

test('bahan ajar berbayar: isi, lampiran, dan progres ditahan server sampai dibuka', async () => {
    const student = { id: 'siswa-1' };
    const locked = learningFixture({ unlocked: false });
    const detail = await locked.detail(student, ORG, MATERIAL);
    assert.equal(detail.material.locked, true);
    assert.equal(detail.material.content_html, '');
    assert.equal(detail.material.hasFile, false);
    assert.doesNotMatch(JSON.stringify(detail), /RAHASIA/);
    await assert.rejects(locked.file(student, ORG, MATERIAL), /berbayar/);
    await assert.rejects(locked.activity(student, ORG, MATERIAL), /berbayar/);

    const opened = await learningFixture({ unlocked: true }).detail(student, ORG, MATERIAL);
    assert.equal(opened.material.locked, false);
    assert.match(opened.material.content_html, /RAHASIA/);

    const teacher = await learningFixture({ unlocked: false, roles: ['Proktor'] }).detail({ id: 'proktor-lain' }, ORG, MATERIAL);
    assert.equal(teacher.material.locked, false);
    const free = await learningFixture({ unlocked: false, paid: false }).detail(student, ORG, MATERIAL);
    assert.equal(free.material.locked, false);
});

test('ujian berbayar: server menolak memulai sebelum dibuka; UI tertutup secara default', () => {
    const attempts = read('../src/students/exam-attempts.service.ts');
    const start = attempts.slice(attempts.indexOf('async start(user: AuthUser'), attempts.indexOf('const recoveryUntil = this.proctorRecoveryUntil(existing as any);'));
    assert.match(start, /is_paid, token_price/);
    assert.match(start, /if \(!existing && await isPaidItemLocked\(this\.db, user\.id, 'exam'/);
    // Soal hanya keluar untuk pengerjaan aktif, jadi menahan "mulai" menutup aksesnya.
    assert.match(attempts, /Soal hanya tersedia selama sesi pengerjaan aktif/);

    const prep = read('../../web/app/components/questions/ExamStartPreparation.tsx');
    assert.match(prep, /useState\(!isPaidExam\)/);
    assert.match(prep, /setHasAccess\(false\);\s*setUnlockError/);

    const reader = read('../../web/app/dashboard/learning/[id]/page.tsx');
    assert.match(reader, /material\.locked \? ':locked' : ''/);
    assert.match(reader, /load\(material\.id, true\)/);
});

test('ujian ASAS/ASAT/AM tidak boleh berbayar', () => {
    const exam = read('../src/proctor/exam-admin.service.ts');
    assert.match(exam, /private assertPaidAllowedForType\(examType: string\)/);
    assert.match(exam, /if \(dto\.isPaid\) \{\s*this\.assertPaidAllowedForType\(examType\);/);
    assert.match(exam, /if \(nextPaid\) this\.assertPaidAllowedForType\(examType\);/);
});
