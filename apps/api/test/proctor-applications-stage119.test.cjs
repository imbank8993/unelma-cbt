const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { CommissionsService, shareFromWeighted } = require('../src/commissions/commissions.service.ts');
const { ApplyProctorDto, RejectProctorApplicationDto } = require('../src/commissions/commissions.dto.ts');
const { AuthController } = require('../src/auth/auth.controller.ts');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const USER = '44444444-4444-4444-8444-444444444444';
const ADMIN = '55555555-5555-4555-8555-555555555555';
const PROFILE = '66666666-6666-4666-8666-666666666666';
const CONFIG = { admin_share_pct: 50, proctor_share_pct: 50, token_idr_rate: 1000, min_withdrawal_tokens: 10, min_exam_token_price: 1, min_material_token_price: 1 };

function fakePrisma(handlers) {
    const calls = [];
    const run = async (sql, ...args) => {
        calls.push({ sql, args });
        for (const [re, fn] of handlers) if (re.test(sql)) return fn(args, sql);
        return [];
    };
    const prisma = { calls, $queryRawUnsafe: run, $executeRawUnsafe: async (s, ...a) => { await run(s, ...a); return 1; } };
    prisma.$transaction = async (fn) => fn(prisma);
    return prisma;
}

// ── Aturan komisi per tanggal ────────────────────────────────────────────────

test('komisi: tiap transaksi memakai aturan yang berlaku pada tanggalnya', async () => {
    assert.equal(shareFromWeighted(100 * 60 + 50 * 40), 80);
    assert.equal(shareFromWeighted('199'), 1);

    const prisma = fakePrisma([
        [/key = 'commission_config'/, () => [{ value: CONFIG }]],
        [/to_regclass/, () => [{ ok: true }]],
        [/WITH earnings AS/, () => [{ user_id: USER, gross_tokens: 150, weighted_tokens: 100 * 60 + 50 * 40, paid_tokens: 0, paid_idr: 0 }]],
        [/FROM public\.commission_rule_history h\s+LEFT JOIN/, () => [{ id: 'r1', proctor_share_pct: 40, effective_from: '2026-11-30T00:00:00+08:00' }]],
    ]);
    const summary = await new CommissionsService(prisma).getAdminSummary();
    const sql = prisma.calls.find((c) => /WITH earnings AS/.test(c.sql)).sql;
    assert.match(sql, /LEFT JOIN LATERAL[\s\S]*commission_rule_history h[\s\S]*h\.effective_from <= revenue\.created_at/);
    assert.equal(summary.proctors[0].proctor_tokens_earned, 80, '100 token @60% + 50 token @40%');
    assert.equal(summary.rule_history.length, 1);
});

test('mengubah aturan mencatat riwayat yang berlaku sejak awal hari ini (zona sekolah)', async () => {
    const prisma = fakePrisma([[/to_regclass/, () => [{ ok: true }]]]);
    const settings = { getSchoolTimeZone: async () => 'Asia/Makassar' };
    await new CommissionsService(prisma, settings).updateConfig({ ...CONFIG, admin_share_pct: 30, proctor_share_pct: 70 }, ADMIN);
    const insert = prisma.calls.find((c) => /INSERT INTO public\.commission_rule_history/.test(c.sql));
    assert.ok(insert, 'riwayat harus dicatat');
    assert.match(insert.sql, /date_trunc\('day', NOW\(\) AT TIME ZONE \$7\) AT TIME ZONE \$7/);
    assert.equal(insert.args[1], 70);
    assert.equal(insert.args[6], 'Asia/Makassar');
    assert.equal(insert.args[7], ADMIN);

    const legacy = fakePrisma([[/to_regclass/, () => [{ ok: false }]]]);
    await new CommissionsService(legacy).updateConfig(CONFIG, ADMIN);
    assert.equal(legacy.calls.some((c) => /commission_rule_history/.test(c.sql) && /INSERT/.test(c.sql)), false, 'tanpa migrasi tetap bisa menyimpan');
});

// ── Pengajuan Proktor ────────────────────────────────────────────────────────

const validApplication = {
    full_name: 'Andi', nik: '7371000000000001', whatsapp: '081234567890', expertise: 'Matematika SMA',
    motivation: 'Saya sudah lima tahun menyusun soal olimpiade matematika.', bank1_name: 'BSI',
    bank1_account_name: 'Andi', bank1_account_number: '1234567890',
};

test('validasi formulir pengajuan Proktor', async () => {
    assert.deepEqual(await validate(plainToInstance(ApplyProctorDto, validApplication)), []);
    const bad = await validate(plainToInstance(ApplyProctorDto, { ...validApplication, motivation: 'singkat', nik: '1' }));
    assert.deepEqual(bad.map((e) => e.property).sort(), ['motivation', 'nik']);
    assert.ok((await validate(plainToInstance(RejectProctorApplicationDto, { reason: 'x' }))).length > 0);
});

