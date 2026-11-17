// Real React UI with mocked APIs. No social accounts or real publication are used.
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
    Page: 'apps/web/app/dashboard/admin/social-media/page.tsx',
    './social-media-components': 'apps/web/app/dashboard/admin/social-media/social-media-components.tsx',
    '@/app/components/ui/inlineselect': 'apps/web/app/components/ui/inlineselect.tsx',
    '@/app/components/ui/tabs': 'apps/web/app/components/ui/tabs.tsx',
    '@/lib/dashboard-navigation': 'apps/web/lib/dashboard-navigation.ts',
  })) modules[name] = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const output = process.env.SOCIAL_PREVIEW_DIR || path.join(os.tmpdir(), 'unelma-social-media-preview');
  fs.mkdirSync(output, { recursive: true });
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(fs.existsSync);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://localhost:3099/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
    await page.goto('http://localhost:3099');
    await page.addStyleTag({ path: 'apps/web/app/dashboard/admin/social-media/social-media.css' });
    await page.addStyleTag({ path: 'apps/web/app/components/ui/tabs.css' });
    await page.addStyleTag({ path: 'apps/web/app/components/ui/inline-select.css' });
    await page.addStyleTag({ content: 'body{margin:0;padding:28px;background:#ebecf1;font-family:Arial,sans-serif}*{box-sizing:border-box}button{font-family:inherit}.max-w-7xl{max-width:1280px}.mx-auto{margin:auto}.pb-20{padding-bottom:80px}.dark body{background:#020718}@media(max-width:640px){body{padding:12px}}' });
    await page.evaluate(modules => {
      const cache = {}; let React;
      const state = window.socialFixture = {
        savedKey: '', savedToken: '', publishes: 0, failMetrics: false,
        data: { settings: { bufferKeySet: false, organizationId: '', graphVersion: 'v26.0', updatedAt: null }, channels: [], posts: [],
          totals: { published: 0, drafts: 0, measured: 0, views: null, reach: null, interactions: null } },
      };
      const updateTotals = () => {
        const published = state.data.posts.filter(post => post.status === 'published');
        const sum = name => { const values = published.map(post => post.metrics[name]).filter(value => value !== null && value !== undefined); return values.length ? values.reduce((a, b) => a + b, 0) : null; };
        state.data.totals = { published: published.length, drafts: state.data.posts.filter(post => post.status === 'draft').length,
          measured: published.filter(post => post.metrics_at).length, views: sum('views'), reach: sum('reach'), interactions: sum('interactions') };
      };
      const api = {
        PLATFORM_LABELS: { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' },
        POST_STATUS_LABELS: { draft: 'Draf', sending: 'Sedang dikirim', processing: 'Diproses Buffer', published: 'Terbit', failed: 'Perlu diperbaiki', uncertain: 'Perlu diperiksa' },
        getSocialWorkspace: async () => { updateTotals(); return { success: true, ...structuredClone(state.data) }; },
        saveSocialSettings: async input => { state.savedKey = input.bufferApiKey || state.savedKey; Object.assign(state.data.settings, { bufferKeySet: !input.clearBufferKey, organizationId: input.organizationId || 'org1', graphVersion: input.graphVersion || 'v26.0' }); return { success: true, settings: state.data.settings }; },
        syncSocialChannels: async () => {
          state.data.channels = ['instagram', 'facebook', 'tiktok'].map(platform => ({ id: platform, platform, organization_id: 'org1', name: `Unelma ${platform}`, external_account_id: '123', connected: true, tokenSet: false }));
          return { success: true, organizations: [{ id: 'org1', name: 'Unelma' }], needsOrganization: false, count: 3 };
        },
        getSocialChannelSettings: async id => ({ success: true, accountId: '123', tokenSet: Boolean(state.data.channels.find(channel => channel.id === id)?.tokenSet), refreshTokenSet: false, clientKeySet: false, clientSecretSet: false }),
        saveSocialChannelSettings: async (id, input) => { state.savedToken = input.accessToken || ''; state.data.channels.find(channel => channel.id === id).tokenSet = !input.clearCredentials; return { success: true, saved: true }; },
        saveSocialDraft: async (id, input) => {
          const previous = state.data.posts.find(post => post.id === id);
          const post = { ...previous, id, platform: input.platform, channel_id: input.channelId, caption: input.caption, media_type: input.mediaType, media_url: input.mediaUrl,
            ai_generated: input.aiGenerated, status: 'draft', buffer_post_id: null, external_post_id: null, external_url: null, error: null, metrics: {}, metrics_at: null,
            metrics_error: null, created_at: '2026-11-17T08:00:00Z', published_at: null };
          state.data.posts = [post, ...state.data.posts.filter(row => row.id !== id)]; return { success: true, post: structuredClone(post) };
        },
        publishSocialPost: async id => { state.publishes++; const post = state.data.posts.find(row => row.id === id); Object.assign(post, { status: 'processing', buffer_post_id: 'buffer1' }); return { success: true, post: structuredClone(post) }; },
        syncSocialPost: async id => { const post = state.data.posts.find(row => row.id === id); if (state.failMetrics) post.metrics_error = 'Token statistik perlu diperbarui.';
          else Object.assign(post, { status: 'published', external_url: 'https://www.facebook.com/posts/123', metrics: { views: 42, reach: 25, interactions: 3 }, metrics_at: '2026-11-17T09:00:00Z', published_at: '2026-11-17T08:05:00Z', metrics_error: null }); return { success: true, post: structuredClone(post) }; },
        deleteSocialDraft: async id => { state.data.posts = state.data.posts.filter(post => post.id !== id); return { success: true }; },
        reconcileSocialPost: async () => ({ success: false, error: 'Referensi tidak cocok.' }),
        uploadSocialMediaFile: async (file, progress) => { progress(50); progress(100); return { success: true, media: { url: URL.createObjectURL(file), name: file.name, size: file.size, mediaType: file.name.endsWith('.mp4') ? 'video' : 'image' } }; },
        getSocialStorageUsage: async () => ({ success: true, storage: { files: 2, bytes: 2097152, unusedFiles: 1, unusedBytes: 1048576, truncated: false } }),
        cleanupSocialStorage: async () => ({ success: true, deleted: 1, freedBytes: 1048576, failed: 0 }),
      };
      const stubs = {
        '@/lib/social-media-api': api,
        '@/lib/confirm-dialog': { deleteConfirmDialog: async () => true },
        'next/navigation': { usePathname: () => '/dashboard/admin/social-media' },
        'next/link': { __esModule: true, default: props => React.createElement('a', props, props.children) },
      };
      const require = name => {
        if (name.endsWith('.css')) return {};
        if (stubs[name]) return stubs[name];
        if (!modules[name]) throw new Error('Unexpected module ' + name);
        if (!cache[name]) { const module = { exports: {} }; cache[name] = module; new Function('module', 'exports', 'require', 'process', modules[name])(module, module.exports, require, { env: { NODE_ENV: 'development' } }); }
        return cache[name].exports;
      };
      React = require('react');
      require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require('Page').default));
    }, modules);
    await page.getByRole('heading', { name: 'Buat posting', exact: true }).waitFor();
    await page.getByText(/Hubungkan akun melalui/).waitFor();
    assert.equal(await page.locator('.social-hero, .social-stat').count(), 0, 'Posting has no banner or statistics cards');
    assert.equal(await page.locator('select:not(.uisel-input)').count(), 0, 'Every dropdown uses InlineSelect');
    await page.getByRole('button', { name: 'Statistik', exact: true }).click();
    assert.deepEqual(await page.locator('.social-stat strong').allTextContents(), ['0', '—', '—', '—']);
    await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
    await page.getByLabel(/^API key Buffer/).fill('fixture-private-buffer-key');
    await page.getByRole('button', { name: 'Simpan pengaturan', exact: true }).click();
    await page.getByText(/Pengaturan disimpan/).waitFor();
    assert.equal(await page.getByLabel(/^API key Buffer/).inputValue(), '');
    assert.equal(await page.evaluate(() => window.socialFixture.savedKey), 'fixture-private-buffer-key');
    await page.getByRole('button', { name: 'Sinkronkan akun', exact: true }).click();
    await page.getByText('3 akun disinkronkan.', { exact: true }).waitFor();
    await page.getByLabel('Akun statistik', { exact: true }).selectOption('instagram');
    await page.getByLabel('Access token Instagram', { exact: true }).fill('fixture-private-meta-token');
    await page.getByRole('button', { name: 'Simpan token statistik', exact: true }).click();
    await page.getByText(/Token statistik disimpan\./).waitFor();
    assert.equal(await page.getByLabel('Access token Instagram', { exact: true }).inputValue(), '');
    await page.getByLabel('Akun statistik', { exact: true }).selectOption('tiktok');
    await page.getByLabel('Client secret TikTok (opsional)', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Access token TikTok', { exact: true }).inputValue(), '');
    await page.getByRole('button', { name: 'Periksa pemakaian', exact: true }).click();
    await page.getByText('1 file tidak terpakai', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Bersihkan media', exact: true }).click();
    await page.getByText(/1 file dihapus, 1 MB dibebaskan/).waitFor();
    assert.equal(await page.locator('select:not(.uisel-input)').count(), 0);
    await page.screenshot({ path: path.join(output, 'social-settings-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Posting', exact: true }).click();
    await page.getByLabel('Unggah gambar', { exact: true }).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aK1sAAAAASUVORK5CYII=', 'base64') });
    await page.getByText(/File berhasil diunggah/).waitFor();
    await page.getByText('fixture.png', { exact: true }).waitFor();
    assert.equal(await page.locator('.social-preview-media img').count(), 1);
    await page.getByRole('button', { name: 'Hapus lampiran', exact: true }).click();
    await page.getByRole('button', { name: 'Gunakan URL', exact: true }).click();
    await page.getByLabel('URL media publik').fill('https://example.invalid/broken.png');
    await page.getByText('Media belum dapat ditampilkan', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Facebook', exact: true }).click();
    await page.getByLabel('Akun tujuan', { exact: true }).selectOption('facebook');
    await page.getByLabel('Caption', { exact: false }).fill('Informasi tryout Unelma. Daftar sekarang!');
    await page.getByLabel('Jenis konten', { exact: true }).selectOption('text');
    await page.getByRole('button', { name: 'Simpan draf', exact: true }).click();
    await page.getByText('Draf tersimpan.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.socialFixture.data.posts.length), 1);
    assert.equal(await page.evaluate(() => window.socialFixture.publishes), 0);
    await page.screenshot({ path: path.join(output, 'social-composer-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Publikasikan sekarang', exact: true }).click();
    await page.getByText('Diproses Buffer', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.socialFixture.publishes), 1);
    await page.getByRole('button', { name: 'Perbarui posting', exact: true }).click();
    await page.getByText('Terbit', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Statistik', exact: true }).click();
    assert.deepEqual(await page.locator('.social-table tbody tr td').allTextContents().then(values => values.slice(1, 4)), ['42', '25', '3']);
    await page.evaluate(() => { window.socialFixture.failMetrics = true; });
    await page.getByRole('button', { name: /Perbarui.*terbaru/ }).click();
    await page.getByText('Token statistik perlu diperbarui.', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('.social-table tbody tr td').allTextContents().then(values => values.slice(1, 4)), ['42', '25', '3']);
    await page.screenshot({ path: path.join(output, 'social-statistics-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Posting', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'social-composer-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    for (const width of [320, 360, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of ['Posting', 'Statistik', 'Pengaturan']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${tab} fits ${width}px`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Pengaturan', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'social-settings-mobile-dark.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: InlineSelect, no banner, upload/preview, storage usage/cleanup, credentials, draft/publish, metrics, responsive 320/360/390/768/1440, dark mode.');
    console.log('Previews: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
