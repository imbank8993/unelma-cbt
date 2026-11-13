// Run from repository root: node --test apps/api/test/proctor-creation-limits.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const { fixtureDb } = require('./fixture-db.cjs');
const {
    assertFreeQuotaAvailable, assertMayCreate, isAdminUser, loadCreationLimits,
} = require('../src/common/creation-limits.ts');

const read = rel => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', rel), 'utf8');
const proktor = { id: 'p1', roles: ['PROKTOR'] };
const admin = { id: 'a1', roles: ['ADMIN'] };

function db({ profile, exams = [], materials = [] } = {}) {
    return fixtureDb({
        proctor_profiles: profile ? [{ user_id: 'p1', ...profile }] : [],
        cbt_exams: exams.map((exam, index) => ({ id: `e${index}`, created_by: 'p1', status: 'draft', metadata: {}, ...exam })),
        cbt_learning_materials: materials.map((row, index) => ({ id: `m${index}`, created_by: 'p1', status: 'published', ...row })),
    });
}

test('free usage counts only free, non-archived, non-folder exams and published free materials', async () => {
    const limits = await loadCreationLimits(db({
        profile: { can_create_exams: true, can_create_materials: false, free_exam_quota: 3, free_material_quota: null },
        exams: [
            {}, { is_paid: true, token_price: 5 }, { is_paid: true, token_price: 0 },
            { status: 'archived' }, { metadata: { is_pas_exam: true } },
        ],
        materials: [{}, { status: 'draft' }, { is_paid: true, token_price: 2 }],
    }), proktor);
    assert.deepEqual(limits.freeExam, { quota: 3, used: 2, remaining: 1 }, 'berbayar Rp0 dihitung gratis');
    assert.deepEqual(limits.freeMaterial, { quota: null, used: 1, remaining: null });
    assert.equal(limits.canCreateExams, true);
    assert.equal(limits.canCreateMaterials, false);
    assert.equal(limits.unlimited, false);
});

test('no profile or no quota keeps the previous unlimited behaviour; admins are never limited', async () => {
    const none = await loadCreationLimits(db({ exams: [{}, {}] }), proktor);
    assert.equal(none.canCreateExams, true);
    assert.equal(none.freeExam.remaining, null);
    assert.ok(isAdminUser(admin) && isAdminUser({ id: 'x', roles: [], isPlatformAdmin: true }) && !isAdminUser(proktor));
    const blocked = db({ profile: { can_create_exams: false, free_exam_quota: 0 } });
    await assertMayCreate(blocked, admin, 'exam');
    await assertFreeQuotaAvailable(blocked, admin, 'exam');
    assert.equal((await loadCreationLimits(blocked, admin)).unlimited, true);
});

test('disabled access blocks creating; an exhausted quota blocks only free content', async () => {
    await assert.rejects(assertMayCreate(db({ profile: { can_create_exams: false } }), proktor, 'exam'), /membuat ujian Anda sedang dinonaktifkan/);
    await assert.rejects(assertMayCreate(db({ profile: { can_create_materials: false } }), proktor, 'material'), /menerbitkan bahan ajar/);

    const full = db({ profile: { free_exam_quota: 2 }, exams: [{}, {}] });
    await assert.rejects(assertFreeQuotaAvailable(full, proktor, 'exam'), /Kuota ujian gratis Anda sudah habis \(2\/2\)/);
    // Item yang sedang disunting tidak dihitung dua kali.
    await assertFreeQuotaAvailable(full, proktor, 'exam', 'e1');
    await assertFreeQuotaAvailable(db({ profile: { free_exam_quota: 3 }, exams: [{}, {}] }), proktor, 'exam');
    await assert.rejects(assertFreeQuotaAvailable(db({ profile: { free_material_quota: 0 } }), proktor, 'material'), /bahan ajar gratis/);
});

test('exam and material flows enforce access and quota; admin page and proctor UI are wired', () => {
    const exams = read('apps/api/src/proctor/exam-admin.service.ts');
    assert.match(exams, /await assertMayCreate\(this\.db, user, 'exam'\);/);
    assert.match(exams, /\} else \{\s*await assertFreeQuotaAvailable\(this\.db, user, 'exam'\);/);
    assert.match(exams, /if \(!nextPaid && existing\.is_paid && Number\(existing\.token_price \?\? 0\) > 0\) \{\s*await assertFreeQuotaAvailable\(db, user, 'exam', examId\);/);
    const learning = read('apps/api/src/learning/learning.service.ts');
    assert.match(learning, /await this\.manager\(user, org\);\s*await assertMayCreate\(this\.db, user, 'material'\);/);
    assert.match(learning, /await this\.assertPublishAllowed\(user, row, dto\.status, nextPaid && nextPrice > 0\);/);
    assert.match(read('apps/api/src/commissions/commissions.controller.ts'), /@Get\('proctor\/limits'\)/);
    assert.match(read('database/migrations/20261116_01_proctor_free_quota.sql'), /ADD COLUMN IF NOT EXISTS free_exam_quota integer/);

    assert.match(read('apps/web/app/dashboard/proktor/exams/page.tsx'), /\{canCreateExam && <FilterActions>/);
    const modal = read('apps/web/components/exams/CreateExamModal.tsx');
    assert.match(modal, /isPaid: effectivePaid,/);
    assert.match(modal, /disabled=\{paidForced\}/);
    const editor = read('apps/web/app/dashboard/learning/[id]/edit/page.tsx');
    assert.match(editor, /\(material\.status === 'published' \|\| canPublish\) && <button className="learn-primary"/);
    assert.match(read('apps/web/app/dashboard/admin/commissions/page.tsx'), /free_exam_quota: examQuota, free_material_quota: materialQuota/);
});