test('pengajuan memakai email akun Google; Proktor/Admin tidak bisa mengajukan', async () => {
    const prisma = fakePrisma([[/INSERT INTO public\.proctor_profiles/, () => [{ id: PROFILE, status: 'pending' }]]]);
    const service = new CommissionsService(prisma);
    await assert.rejects(service.applyAsProctor({ id: USER, email: 'a@gmail.com', roles: ['PROKTOR'] }, validApplication), /sudah berperan Proktor/);
    const res = await service.applyAsProctor({ id: USER, email: 'Andi@Gmail.com', roles: ['SISWA'] }, { ...validApplication, email: 'palsu@x.id' });
    assert.equal(res.application.status, 'pending');
    const insert = prisma.calls.find((c) => /INSERT INTO public\.proctor_profiles/.test(c.sql));
    assert.equal(insert.args[4], 'andi@gmail.com');
    assert.match(insert.sql, /status = 'pending'/);
});

test('menyetujui pengajuan memberi peran Proktor menggantikan Siswa; menolak butuh status menunggu', async () => {
    const prisma = fakePrisma([
        [/FROM public\.proctor_profiles WHERE id = \$1::uuid FOR UPDATE/, () => [{ id: PROFILE, user_id: USER, status: 'pending' }]],
        [/FROM public\.cbt_organization_members WHERE user_id/, () => [{ id: 'member-1' }]],
        [/FROM public\.cbt_roles WHERE lower\(name\) = 'proktor'/, () => [{ id: 'role-proktor' }]],
        [/UPDATE public\.proctor_profiles\s+SET status = 'approved'/, () => [{ id: PROFILE, status: 'approved' }]],
    ]);
    const res = await new CommissionsService(prisma).approveApplication({ id: ADMIN }, PROFILE);
    assert.equal(res.application.status, 'approved');
    const sqls = prisma.calls.map((c) => c.sql).join('\n');
    assert.match(sqls, /lower\(r\.name\) = 'siswa'/);
    assert.match(sqls, /INSERT INTO public\.cbt_member_roles/);

    const done = fakePrisma([[/FOR UPDATE/, () => [{ id: PROFILE, user_id: USER, status: 'approved' }]]]);
    await assert.rejects(new CommissionsService(done).approveApplication({ id: ADMIN }, PROFILE), /berstatus menunggu/);
    await assert.rejects(new CommissionsService(fakePrisma([])).rejectApplication({ id: ADMIN }, PROFILE, 'NIK salah'), /sudah diproses/);
});

// ── Google-only & tanpa Guru ─────────────────────────────────────────────────

test('login password & SSO ACCA New dimatikan; daftar & tambah pengguna hanya Google', async () => {
    const previous = { p: process.env.PASSWORD_LOGIN_ENABLED, s: process.env.ACCA_SSO_ENABLED };
    delete process.env.PASSWORD_LOGIN_ENABLED;
    delete process.env.ACCA_SSO_ENABLED;
    try {
        let called = false;
        const controller = new AuthController({ login: async () => { called = true; }, exchangeSsoTicket: async () => { called = true; } });
        await assert.rejects(controller.login({ email: 'a@b.c', password: 'x' }, { headers: {} }), /tombol Google/);
        assert.throws(() => controller.sso({ token: 't' }, { headers: {} }), /tombol Google/);
        assert.equal(called, false);
    } finally {
        if (previous.p !== undefined) process.env.PASSWORD_LOGIN_ENABLED = previous.p;
        if (previous.s !== undefined) process.env.ACCA_SSO_ENABLED = previous.s;
    }
    const service = read('../src/auth/auth.service.ts');
    assert.match(service.slice(service.indexOf('async signup(')), /if \(!dto\.credential\) \{\s*throw new BadRequestException\('Pendaftaran hanya dapat dilakukan dengan akun Google\.'\)/);
    const login = read('../../web/app/login/page.tsx');
    assert.doesNotMatch(login, /handlePasswordLogin|\/api\/auth\/login/);
    assert.doesNotMatch(read('../../web/app/api/auth/logout/route.ts'), /NEXT_PUBLIC_ACCA_URL/);
});

test('peran Guru dihapus: bahan ajar dikelola Proktor/Admin, halaman lama milik Proktor', () => {
    const learning = read('../src/learning/learning.service.ts');
    assert.doesNotMatch(learning, /'Guru'/);
    assert.match(learning, /\['Proktor', 'Admin'\], 'Proktor\/Admin'/);
    assert.match(read('../../web/lib/rbac.ts'), /prefix: '\/dashboard\/guru', role: 'Proktor'/);
    const migration = read('../../../database/migrations/20261111_04_google_only_proctor_applications.sql');
    assert.match(migration, /DELETE FROM public\.cbt_member_roles WHERE role_id = ANY \(guru_ids\)/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.commission_rule_history/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS submitted_at timestamptz/);
    const sidebar = read('../../web/app/components/Sidebar.tsx');
    assert.match(sidebar, /\/dashboard\/admin\/proctor-requests/);
    assert.match(sidebar, /\/dashboard\/siswa\/ajukan-proktor/);
});
