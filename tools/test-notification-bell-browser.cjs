// Exercise the actual header and notification bell with fixtures; no live user notifications.
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
        Header: 'apps/web/app/components/Header.tsx',
        './NotificationBell': 'apps/web/app/components/NotificationBell.tsx',
        '@/app/types/notification': 'apps/web/app/types/notification.ts',
        '@/lib/notification-safety': 'apps/web/lib/notification-safety.ts',
    })) modules[name] = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const css = await require('postcss')([require('@tailwindcss/postcss')({ base: path.resolve('apps/web') })])
        .process(fs.readFileSync('apps/web/app/globals.css', 'utf8'), { from: path.resolve('apps/web/app/globals.css') });
    const output = path.join(os.tmpdir(), 'unelma-notification-preview'); fs.mkdirSync(output, { recursive: true });
    const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(fs.existsSync);
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
        await page.route('http://notifications.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
        await page.goto('http://notifications.test');
        await page.clock.install();
        await page.addStyleTag({ content: css.css });
        for (const file of ['apps/web/app/components/header.css', 'apps/web/app/components/notification-bell.css']) await page.addStyleTag({ path: file });
        await page.addStyleTag({ content: ':root{--font-poppins:Arial,sans-serif;--font-sans:Arial,sans-serif}body{background:#eaecf2;font-family:Arial,sans-serif}.dark body{background:#0b1329}' });
        await page.evaluate(modules => {
            let React;
            const cache = {};
            const state = window.notificationFixture = { route: '', reads: [], fail: false, rows: [{ id: '1', type: 'exam_available', title: 'Ujian baru: Penalaran Matematika',
                message: 'Ujian telah diterbitkan. Periksa jadwal dan petunjuk sebelum mengerjakan.', is_read: false,
                action_url: '/dashboard/siswa/schedule', created_at: new Date().toISOString() }] };
            const stubs = {
                'next/navigation': { usePathname: () => '/dashboard/siswa', useRouter: () => ({ push: route => { state.route = route; } }) },
                'next/image': { __esModule: true, default: ({ unoptimized, ...props }) => React.createElement('img', props) },
                '@/lib/exam-durable-storage': { clearExamRecoverySessions: () => {}, forgetExamOfflineOwner: () => {} },
                '@/lib/exam-pwa': { clearExamOfflineShells: () => {} },
                '@/lib/session': { clearSessionCache: () => {} },
                '@/lib/api/notifications': {
                    getUserNotificationsResult: async () => state.fail ? { success: false, error: 'Koneksi notifikasi terputus.' } : { success: true, notifications: structuredClone(state.rows), unreadCount: state.rows.filter(row => !row.is_read).length },
                    markNotificationRead: async id => { state.reads.push(id); state.rows.find(row => row.id === id).is_read = true; return { success: true }; },
                    markAllNotificationsRead: async () => { state.rows.forEach(row => { row.is_read = true; }); return { success: true }; },
                },
            };
            const require = name => {
                if (name.endsWith('.css')) return {};
                if (stubs[name]) return stubs[name];
                if (!modules[name]) throw new Error('Unexpected module: ' + name);
                if (!cache[name]) { const module = { exports: {} }; cache[name] = module; new Function('module', 'exports', 'require', 'process', modules[name])(module, module.exports, require, { env: { NODE_ENV: 'development' } }); }
                return cache[name].exports;
            };
            React = require('react');
            require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require('Header').default, {
                user: { id: 'student', nama: 'Akademik', roles: ['SISWA'] }, pageTitle: 'Dashboard', pageSubtitle: 'Unelma', isCollapsed: false, onMenuToggle: () => {},
            }));
        }, modules);
        await page.clock.runFor(100);
        await page.getByRole('button', { name: 'Notifikasi, 1 belum dibaca', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Notifikasi, 1 belum dibaca', exact: true }).click();
        await page.getByRole('dialog', { name: 'Notifikasi', exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'notifications-desktop.png') });
        await page.getByRole('button', { name: /Ujian baru: Penalaran/ }).click();
        await page.waitForFunction(() => window.notificationFixture.route === '/dashboard/siswa/schedule');
        assert.deepEqual(await page.evaluate(() => window.notificationFixture.reads), ['1']);
        assert.equal(await page.getByRole('button', { name: 'Notifikasi', exact: true }).count(), 1);
        await page.evaluate(() => { window.notificationFixture.rows.unshift({ ...window.notificationFixture.rows[0], id: '2', title: 'Ujian baru: Literasi', is_read: false, action_url: 'https://evil.invalid' }); });
        await page.clock.fastForward(31000);
        await page.getByRole('button', { name: 'Notifikasi, 1 belum dibaca', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Notifikasi, 1 belum dibaca', exact: true }).click();
        await page.getByRole('button', { name: /Ujian baru: Literasi/ }).click();
        assert.equal(await page.evaluate(() => window.notificationFixture.route), '/dashboard/siswa/schedule');
        assert.equal(await page.getByRole('dialog', { name: 'Notifikasi' }).count(), 1);
        for (const width of [320, 390, 768, 1280]) {
            await page.setViewportSize({ width, height: 844 });
            const box = await page.getByRole('dialog', { name: 'Notifikasi' }).boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= width, `dialog fits ${width}px`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.clock.runFor(500);
        await page.screenshot({ path: path.join(output, 'notifications-mobile-dark.png') });
        await page.evaluate(() => { window.notificationFixture.fail = true; });
        await page.getByRole('button', { name: 'Perbarui notifikasi' }).click();
        await page.getByRole('alert').waitFor();
        assert.equal(await page.getByRole('button', { name: /Ujian baru: Literasi/ }).count(), 1);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog', { name: 'Notifikasi' }).count(), 0);
        await page.evaluate(() => { window.notificationFixture.fail = false; window.notificationFixture.rows[0].is_read = false; });
        await page.clock.fastForward(31000);
        await page.getByRole('button', { name: 'Notifikasi, 1 belum dibaca', exact: true }).click();
        await page.getByRole('button', { name: 'Tandai semua dibaca' }).click();
        assert.equal(await page.getByRole('button', { name: 'Notifikasi', exact: true }).count(), 1);
        assert.deepEqual(errors, []);
        console.log('PASS: real Header, new-exam badge, 30-second polling, read/navigation, safe destinations, mark-all-read, error preservation, Escape, desktop/mobile and dark mode.\nPreviews: ' + output);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
