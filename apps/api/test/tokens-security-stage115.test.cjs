const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const { TokensService } = require('../src/tokens/tokens.service.ts');
const { SettingsService } = require('../src/settings/settings.service.ts');

const SERVER_KEY = 'SB-Mid-server-secret-1234';
const ORDER = 'TOKEN-1700000000000-abcd1234';

/** Prisma palsu: setiap SQL dicocokkan ke handler regex; $transaction memakai klien yang sama. */
function fakePrisma(handlers) {
    const calls = [];
    const run = async (sql, ...args) => {
        calls.push({ sql, args });
        for (const [re, fn] of handlers) if (re.test(sql)) return fn(args, sql);
        return [];
    };
    const prisma = {
        calls,
        $queryRawUnsafe: run,
        $executeRawUnsafe: async (sql, ...args) => { await run(sql, ...args); return 1; },
        $transaction: async (fn) => fn(prisma),
    };
    return prisma;
}

const midtransRow = (cfg) => [/acca_settings WHERE key = 'midtrans_config'/, () => [{ value: cfg }]];
const config = { get: () => '' };
const sign = (body, key = SERVER_KEY) =>
    crypto.createHash('sha512').update(`${body.order_id}${body.status_code}${body.gross_amount}${key}`).digest('hex');

function webhookFixture({ cfg = { is_production: false, sandbox_server_key: SERVER_KEY, sandbox_client_key: 'SB-c' }, txStatus = 'pending', amount = 25000 } = {}) {
    const state = { status: txStatus, balance: 0 };
    const prisma = fakePrisma([
        midtransRow(cfg),
        [/FROM public.payment_transactions WHERE order_id/, () => [{ id: 'tx-1', order_id: ORDER, user_id: 'user-1', email: 'a@b.c', token_amount: 10, amount, package_name: 'Paket', status: state.status }]],
        [/UPDATE public.payment_transactions\s+SET status = 'success'/, () => {
            if (state.status === 'success') return [];
            state.status = 'success';
            return [{ id: 'tx-1' }];
        }],
        [/SET token_balance = COALESCE\(token_balance, 0\) \+/, (args) => { state.balance += args[0]; return []; }],
    ]);
    return { service: new TokensService(prisma, config), prisma, state };
}

function mockMidtransStatus(payload) {
    const original = global.fetch;
    let calls = 0;
    global.fetch = async () => { calls++; return { status: 200, json: async () => payload }; };
    return { restore: () => { global.fetch = original; }, get calls() { return calls; } };
}

const settlement = { order_id: ORDER, status_code: '200', gross_amount: '25000.00', transaction_status: 'settlement' };

test('webhook tanpa signature_key ditolak dan tidak memberi kredit', async () => {
    const f = webhookFixture();
    const net = mockMidtransStatus({ ...settlement });
    try {
        await assert.rejects(f.service.handleWebhook({ ...settlement }), /Invalid signature/);
        await assert.rejects(f.service.handleWebhook({ ...settlement, signature_key: 'ab'.repeat(64) }), /Invalid signature/);
        assert.equal(f.state.balance, 0);
        assert.equal(net.calls, 0);
    } finally { net.restore(); }
});

test('webhook ditolak bila server key belum dikonfigurasi', async () => {
    const f = webhookFixture({ cfg: { is_production: true, production_server_key: '', sandbox_server_key: '' } });
    await assert.rejects(f.service.handleWebhook({ ...settlement, signature_key: sign(settlement, '') }), /Invalid signature/);
    assert.equal(f.state.balance, 0);
});

test('webhook sah mengkredit sekali walau notifikasi datang ganda', async () => {
    const f = webhookFixture();
    const net = mockMidtransStatus({ ...settlement, payment_type: 'qris' });
    try {
        const body = { ...settlement, signature_key: sign(settlement) };
        const results = await Promise.all([f.service.handleWebhook(body), f.service.handleWebhook(body)]);
        assert.equal(f.state.balance, 10);
        assert.deepEqual(results.map((r) => r.status).sort(), ['already_success', 'settled']);
        assert.equal(f.prisma.calls.filter((c) => /'topup'/.test(c.sql)).length, 1);
    } finally { net.restore(); }
});

test('webhook memakai status resmi Midtrans dan menolak nominal yang tidak cocok', async () => {
    const pending = webhookFixture();
    let net = mockMidtransStatus({ ...settlement, transaction_status: 'pending' });
    try {
        const r = await pending.service.handleWebhook({ ...settlement, signature_key: sign(settlement) });
        assert.equal(r.status, 'pending');
        assert.equal(pending.state.balance, 0);
    } finally { net.restore(); }

    const cheap = webhookFixture({ amount: 250000 });
    net = mockMidtransStatus({ ...settlement });
    try {
        await assert.rejects(cheap.service.handleWebhook({ ...settlement, signature_key: sign(settlement) }), /Amount mismatch/);
        assert.equal(cheap.state.balance, 0);
    } finally { net.restore(); }
});

test('webhook pesanan lama tetap terverifikasi setelah admin pindah mode', async () => {
    const f = webhookFixture({ cfg: { is_production: true, production_server_key: 'Mid-server-live', production_client_key: 'Mid-client', sandbox_server_key: SERVER_KEY } });
    const net = mockMidtransStatus({ ...settlement });
    try {
        const r = await f.service.handleWebhook({ ...settlement, signature_key: sign(settlement) });
        assert.equal(r.status, 'settled');
    } finally { net.restore(); }
});

