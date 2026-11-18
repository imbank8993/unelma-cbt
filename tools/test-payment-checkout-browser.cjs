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
    '@/lib/midtrans-snap': 'apps/web/lib/midtrans-snap.ts',
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
    const sdkRequests = [];
    let failSdk = false;
    let sdkGate = null;
    await page.route('https://*.midtrans.com/snap/snap.js', async route => {
      sdkRequests.push(route.request().url());
      if (failSdk) { await route.abort(); return; }
      if (sdkGate) await sdkGate;
      await route.fulfill({ contentType: 'application/javascript', body: `
        window.paymentFixture.sdkLoads.push({src:document.currentScript.src,key:document.currentScript.getAttribute('data-client-key')});
        window.snap={hide(){document.getElementById('mock-snap')?.remove();},pay(token,options){
          this.hide();window.paymentFixture.pays.push({token,uiMode:options.uiMode});window.paymentFixture.callbacks=options;
          const overlay=document.createElement('div');overlay.id='mock-snap';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Pembayaran Midtrans');
          overlay.style='position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:#030c4d99';
          const close=document.createElement('button');close.textContent='Tutup popup pembayaran';close.style='background:white;padding:24px;border-radius:12px';close.onclick=()=>{this.hide();options.onClose();};overlay.appendChild(close);document.body.appendChild(overlay);
        }};
      ` });
    });
    await page.goto('http://localhost:3099'); await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: 'body{margin:0;background:#ebecf1;font-family:Arial,sans-serif}' });
    await page.evaluate(modules => {
      const cache = {};
      const fixture = window.paymentFixture = { mode: 'snap', creates: 0, credited: 0, status: 'pending', lastMethod: '', sdkLoads: [], pays: [], callbacks: null };
      const api = {
        packagePaymentMethods: () => ['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'mandiri_bill'],
        createPayment: async input => {
          fixture.creates++; fixture.lastMethod = input.payment_method;
          await new Promise(resolve => setTimeout(resolve, 80));
          return { success: true, order_id: 'TOKEN-FIXTURE', is_production: fixture.mode !== 'sandbox', client_key: fixture.mode === 'sandbox' ? 'SB-Mid-client-fixture' : fixture.mode === 'missing-key' ? '' : fixture.mode === 'delayed' ? 'Mid-client-delayed' : 'Mid-client-fixture', amount: 20000, token_amount: 17, payment_method: input.payment_method,
            ...(fixture.mode === 'core' ? { checkout_flow: 'core', payment_details: { payment_method: input.payment_method, bank: 'bri', va_number: '123456789012' } } :
              { checkout_flow: 'snap', snap_token: 'fixture-token', redirect_url: 'https://app.midtrans.com/snap/v2/vtweb/fixture' }) };
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
      window.closeCheckout = () => root.render(null);
      window.renderCheckout();
    }, modules);
    await page.getByRole('button').filter({ hasText: 'BRI Virtual Account' }).click();
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).dblclick();
    await page.getByRole('dialog', { name: 'Pembayaran Midtrans' }).waitFor();
    assert.equal(page.url(), 'http://localhost:3099/');
    assert.equal(browser.contexts()[0].pages().length, 1, 'Popup does not open a browser tab');
    assert.equal(await page.locator('a[href*="midtrans.com"]').count(), 0);
    assert.equal(await page.evaluate(() => window.paymentFixture.lastMethod), 'bri_va');
    assert.equal(await page.evaluate(() => window.paymentFixture.creates), 1);
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 0);
    assert.equal(await page.evaluate(() => window.paymentFixture.pays.length), 1);
    await page.getByRole('button', { name: 'Tutup popup pembayaran' }).click();
    await page.getByRole('button', { name: 'Tampilkan pembayaran', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pembayaran Midtrans' }).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.creates), 1, 'Reopen uses the same bill');
    assert.equal(await page.evaluate(() => window.paymentFixture.pays.length), 2);
    assert.deepEqual(await page.evaluate(() => window.paymentFixture.sdkLoads), [{src:'https://app.midtrans.com/snap/snap.js',key:'Mid-client-fixture'}]);
    await page.evaluate(() => window.paymentFixture.callbacks.onSuccess());
    await page.getByText(/Pembayaran belum terkonfirmasi/).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 0, 'SDK success does not credit without backend confirmation');
    assert.equal(await page.getByText(/Sisa waktu:/).count(), 0, 'Snap has no invented expiry countdown');
    assert.equal(await page.getByText('VIRTUAL ACCOUNT', { exact: true }).count(), 0, 'Snap does not render an empty VA panel');
    await page.screenshot({ path: path.join(output, 'midtrans-snap-desktop.png'), fullPage: true });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.screenshot({ path: path.join(output, 'midtrans-snap-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Saya Sudah Bayar (Cek Status)', exact: true }).click();
    await page.getByText(/Pembayaran belum terkonfirmasi/).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 0);
    await page.evaluate(() => { window.paymentFixture.status = 'success'; });
    await page.getByRole('button', { name: 'Saya Sudah Bayar (Cek Status)', exact: true }).click();
    await page.getByText('+17 Token Berhasil Masuk', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.credited), 17);
    await page.evaluate(() => { window.paymentFixture.mode = 'core'; window.paymentFixture.status = 'pending'; window.renderCheckout(); });
    await page.getByRole('button').filter({ hasText: 'BRI Virtual Account' }).click();
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).click();
    await page.getByText('123456789012', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Tampilkan pembayaran', exact: true }).count(), 0, 'Core still shows its inline instructions');
    await page.evaluate(() => { window.paymentFixture.mode = 'missing-key'; window.renderCheckout(); });
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).click();
    await page.getByText(/Client Key pembayaran belum sesuai/).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Pembayaran Midtrans' }).count(), 0);
    failSdk = true;
    await page.evaluate(() => { window.paymentFixture.mode = 'sandbox'; window.renderCheckout(); });
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).click();
    await page.getByText(/Popup pembayaran belum dapat dimuat/).waitFor();
    const createdBeforeRetry = await page.evaluate(() => window.paymentFixture.creates);
    failSdk = false;
    await page.getByRole('button', { name: 'Tampilkan pembayaran', exact: true }).click();
    await page.getByRole('dialog', { name: 'Pembayaran Midtrans' }).waitFor();
    assert.equal(await page.evaluate(() => window.paymentFixture.creates), createdBeforeRetry);
    assert.equal(await page.evaluate(() => window.paymentFixture.sdkLoads.at(-1).src), 'https://app.sandbox.midtrans.com/snap/snap.js');
    assert.equal(await page.evaluate(() => window.paymentFixture.sdkLoads.at(-1).key), 'SB-Mid-client-fixture');
    assert.equal(await page.evaluate(() => window.paymentFixture.pays.at(-1).uiMode), 'qr');
    assert.equal(page.url(), 'http://localhost:3099/');
    await page.evaluate(() => window.closeCheckout());
    await page.getByRole('dialog', { name: 'Pembayaran Midtrans' }).waitFor({ state: 'detached' });
    assert.equal(sdkRequests.filter(url => url === 'https://app.midtrans.com/snap/snap.js').length, 1);
    let releaseSdk;
    sdkGate = new Promise(resolve => { releaseSdk = resolve; });
    await page.evaluate(() => { window.paymentFixture.mode = 'delayed'; window.renderCheckout(); });
    await page.getByRole('button', { name: 'Lanjut Pembayaran', exact: true }).click();
    await page.getByRole('button', { name: 'Memuat pembayaran…', exact: true }).waitFor();
    await page.evaluate(() => window.closeCheckout());
    releaseSdk(); sdkGate = null;
    await page.waitForFunction(() => window.paymentFixture.sdkLoads.some(load => load.key === 'Mid-client-delayed'));
    assert.equal(await page.getByRole('dialog', { name: 'Pembayaran Midtrans' }).count(), 0, 'Delayed SDK cannot reopen an unmounted checkout');
    assert.deepEqual(errors, []);
    console.log('PASS: in-page Snap popup, unchanged URL/no new tab, same-order reopen, SDK caching, callbacks verified by backend, Core instructions, missing key, Sandbox mode, SDK failure/retry, unmount cleanup, mobile 320/390.');
    console.log('Previews: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
