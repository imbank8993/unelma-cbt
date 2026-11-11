// Stage 120 — Proktor adalah pembuat konten (disetujui lewat pengajuan), bukan staf
// sekolah. Ia hanya mengelola konten, kelas, dan peserta MILIKNYA sendiri; urusan
// sekolah (ASAS/ASAT/AM, backup, tahun ajaran, kelas utama, daftar seluruh siswa,
// riwayat login, konfigurasi ujian sekolah, pengaturan) khusus Admin.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { fixtureDb } = require('./fixture-db.cjs');
const { AuthorizationService } = require('../src/auth/authorization.service.ts');
const { ProctorService } = require('../src/proctor/proctor.service.ts');
const { TeachersService } = require('../src/teachers/teachers.service.ts');
const { ExamConfigsService } = require('../src/exam-configs/exam-configs.service.ts');
const { BackupService } = require('../src/backup/backup.service.ts');
const { BackupController } = require('../src/backup/backup.controller.ts');
const { SettingsController } = require('../src/settings/settings.controller.ts');
const { PasController } = require('../src/pas/pas.controller.ts');
const { PasService } = require('../src/pas/pas.service.ts');
const { ClassesService } = require('../src/proctor/classes.service.ts');

const read = rel => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const forbidden = error => error.getStatus?.() === 403;
const ROLE = { proctor: 'Proktor', admin: 'Admin', student: 'Siswa' };
const user = id => ({ id, organizationId: 'school', roles: [String(ROLE[id] || '').toUpperCase()] });

function setup() {
    const db = fixtureDb({
        cbt_organization_members: [{ user_id: 'proctor', organization_id: 'school', profiles: { full_name: 'Proktor', identity_number: '1' },
            member_roles: [{ roles: { name: 'Proktor' } }] }],
    });
    const roles = { hasOrgRole: async (id, org, allowed) => org === 'school' && allowed.includes(ROLE[id]) };
    const auth = new AuthorizationService(db, roles, { assertSchoolId: async id => id });
    return { db, roles, auth };
}

test('assertProktor is now the school-level (Admin-only) gate', async () => {
    const { auth } = setup();
    await auth.assertProktor(user('admin'), 'school');
    for (const id of ['proctor', 'student']) await assert.rejects(auth.assertProktor(user(id), 'school'), forbidden);
    assert.equal(await auth.isSchoolAdmin(user('admin'), 'school'), true);
    assert.equal(await auth.isSchoolAdmin(user('proctor'), 'school'), false);
    assert.equal(await auth.isSchoolAdmin({ id: 'root', isPlatformAdmin: true }, 'school'), true);
});

test('school-wide data and operations reject a proctor before touching the database', async () => {
    const { db, auth, roles } = setup();
    const proctor = user('proctor');
    const school = { getSchool: async () => ({ id: 'school' }) };
    const calls = [
        () => new ProctorService(db, auth, {}, {}).getRecentLogins(proctor, 'school', 10),
        () => new ProctorService(db, auth, {}, {}).createSchoolYear(proctor, 'school', { year: '2026/2027', clientRequestId: 'x' }),
        () => new TeachersService(db, auth, {}, {}).listStudents(proctor, 'school'),
        () => new ExamConfigsService(db, auth).list(proctor, 'school'),
        () => new BackupService(db, auth, {}, school).export(proctor),
        () => new BackupService(db, auth, {}, school).authorizeImport(proctor),
        () => new PasService(db, auth).listPeriods(proctor, 'school'),
        () => new PasService(db, auth).listClasses(proctor, 'school', true),
        () => new ClassesService(db, auth, roles).create(proctor, 'school', { name: 'X IPA 1', type: 'reguler', clientRequestId: 'x' }),
    ];
    for (const call of calls) await assert.rejects(call, forbidden);
    assert.equal(db.writes.length, 0);
    assert.equal(db.queries.length, 0);
});

test('proctors can still list school staff to choose validators for their own banks', async () => {
    const { db, auth } = setup();
    const staff = await new PasService(db, auth).listStaff(user('proctor'), 'school');
    assert.deepEqual(staff.map(member => member.id), ['proctor']);
    await assert.rejects(new PasService(db, auth).listStaff(user('student'), 'school'), forbidden);
});

test('proctors manage only their own non-semester exams; ASAS/ASAT/AM belongs to Admin', async () => {
    const { auth } = setup();
    const exam = (created_by, exam_type) => ({ id: 'e', organization_id: 'school', created_by, exam_type });
    assert.equal(await auth.canManageExam(user('proctor'), exam('proctor', 'daily')), true);
    assert.equal(await auth.canManageExam(user('proctor'), exam('someone-else', 'daily')), false);
    for (const type of ['pas', 'pat', 'am']) {
        assert.equal(await auth.canManageExam(user('proctor'), exam('proctor', type)), false);
        assert.equal(await auth.canManageExam(user('admin'), exam('someone-else', type)), true);
    }
});

test('controller role metadata keeps school operations Admin-only', () => {
    assert.deepEqual(Reflect.getMetadata('roles', BackupController), ['ADMIN']);
    assert.deepEqual(Reflect.getMetadata('roles', SettingsController.prototype.upsert), ['ADMIN']);
    for (const method of ['updatePeriod', 'updateExamSettings', 'updateCommitteeChair', 'mergeExams']) {
        assert.deepEqual(Reflect.getMetadata('roles', PasController.prototype[method]), ['ADMIN'], method);
    }
});

test('web: proctor screens no longer load school data or offer ASAS/AM', () => {
    const dashboard = read('../../web/app/dashboard/proktor/page.tsx');
    assert.doesNotMatch(dashboard, /getRecentLogins|RecentLoginsCard/);
    assert.equal(fs.existsSync(path.resolve(__dirname, '../../web/app/dashboard/proktor/backup/page.tsx')), false);
    assert.match(read('../../web/app/dashboard/guru/page.tsx'), /redirect\('\/dashboard\/proktor'\)/);
    const exams = read('../../web/app/dashboard/proktor/exams/page.tsx');
    assert.doesNotMatch(exams, /listPASPeriods\(\)|value: 'asas_asat'/);
    assert.match(read('../../web/components/exams/CreateExamModal.tsx'), /role === 'guru' \|\| role === 'proktor'/);
    const mobile = read('../../web/app/components/MobileNav.tsx');
    assert.doesNotMatch(mobile, /\/dashboard\/proktor\/settings/);
});