function unlockFixture({ balance, alreadyUnlocked = false }) {
    const state = { balance, unlocked: alreadyUnlocked };
    const prisma = fakePrisma([
        [/FROM public.cbt_exams/, () => [{ title: 'Ujian A', is_paid: true, token_price: 5 }]],
        [/SELECT 1 FROM public.unlocked_items/, () => (state.unlocked ? [{ '?column?': 1 }] : [])],
        [/COALESCE\(token_balance, 0\) as balance/, () => [{ balance: state.balance }]],
        [/INSERT INTO public.unlocked_items/, () => {
            if (state.unlocked) return [];
            state.unlocked = true;
            return [{ id: 'u-1' }];
        }],
        [/token_balance >= \$1/, (args) => {
            if (state.balance < args[0]) return [];
            state.balance -= args[0];
            return [{ token_balance: state.balance }];
        }],
    ]);
    return { service: new TokensService(prisma, config), prisma, state };
}

test('unlock memotong saldo secara atomik dan tidak pernah minus', async () => {
    const ok = unlockFixture({ balance: 7 });
    const r = await ok.service.unlockItem('user-1', { itemType: 'exam', itemId: '00000000-0000-4000-8000-000000000001' });
    assert.equal(r.remainingBalance, 2);

    const poor = unlockFixture({ balance: 3 });
    await assert.rejects(
        poor.service.unlockItem('user-1', { itemType: 'exam', itemId: '00000000-0000-4000-8000-000000000001' }),
        /tidak mencukupi/,
    );
    assert.equal(poor.state.balance, 3);
    assert.ok(poor.prisma.calls.every((c) => !/token_balance = token_balance - \$1\s+WHERE id = \$2::uuid\s*$/m.test(c.sql)),
        'pemotongan saldo harus selalu bersyarat token_balance >= biaya');
});

test('unlock paralel item yang sama hanya memotong saldo sekali', async () => {
    const f = unlockFixture({ balance: 20 });
    // Simulasikan request kedua yang lolos checkAccess sebelum request pertama commit.
    const item = { itemType: 'exam', itemId: '00000000-0000-4000-8000-000000000001' };
    const first = f.service.unlockItem('user-1', item);
    const second = f.service.unlockItem('user-1', item);
    await Promise.all([first, second]);
    assert.equal(f.state.balance, 15);
});

test('konfigurasi Midtrans: mode aktif wajib punya kunci, kunci SB- ditolak di produksi', async () => {
    const make = (stored = {}) => new TokensService(fakePrisma([midtransRow(stored)]), config);
    await assert.rejects(make().saveMidtransConfig({ is_production: true }), /wajib diisi/);
    await assert.rejects(
        make().saveMidtransConfig({ is_production: true, production_client_key: 'SB-Mid-client-x', production_server_key: 'SB-Mid-server-x' }),
        /SB-/,
    );
    const stored = { is_production: false, sandbox_client_key: 'SB-c', sandbox_server_key: SERVER_KEY };
    // Nilai tersamar/kosong mempertahankan server key; opsi hapus mengosongkannya.
    await make(stored).saveMidtransConfig({ is_production: false, sandbox_client_key: 'SB-c', sandbox_server_key: '••••••••1234' });
    await assert.rejects(
        make(stored).saveMidtransConfig({ is_production: false, sandbox_client_key: 'SB-c', clear_sandbox_server_key: true }),
        /wajib diisi/,
    );
});

test('pembelian ditolak bila Midtrans belum dikonfigurasi atau pesanan menggantung terlalu banyak', async () => {
    const pkg = [/FROM public.token_packages WHERE id/, () => [{ id: 'p-1', name: 'Paket', token_amount: 10, price_idr: '25000' }]];
    const user = { id: 'user-1', email: 'siswa@sekolah.id', roles: [] };
    const noKey = new TokensService(fakePrisma([pkg, midtransRow({ is_production: false, sandbox_server_key: '' })]), config);
    await assert.rejects(noKey.createPayment(user, { package_id: 'p-1' }), /belum dikonfigurasi/);

    const spam = new TokensService(fakePrisma([pkg, [/COUNT\(\*\)::int AS n/, () => [{ n: 5 }]]]), config);
    await assert.rejects(spam.createPayment(user, { package_id: 'p-1' }), /Terlalu banyak/);
});

test('midtrans_config & commission_config tidak bocor lewat /settings', () => {
    for (const key of ['midtrans_config', 'commission_config']) {
        assert.equal(SettingsService.isSensitive(key), true);
        assert.equal(SettingsService.isDedicated(key), true);
    }
    const controller = fs.readFileSync(path.resolve(__dirname, '../src/settings/settings.controller.ts'), 'utf8');
    assert.match(controller, /isDedicated\(key\)[\s\S]*ForbiddenException/);
    assert.match(controller, /isDedicated\(dto\.key\)[\s\S]*ForbiddenException/);
});

test('endpoint pembelian wajib login dan halaman admin mengunci form saat konfigurasi gagal dimuat', () => {
    const controller = fs.readFileSync(path.resolve(__dirname, '../src/tokens/tokens.controller.ts'), 'utf8');
    assert.match(controller, /@Post\('payments\/create'\)\s*@UseGuards\(JwtAuthGuard\)/);
    const page = fs.readFileSync(path.resolve(__dirname, '../../web/app/dashboard/admin/tokens/page.tsx'), 'utf8');
    assert.match(page, /<fieldset disabled=\{midtransStatus !== 'ready'/);
    assert.doesNotMatch(page, /parseInt\(e\.target\.value\) \|\| 1/);
    assert.doesNotMatch(page, /setSandboxServerKey\(midtransRes/);
    const route = fs.readFileSync(path.resolve(__dirname, '../../web/app/api/payments/create/route.ts'), 'utf8');
    assert.match(route, /proxyJson\(request, '\/tokens\/payments\/create'/);
});
