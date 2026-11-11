const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const jose = require('jose');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { verifyGoogleIdToken, setGoogleJwksForTest } = require('../src/auth/google-id-token.ts');
const { CommissionsService, normalizeProofUrl } = require('../src/commissions/commissions.service.ts');
const { ProcessPayoutDto, RegisterProctorDto } = require('../src/commissions/commissions.dto.ts');
const { assertPaidContentAllowed } = require('../src/common/paid-content.ts');
const { AdminCreateUserDto, AdminUpdateRoleDto } = require('../src/auth/dto/admin-users.dto.ts');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

// ── Login Google ─────────────────────────────────────────────────────────────

async function googleKeys() {
    const { publicKey, privateKey } = await jose.generateKeyPair('RS256');
    const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
    setGoogleJwksForTest(jose.createLocalJWKSet({ keys: [jwk] }));
    const sign = (claims, opts = {}) => new jose.SignJWT({ email_verified: true, ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(opts.iss || 'https://accounts.google.com')
        .setAudience(opts.aud || 'test-client.apps.googleusercontent.com')
        .setSubject('google-sub-1')
        .setIssuedAt()
        .setExpirationTime(opts.exp || '10m')
        .sign(opts.key || privateKey);
    return { sign };
}

test('login Google: identitas hanya dari ID token yang tanda tangan & audience-nya sah', async () => {
    const previous = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    try {
        const { sign } = await googleKeys();
        const ok = await verifyGoogleIdToken(await sign({ email: 'Guru@Sekolah.id', name: 'Bu Guru', picture: 'https://x/p.png' }));
        assert.deepEqual({ email: ok.email, name: ok.name }, { email: 'guru@sekolah.id', name: 'Bu Guru' });

        await assert.rejects(verifyGoogleIdToken(await sign({ email: 'a@b.c' }, { aud: 'aplikasi-lain' })), /tidak valid/);
        await assert.rejects(verifyGoogleIdToken(await sign({ email: 'a@b.c' }, { iss: 'https://evil.example' })), /tidak valid/);
        await assert.rejects(verifyGoogleIdToken(await sign({ email: 'a@b.c', email_verified: false })), /belum terverifikasi/);
        const other = await jose.generateKeyPair('RS256');
        await assert.rejects(verifyGoogleIdToken(await sign({ email: 'a@b.c' }, { key: other.privateKey })), /tidak valid/);
        await assert.rejects(verifyGoogleIdToken('imbank8993@gmail.com'), /tidak valid/);
        await assert.rejects(verifyGoogleIdToken(undefined), /tidak valid/);
    } finally {
        setGoogleJwksForTest(null);
        if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previous;
    }
});

test('login & daftar Google tidak lagi menerima email dari isi permintaan', () => {
    const controller = read('../src/auth/auth.controller.ts');
    assert.match(controller, /async googleLogin\(\s*@Body\(\) body: GoogleLoginDto/);
    const service = read('../src/auth/auth.service.ts');
    const login = service.slice(service.indexOf('async loginWithGoogle('), service.indexOf('const authUser = await this.authUsers.findOrCreateOAuthUser', service.indexOf('async loginWithGoogle(')));
    assert.match(login, /verifyGoogleIdToken\(body\.credential\)/);
    assert.doesNotMatch(login, /payload\.email|body\.email/);
    const signup = service.slice(service.indexOf('async signup('));
    assert.match(signup, /if \(!dto\.password\) \{[\s\S]*verifyGoogleIdToken\(dto\.credential\)/);

    const route = read('../../web/app/api/auth/google/route.ts');
    assert.match(route, /JSON\.stringify\(\{ credential, schoolName, className \}\)/);
    for (const page of ['../../web/app/login/page.tsx', '../../web/app/components/landing/LandingHero.tsx']) {
        const src = read(page);
        assert.doesNotMatch(src, /email: googleEmail/);
        assert.match(src, /handleGoogleAuth\(token\)/);
    }
    assert.match(read('../../web/app/signup/page.tsx'), /credential: googleCredential/);
});

// ── Komisi ───────────────────────────────────────────────────────────────────

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

const CONFIG = { admin_share_pct: 40, proctor_share_pct: 60, token_idr_rate: 5000, min_withdrawal_tokens: 200, min_exam_token_price: 2, min_material_token_price: 3 };
const PROCTOR = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

function payoutFixture({ gross, paid = 0, insertError = null }) {
    return fakePrisma([
        [/key = 'commission_config'/, () => [{ value: CONFIG }]],
        [/FROM public\.cbt_profiles WHERE id = \$1::uuid/, () => [{ id: PROCTOR }]],
        [/AS unlock_count/, () => [{ owner_id: PROCTOR, unlock_count: 9, gross_tokens: gross }]],
        [/AS paid_tokens/, () => [{ proctor_id: PROCTOR, paid_tokens: paid, paid_idr: paid * 5000 }]],
        [/INSERT INTO public\.proctor_payouts/, (args) => {
            if (insertError) throw insertError;
            return [{ id: 'payout-1', proctor_tokens: args[4], total_idr: args[6] }];
        }],
    ]);
}

test('pencairan: jumlah dihitung server, bukti harus http(s), tidak menimpa pencairan lama', async () => {
    const prisma = payoutFixture({ gross: 1000, paid: 300 });
    const service = new CommissionsService(prisma);
    const dto = { proctor_id: PROCTOR, period_month: '2026-11', transfer_proof_url: 'https://bank.example/bukti.png', notes: 'x',
        // Nilai kiriman browser ini harus diabaikan.
        proctor_tokens: 999999, total_idr: 1 };
    const res = await service.processPayout(ADMIN, dto);
    // 60% × 1000 = 600, dikurangi 300 yang sudah dicairkan = 300 token.
    assert.equal(res.payout.proctor_tokens, 300);
    assert.equal(res.payout.total_idr, 300 * 5000);
    const insert = prisma.calls.find((c) => /INSERT INTO public\.proctor_payouts/.test(c.sql));
    assert.doesNotMatch(insert.sql, /ON CONFLICT/);
    assert.ok(prisma.calls.some((c) => /pg_advisory_xact_lock/.test(c.sql)), 'harus mengunci per proktor');

    await assert.rejects(new CommissionsService(payoutFixture({ gross: 1000 })).processPayout(ADMIN, { ...dto, transfer_proof_url: 'javascript:alert(1)' }), /http\(s\)/);
    await assert.rejects(new CommissionsService(payoutFixture({ gross: 300, paid: 0 })).processPayout(ADMIN, dto), /belum memenuhi batas minimal 200/);
    await assert.rejects(new CommissionsService(payoutFixture({ gross: 1000, insertError: Object.assign(new Error('duplicate key'), { code: 'P2010', meta: { code: '23505' } }) })).processPayout(ADMIN, dto), /20261111_03_proctor_payouts_multi/);
});

test('komisi dihitung dari token yang benar-benar dibayar, bukan harga item saat ini', async () => {
    const prisma = fakePrisma([
        [/key = 'commission_config'/, () => [{ value: CONFIG }]],
        [/WITH earnings AS/, () => [{ user_id: PROCTOR, full_name: 'P', gross_tokens: 333, total_unlocks: 7, paid_tokens: 0, paid_idr: 0, nik: '••••••••••••1234' }]],
    ]);
    const summary = await new CommissionsService(prisma).getAdminSummary();
    const sql = prisma.calls.find((c) => /WITH earnings AS/.test(c.sql)).sql;
    assert.match(sql, /token_transactions tt/);
    assert.match(sql, /tt\.type = 'usage'/);
    assert.doesNotMatch(sql, /SUM\(e\.token_price\)|cbt_user_roles/);
    assert.equal(summary.proctors[0].proctor_tokens_earned, Math.floor(333 * 60 / 100));
    assert.equal(prisma.calls.length, 2, 'satu query rekap, bukan 3 query per proktor');
});

test('validasi DTO komisi & pendaftaran rekening hanya untuk staf', async () => {
    const bad = plainToInstance(ProcessPayoutDto, { proctor_id: 'x', period_month: '2026-13', transfer_proof_url: '' });
    const errors = (await validate(bad)).map((e) => e.property).sort();
    assert.deepEqual(errors, ['period_month', 'proctor_id', 'transfer_proof_url']);

    const reg = plainToInstance(RegisterProctorDto, {
        full_name: 'A', nik: '7371 0000 0000 0001', whatsapp: '0812-3456-7890', email: 'a@b.co',
        bank1_name: 'BSI', bank1_account_name: 'A', bank1_account_number: '123 456 7890', bank2_account_number: '',
    });
    assert.deepEqual(await validate(reg), []);
    assert.equal(reg.nik, '7371000000000001');
    const badNik = plainToInstance(RegisterProctorDto, { ...reg, nik: '12345' });
    assert.ok((await validate(badNik)).some((e) => e.property === 'nik'));

    const service = new CommissionsService(fakePrisma([]));
    await assert.rejects(service.registerOrUpdateProfile({ id: PROCTOR, roles: ['SISWA'], isPlatformAdmin: false }, reg), /Hanya Proktor, Guru, atau Admin/);
    await service.registerOrUpdateProfile({ id: PROCTOR, roles: ['PROKTOR'], isPlatformAdmin: false }, reg);

    assert.equal(normalizeProofUrl(' https://x.example/a.pdf '), 'https://x.example/a.pdf');
    assert.throws(() => normalizeProofUrl('data:text/html,hi'), /http\(s\)/);
});

// ── Harga konten berbayar ────────────────────────────────────────────────────

function fakeDb({ config = CONFIG, profile = null } = {}) {
    return {
        from(table) {
            const chain = {
                select() { return chain; },
                eq() { return chain; },
                async maybeSingle() {
                    if (table === 'acca_settings') return { data: { value: config }, error: null };
                    if (table === 'proctor_profiles') return { data: profile, error: null };
                    return { data: null, error: null };
                },
            };
            return chain;
        },
    };
}

test('konten berbayar: harga minimal Admin & izin per pembuat ditegakkan', async () => {
    await assertPaidContentAllowed(fakeDb(), PROCTOR, 'exam', 5);
    await assert.rejects(assertPaidContentAllowed(fakeDb(), PROCTOR, 'exam', 1), /minimal 2 token/);
    await assert.rejects(assertPaidContentAllowed(fakeDb(), PROCTOR, 'material', 2), /minimal 3 token/);
    await assert.rejects(assertPaidContentAllowed(fakeDb(), PROCTOR, 'exam', 0), /1–10000/);
    await assert.rejects(assertPaidContentAllowed(fakeDb(), PROCTOR, 'exam', 1.5), /1–10000/);
    await assert.rejects(assertPaidContentAllowed(fakeDb({ profile: { can_create_exams: false, can_create_materials: true, status: 'approved' } }), PROCTOR, 'exam', 5), /dicabut/);
    await assertPaidContentAllowed(fakeDb({ profile: { can_create_exams: false, can_create_materials: true, status: 'approved' } }), PROCTOR, 'material', 5);
    await assert.rejects(assertPaidContentAllowed(fakeDb({ profile: { can_create_exams: true, can_create_materials: true, status: 'rejected' } }), PROCTOR, 'material', 5), /dicabut/);

    const exam = read('../src/proctor/exam-admin.service.ts');
    assert.match(exam, /const nextPaid = dto\.isPaid \?\? Boolean\(existing\.is_paid\)/);
    assert.doesNotMatch(exam, /is_paid: dto\.isPaid \?\? false,\s*token_price: dto\.tokenPrice \?\? 0,\s*\/\/ Selalu ditulis/);
    assert.match(read('../src/learning/learning.service.ts'), /assertPaidContentAllowed\(this\.db, row\.created_by/);
});

// ── Manajemen pengguna ───────────────────────────────────────────────────────

test('manajemen pengguna: tanpa password bawaan, peran tervalidasi, hapus menjaga catatan keuangan', async () => {
    const noPassword = plainToInstance(AdminCreateUserDto, { email: 'a@b.co', name: 'A', role: 'proktor' });
    assert.ok((await validate(noPassword)).some((e) => e.property === 'password'));
    const ok = plainToInstance(AdminCreateUserDto, { email: ' A@B.co ', name: ' A ', role: 'proktor', password: 'rahasia123' });
    assert.deepEqual(await validate(ok), []);
    assert.equal(ok.role, 'Proktor');
    assert.equal(ok.email, 'a@b.co');
    assert.ok((await validate(plainToInstance(AdminUpdateRoleDto, { role: 'Superadmin' }))).length > 0);

    const service = read('../src/auth/auth.service.ts');
    assert.doesNotMatch(service, /Admin123!/);
    assert.match(service, /financialFootprint\(targetUserId\)/);
    const roleBlock = service.slice(service.indexOf('const replacedRoles'));
    assert.match(roleBlock, /this\.prisma\.\$transaction\(async \(tx\)/);
    const page = read('../../web/app/dashboard/admin/users/page.tsx');
    assert.doesNotMatch(page, /Admin123!/);
    assert.match(page, /role: 'Siswa',/);
    assert.match(page, /return 'Guru';/);
});
