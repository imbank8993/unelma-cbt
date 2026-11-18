// Actual root sync, worker, and persistent notice gate. Exam APIs/storage are fixtures.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('playwright');

(async () => {
  const modules = {};
  for (const [name, pkg, file] of [
    ['react', 'react', 'react.development.js'], ['react-dom', 'react-dom', 'react-dom.development.js'],
    ['react-dom/client', 'react-dom', 'react-dom-client.development.js'], ['react/jsx-runtime', 'react', 'react-jsx-runtime.development.js'],
    ['scheduler', 'scheduler', 'scheduler.development.js'],
  ]) modules[name] = fs.readFileSync(path.join(path.dirname(require.resolve(pkg)), 'cjs', file), 'utf8');
  for (const [name, file] of Object.entries({
    Sync: 'apps/web/app/components/ExamSubmissionSync.tsx',
    '@/lib/exam-submission-worker': 'apps/web/lib/exam-submission-worker.ts',
    '@/lib/exam-submission-notices': 'apps/web/lib/exam-submission-notices.ts',
  })) modules[name] = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(fs.existsSync);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://localhost:3099/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div><div id="notices"></div></body></html>' }));
    async function mount() {
      await page.evaluate(modules => {
        const cache = {};
        const entry = { attemptId: 'attempt', examId: 'exam', userId: 'student', deviceId: 'device', deadlineAt: Date.now() - 1000,
          assignment: false, startedAt: '2026-11-18T00:00:00Z', personalEndTime: '2026-11-18T01:00:00Z' };
        const state = window.submissionFixture = { path: '/dashboard/siswa/tokens', user: { id: 'student' }, checks: 0, sends: 0, confirms: 0,
          status: { success: false, retryable: false, error: 'Sesi atau perangkat pengiriman tidak cocok.' } };
        if (!localStorage.getItem('fixture-submission')) {
          localStorage.setItem('fixture-submission', JSON.stringify(entry));
          localStorage.setItem('exam_answers_attempt', JSON.stringify({ answers: { q: 'offline answer' }, doubtfulAnswers: [],
            frozenSubmission: { startedAt: entry.startedAt, personalEndTime: entry.personalEndTime } }));
        }
        const storage = {
          EXAM_SUBMISSION_QUEUE_CHANGED: 'exam-submission-queue-changed', ExamSnapshotConflictError: class extends Error {},
          listExamSubmissionRegistrations: async () => { const value = localStorage.getItem('fixture-submission'); return value ? [JSON.parse(value)] : []; },
          readExamSnapshot: async () => JSON.parse(localStorage.getItem('exam_answers_attempt') || 'null'),
          resolveDurableDeviceId: async id => id, freezeExamSnapshot: async (_, snapshot) => snapshot,
          removeConfirmedExamSnapshot: async () => { state.confirms++; localStorage.removeItem('exam_answers_attempt'); },
          removeExamSubmissionRegistration: async () => localStorage.removeItem('fixture-submission'),
          readExamRecoverySession: async () => null, removeExamRecoverySession: async () => {},
          pruneExamRecoverySessions: async () => {}, pruneExpiredSecurityEvents: async () => {}, pruneStaleExamCopies: async () => {},
          readSecurityEvents: async () => [], removeSecurityEvent: async () => {}, discardExamLocalCopy: async () => { throw new Error('Must preserve local copy'); }, removeExamAttemptCaches() {},
        };
        const notify = title => { const node = document.createElement('p'); node.setAttribute('role', 'alert'); node.textContent = title; document.getElementById('notices').appendChild(node); };
        const stubs = {
          'next/navigation': { usePathname: () => state.path },
          '@/lib/session': { fetchSessionUser: async () => state.user },
          '@/lib/device-id': { getDeviceId: () => 'device', setDeviceId() {} },
          '@/lib/api/students': { getExamSubmissionStatus: async () => { state.checks++; return state.status; },
            submitExamAction: async () => { state.sends++; return { success: true, submissionVerified: true, alreadySubmitted: true }; } },
          '@/lib/exam-durable-storage': storage, './exam-durable-storage': storage,
          '@/lib/exam-evidence-outbox': { retryExamEvidence: async () => {} }, '@/lib/exam-pwa': { removeExamOfflineShell: async () => {} },
          './ui/Toast': { useToast: () => ({ success: notify, warning: notify }) },
        };
        const require = name => {
          if (name === './exam-submission-notices') name = '@/lib/exam-submission-notices';
          if (stubs[name]) return stubs[name];
          if (!modules[name]) throw new Error('Unexpected module ' + name);
          if (!cache[name]) { const module = { exports: {} }; cache[name] = module; new Function('module', 'exports', 'require', 'process', modules[name])(module, module.exports, require, { env: { NODE_ENV: 'development' } }); }
          return cache[name].exports;
        };
        const workerModule = require('@/lib/exam-submission-worker'), create = workerModule.createExamSubmissionWorker;
        workerModule.createExamSubmissionWorker = deps => { const worker = create(deps); window.deliveryWorker = worker; return worker; };
        const React = require('react'); const root = require('react-dom/client').createRoot(document.getElementById('root')); let version = 0;
        window.renderSync = () => root.render(React.createElement(require('Sync').ExamSubmissionSync, { key: ++version }));
        window.renderSync();
      }, modules);
      await page.waitForFunction(() => Boolean(window.deliveryWorker));
      await page.evaluate(() => window.deliveryWorker.run());
    }
    await page.goto('http://localhost:3099'); await mount();
    assert.equal(await page.getByRole('alert').count(), 1);
    assert.equal(await page.getByRole('alert').textContent(), 'Sinkronisasi jawaban ujian tertunda');
    assert.equal(await page.evaluate(() => window.submissionFixture.sends), 0);
    assert.ok(await page.evaluate(() => localStorage.getItem('exam_answers_attempt')));
    await page.reload(); await mount();
    assert.equal(await page.getByRole('alert').count(), 0, 'Same issue does not toast again on reload');
    await page.evaluate(() => { window.submissionFixture.path = '/dashboard/siswa/results'; window.dispatchEvent(new Event('focus')); });
    await page.evaluate(() => window.deliveryWorker.run());
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await page.evaluate(() => window.submissionFixture.sends), 0);
    await page.evaluate(() => { const entry = JSON.parse(localStorage.getItem('fixture-submission'));
      window.submissionFixture.status = { success: true, ...entry, status: 'submitted', canRecover: true };
      window.renderSync(); });
    await page.waitForFunction(() => window.submissionFixture.confirms === 1);
    assert.equal(await page.evaluate(() => window.submissionFixture.sends), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('exam_answers_attempt')), null, 'Only verified delivery removes copy');
    assert.equal(await page.getByRole('alert').last().textContent(), 'Jawaban sudah tersimpan');
    assert.deepEqual(errors, []);
    console.log('PASS: one exam warning on tokens page, none after reload/navigation, mismatched session never sends/deletes, verified recovery still confirms and cleans copy.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
