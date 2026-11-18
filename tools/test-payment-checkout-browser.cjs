// Real checkout modal with mocked provider responses: never creates a real bill.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('playwright');

(async () => {
  const modules = { 'lucide-react': fs.readFileSync(require.resolve('lucide-react'), 'utf8') };
  for (const [name, pkg, file] of [
    ['react', 'react', 'react.development.js'], ['react-dom', 'react-dom', 'react-dom.development.js'],
    ['react-dom/client', 'react-dom', 'react-dom-client.development.js'], ['react/jsx-runtime', 'react', 'react-jsx-runtime.development.js'],
    ['scheduler', 'scheduler', 'scheduler.development.js'],
  ]) modules[name] = fs.readFileSync(path.join(path.dirname(require.resolve(pkg)), 'cjs', file), 'utf8');
  for (const [name, file] of Object.entries({
    Modal: 'apps/web/app/components/tokens/CustomPaymentModal.tsx',
    '@/lib/payment-checkout': 'apps/web/lib/payment-checkout.ts',
  })) modules[name] = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
  const css = (await postcss([tailwind({ base: path.resolve('apps/web') })]).process('@import "tailwindcss";', { from: path.resolve('apps/web/app/payment-preview.css') })).css;
  const output = path.join(os.tmpdir(), 'unelma-payment-preview'); fs.mkdirSync(output, { recursive: true });
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(fs.existsSync);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('http://localhost:3099/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
    await page.goto('http://localhost:3099'); await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: 'body{margin:0;background:#ebecf1;font-family:Arial,sans-serif}' });
    await page.evaluate(modules => {
      const cache = {};
      const fixture = window.paymentFixture = { mode: 'snap', creates: 0, credited: 0, status: 'pending', lastMethod: '' };
      const api = {
        packagePaymentMethods: () => ['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'mandiri_bill'],
        createPayment: async input => {
          fixture.creates++; fixture.lastMethod = input.payment_method;
          await new Promise(resolve => setTimeout(resolve, 80));
          return { success: true, order_id: 'TOKEN-FIXTURE', is_production: true, amount: 20000, token_amount: 17,
            ...(fixture.mode === 'core' ? { checkout_flow: 'core', payment_details: { payment_method: input.payment_method, bank: 'bri', va_number: '123456789012' } } :
              { checkout_flow: 'snap', snap_token: 'fixture-token', redirect_url: fixture.mode === 'unsafe' ? 'https://evil.example/pay' : 'https://app.midtrans.com/snap/v2/vtweb/fixture' }) };
        },
        checkPaymentStatus: async () => ({ success: true, status: fixture.status, token_amount: 17 }),
      };
      const require = name => {
        if (name === '@/lib/api/tokens') return api;
        if (!modules[name]) throw new Error('Unexpected module ' + name);
        if (!cache[name]) { const module = { exports: {} }; cache[name] = module; new Function('module', 'exports', 'require', 'process', modules[name])(module, module.exports, require, { env: { NODE_ENV: 'development' } }); }
        return cache[name].exports;
      };
      const React = require('react'); const root = require('react-dom/client').createRoot(document.getElementById('root')); let version = 0;
      window.renderCheckout = () => root.render(React.createElement(require('Modal').default, { key: ++version, isOpen: true, onClose() {},
        pkg: { id: 'package', name: 'Paket Hemat', price_idr: 20000, token_amount: 17, is_active: true }, onSuccess: amount => { fixture.credited += amount; } }));
      window.renderCheckout();
    }, modules);
    await page.getByRole('button').filter({ hasText: 'BRI Virtual Account' }).click();
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).dblclick();
    const link = page.getByRole('link', { name: 'Buka pembayaran Midtrans' }); await link.waitFor();
    assert.equal(await link.getAttribute('href'), 'https://app.midtrans.com/snap/v2/vtweb/fixture');
    assert.equal(await page.evaluate(() => window.paymentFixture.lastMethod), 'bri_va');
    assert.equal(await page.evaluate(() => window.paymentFixture.creates), 1);
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 0);
    assert.equal(await page.getByText(/Sisa waktu:/).count(), 0, 'Snap has no invented expiry countdown');
    assert.equal(await page.getByText('VIRTUAL ACCOUNT', { exact: true }).count(), 0, 'Snap does not render an empty VA panel');
    await page.screenshot({ path: path.join(output, 'midtrans-snap-desktop.png'), fullPage: true });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.screenshot({ path: path.join(output, 'midtrans-snap-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Saya Sudah Bayar (Cek Status)', exact: true }).click();
    await page.getByText(/Pembayaran belum terdeteksi/).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 0);
    await page.evaluate(() => { window.paymentFixture.status = 'success'; });
    await page.getByRole('button', { name: 'Saya Sudah Bayar (Cek Status)', exact: true }).click();
    await page.getByText('+17 Token Berhasil Masuk', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 17);
    await page.evaluate(() => { window.paymentFixture.mode = 'core'; window.paymentFixture.status = 'pending'; window.renderCheckout(); });
    await page.getByRole('button').filter({ hasText: 'BRI Virtual Account' }).click();
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).click();
    await page.getByText('123456789012', { exact: true }).waitFor();
    assert.equal(await link.count(), 0, 'Active Core still displays payment instructions inline');
    await page.evaluate(() => { window.paymentFixture.mode = 'unsafe'; window.renderCheckout(); });
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('a[href*="evil.example"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: Snap handoff, method preservation, one request on double-click, no false VA/countdown, pending does not credit, verified success credits, Core instructions, unsafe URL, mobile 320/390.');
    console.log('Previews: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
