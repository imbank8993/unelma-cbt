const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const { TokensService, midtransCoreAccessDenied, midtransChargeErrorMessage } = require('../src/tokens/tokens.service.ts');
const { PAYMENT_METHOD_IDS, SNAP_PAYMENT_CODES } = require('../src/tokens/payment-methods.ts');
const { midtransCheckoutUrl } = require('../../web/lib/payment-checkout.ts');
const user = { id: 'student-1', email: 'fixture@example.org', fullName: 'Fixture', roles: [] };
const denied = { status_code: '402', status_message: 'Payment channel is not activated.' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fixture(production = true, methods = PAYMENT_METHOD_IDS) {
  const writes = [];
  return { writes, service: new TokensService({
    $queryRawUnsafe: async (sql, ...args) => {
      if (sql.includes('FROM public.token_packages')) return [{ id: 'pkg', name: 'Paket Hemat', price_idr: 20000, token_amount: 17, payment_methods: methods }];
      if (sql.includes("key = 'midtrans_config'")) return [{ value: { is_production: production, production_server_key: 'production-test-key', production_client_key: 'test-client', sandbox_server_key: 'sandbox-test-key', sandbox_client_key: 'test-client' } }];
      if (sql.includes('COUNT(*)')) return [{ n: 0 }];
      if (sql.includes('INSERT INTO public.payment_transactions')) { writes.push({ sql, args }); return [{ id: 'tx' }]; }
      throw new Error('Unexpected SQL');
    },
  }, { get: () => '' }) };
}

test('every supported method can fall back from explicit Core access rejection to Snap in both environments', async () => {
  const originalFetch = global.fetch;
  try {
    for (const production of [true, false]) for (const method of PAYMENT_METHOD_IDS) {
      const { service, writes } = fixture(production);
      const calls = [];
      const host = production ? 'app.midtrans.com' : 'app.sandbox.midtrans.com';
      global.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return url.endsWith('/v2/charge') ? response(denied) : response({ token: 'fixture-token', redirect_url: `https://${host}/snap/v2/vtweb/fixture` }, 201);
      };
      const result = await service.createPayment(user, { package_id: 'pkg', payment_method: method });
      assert.equal(result.checkout_flow, 'snap');
      assert.equal(result.payment_method, method);
      assert.equal(result.amount, 20000);
      assert.equal(result.token_amount, 17);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1].body.enabled_payments, [SNAP_PAYMENT_CODES[method]]);
      assert.deepEqual(calls[0].body.transaction_details, calls[1].body.transaction_details, 'One order and amount across both APIs');
      assert.equal(calls[1].url, `https://${host}/snap/v1/transactions`);
      assert.equal(writes.length, 1, 'Only one pending local transaction is stored');
      assert.equal(writes[0].args[0], result.order_id);
      assert.match(writes[0].sql, /'pending'/);
      assert.ok(!('production_server_key' in result));
      assert.ok(!JSON.stringify(result).includes('production-test-key'));
    }
  } finally { global.fetch = originalFetch; }
});

test('network failures, timeouts, duplicate orders, and ambiguous results never create a Snap checkout', async () => {
  const originalFetch = global.fetch;
  try {
    for (const body of [new Error('connection lost'), null,
      { status_code: '401', status_message: 'unauthorized' },
      { status_code: '406', status_message: 'Duplicate order ID' },
      { status_code: '503', status_message: 'Payment channel timeout' },
      { status_code: '505', status_message: 'Unable to create va_number' },
      { status_code: '402', status_message: 'GoPay user is blocked' },
      { ...denied, transaction_id: 'remote-transaction' },
      { ...denied, transaction_status: 'pending' },
    ]) {
      const { service, writes } = fixture(); let calls = 0;
      global.fetch = async () => { calls++; if (body instanceof Error) throw body; return response(body); };
      await assert.rejects(service.createPayment(user, { package_id: 'pkg', payment_method: 'bri_va' }));
      assert.equal(calls, 1);
      assert.equal(writes.length, 0);
    }
  } finally { global.fetch = originalFetch; }
  assert.equal(midtransCoreAccessDenied({ status_code: 402, status_message: "Merchant doesn't have access for this payment type" }), true);
  assert.match(midtransChargeErrorMessage({ status_code: '503', status_message: 'Payment channel timeout' }), /sedang sibuk/);
  assert.match(midtransChargeErrorMessage({ status_code: '401' }), /hubungi Administrator/);
});

test('Snap-only checkout respects package restrictions and unsafe redirects are rejected before storage', async () => {
  const originalFetch = global.fetch;
  try {
    const { service, writes } = fixture(true, ['qris', 'bri_va']);
    const payloads = [];
    global.fetch = async (url, init) => { payloads.push(JSON.parse(init.body)); return response({ token: 'fixture-token', redirect_url: 'https://app.midtrans.com/snap/v2/vtweb/fixture' }, 201); };
    assert.equal((await service.createPayment(user, { package_id: 'pkg' })).checkout_flow, 'snap');
    assert.deepEqual(payloads[0].enabled_payments, ['gopay', 'bri_va']);
    assert.equal(writes.length, 1);
    for (const url of ['javascript:alert(1)', 'https://app.midtrans.com.evil.example/snap/x', 'https://app.sandbox.midtrans.com/snap/x', 'https://app.midtrans.com@evil.example/snap/x', 'http://app.midtrans.com/snap/x', 'https://app.midtrans.com/not-checkout']) {
      const attempt = fixture();
      global.fetch = async () => response({ token: 'fixture-token', redirect_url: url }, 201);
      await assert.rejects(attempt.service.createPayment(user, { package_id: 'pkg' }));
      assert.equal(attempt.writes.length, 0);
      assert.equal(midtransCheckoutUrl({ is_production: true, redirect_url: url }), null);
    }
    assert.equal(midtransCheckoutUrl({ is_production: true, redirect_url: 'https://app.midtrans.com/snap/v2/vtweb/fixture' }), 'https://app.midtrans.com/snap/v2/vtweb/fixture');
  } finally { global.fetch = originalFetch; }
});
