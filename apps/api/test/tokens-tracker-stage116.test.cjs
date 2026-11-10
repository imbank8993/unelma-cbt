const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const { TokensService } = require('../src/tokens/tokens.service.ts');

const config = { get: () => '' };

function recordingPrisma(handlers = []) {
    const calls = [];
    const run = async (sql, ...args) => {
        calls.push({ sql, args });
        for (const [re, fn] of handlers) if (re.test(sql)) return fn(args, sql);
        return [];
    };
    const prisma = { calls, $queryRawUnsafe: run, $executeRawUnsafe: async (s, ...a) => { await run(s, ...a); return 1; }, $transaction: async (fn) => fn(prisma) };
    return prisma;
}

test('kata kunci tracker: wildcard LIKE di-escape, kosong = tanpa filter, panjang dibatasi', () => {
    assert.equal(TokensService.likePattern(''), null);
    assert.equal(TokensService.likePattern('   '), null);
    assert.equal(TokensService.likePattern(undefined), null);
    assert.equal(TokensService.likePattern('Budi'), '%budi%');
    assert.equal(TokensService.likePattern('100%_a\\b'), '%100\\%\\_a\\\\b%');
    assert.equal(TokensService.likePattern('x'.repeat(500)).length, 100 + 2);
});

test('paginasi tracker dibatasi ke nilai yang aman', () => {
    assert.deepEqual(TokensService.trackerPaging(undefined, undefined), { page: 1, page_size: 50, offset: 0 });
    assert.deepEqual(TokensService.trackerPaging(3, 20), { page: 3, page_size: 20, offset: 40 });
    assert.deepEqual(TokensService.trackerPaging(-5, 10_000), { page: 1, page_size: 200, offset: 0 });
    assert.deepEqual(TokensService.trackerPaging(NaN, 0), { page: 1, page_size: 50, offset: 0 });
});

for (const [name, method, statKey] of [
    ['pembelian', 'getPurchasesTracker', 'total_orders'],
    ['pemakaian', 'getUsagesTracker', 'total_unlocks'],
]) {
    test(`tracker ${name}: statistik memakai filter yang sama dengan tabel`, async () => {
        const prisma = recordingPrisma([[/COUNT\(\*\)::int AS/, () => [{ [statKey]: 120 }]]]);
        const service = new TokensService(prisma, config);
        const res = await service[method]('budi_', 2, 50);

        assert.equal(prisma.calls.length, 2);
        const [rows, stats] = prisma.calls;
        assert.deepEqual(rows.args, ['%budi\\_%', 50, 50]);
        assert.deepEqual(stats.args, ['%budi\\_%']);
        for (const call of prisma.calls) {
            assert.match(call.sql, /\$1::text IS NULL/);
            assert.match(call.sql, /LIKE \$1 ESCAPE '\\'/);
        }
        assert.match(rows.sql, /LIMIT \$2::int OFFSET \$3::int/);
        assert.equal(res.total, 120);
        assert.equal(res.page, 2);
        assert.equal(res.filtered, true);

        const all = recordingPrisma();
        const unfiltered = await new TokensService(all, config)[method]('', undefined, undefined);
        assert.equal(all.calls[0].args[0], null);
        assert.equal(unfiltered.filtered, false);
    });
}

test('pembelian memakai identitas akun login, bukan email/nama dari request', async () => {
    let snapPayload = null;
    const original = global.fetch;
    global.fetch = async (_url, init) => {
        snapPayload = JSON.parse(init.body);
        return { status: 201, json: async () => ({ token: 'snap-token', redirect_url: 'https://pay' }) };
    };
    try {
        const prisma = recordingPrisma([
            [/FROM public.token_packages WHERE id/, () => [{ id: 'p-1', name: 'Paket', token_amount: 10, price_idr: '25000' }]],
            [/acca_settings WHERE key = 'midtrans_config'/, () => [{ value: { is_production: false, sandbox_server_key: 'SB-Mid-server-x', sandbox_client_key: 'SB-c' } }]],
            [/INSERT INTO public.payment_transactions/, () => [{ id: 'tx-1' }]],
        ]);
        const user = { id: 'user-1', email: '', fullName: 'Andi Siswa', roles: [] };
        await new TokensService(prisma, config).createPayment(user, {
            package_id: 'p-1', email: 'guru@sekolah.id', customer_name: 'Kepala Sekolah',
        });
        const insert = prisma.calls.find((c) => /INSERT INTO public.payment_transactions/.test(c.sql));
        assert.equal(insert.args[2], '');
        assert.equal(insert.args[3], 'Andi Siswa');
        assert.equal(snapPayload.customer_details.first_name, 'Andi Siswa');
        assert.equal('email' in snapPayload.customer_details, false);
    } finally {
        global.fetch = original;
    }
});

test('halaman tracker: error tampil, request usang diabaikan, label & waktu sekolah', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '../../web/app/dashboard/admin/transactions/page.tsx'), 'utf8');
    assert.match(page, /seq !== requestSeq\.current/);
    assert.match(page, /Data gagal dimuat/);
    assert.match(page, /formatSchoolDateTime/);
    assert.match(page, /Menampilkan .* dari .* data terbaru/);
    assert.doesNotMatch(page, /toLowerCase\(\)\.includes\('bahan ajar'\)/);
    assert.match(page, /Math\.abs\(Number\(u\.amount\)/);
    const dto = fs.readFileSync(path.resolve(__dirname, '../src/tokens/tokens.dto.ts'), 'utf8');
    const paymentDto = dto.slice(dto.indexOf('class CreatePaymentDto'), dto.indexOf('class UnlockItemDto'));
    assert.doesNotMatch(paymentDto, /email|customer_name/);
});
