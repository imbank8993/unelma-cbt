// Render the actual result page with released scores and closed discussion.
// No database or student session is used.
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
  modules.Page = ts.transpileModule(fs.readFileSync('apps/web/app/dashboard/siswa/results/[attemptId]/page.tsx', 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const output = path.join(os.tmpdir(), 'unelma-personality-preview'); fs.mkdirSync(output, { recursive: true });
  const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
  const css = (await postcss([tailwind({ base: path.resolve('apps/web') })]).process('@import "tailwindcss";', { from: path.resolve('apps/web/app/personality-preview.css') })).css;
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', chromium.executablePath()].find(fs.existsSync);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('http://localhost:3099/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
    await page.goto('http://localhost:3099'); await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: 'body{margin:0;padding:28px;background:#ebecf1;font-family:Arial,sans-serif}@media(max-width:640px){body{padding:12px}}' });
    await page.evaluate(modules => {
      const cache = {}; let React;
      const fixture = window.personalityFixture = {
        answerKeysReleased: false, answerKeysMessage: 'Pembahasan tersedia setelah jadwal ujian berakhir.',
        personalitySummary: { personalityQuestions: 60, academicQuestions: 0, totalScore: 137.5, dimensionCount: 3 },
        attempt: { id: 'attempt', total_score: 0, display_score: 0, score_type: 'classical', score_label: 'Klasikal', status: 'submitted',
          started_at: '2026-11-17T12:00:00Z', finished_at: '2026-11-17T12:02:00Z',
          metadata: { dimension_scores: { discipline: 55, teamwork: 42.5, integrity: 40 } }, exams: { title: 'Tryout NMB MAN IC 2027 – Tes Kepribadian', show_results: true } },
        dimensions: [{ id: 'discipline', name: 'Disiplin' }, { id: 'teamwork', name: 'Kerja sama' }, { id: 'integrity', name: 'Integritas' }], interpretations: [], answers: [],
      };
      const stubs = {
        '@acca-cbt/shared': { selectedStudentScore: attempt => attempt.total_score, studentScoreType: () => 'classical', STUDENT_SCORE_LABELS: { classical: 'Klasikal' } },
        '@/app/components/questions/ResultImagePreview': { ResultImagePreview: props => React.createElement('div', props, props.children) },
        '@/app/components/monitoring/TopicAnalysisPanel': { TopicAnalysisPanel: () => null },
        '@/components/exams/PassResultBadge': { PassResultDetail: () => null },
        '@/app/components/questions/QuestionRenderer': { QuestionRenderer: () => null },
        '@/app/components/QuestionSearchBar': { QuestionSearchBar: () => null },
        '@/lib/question-search': { matchesQuestionSearch: () => true },
        '@/lib/api/students': { getAttemptDetailsResult: async () => ({ success: true, details: structuredClone(fixture) }) },
        '@/lib/school-time': { formatSchoolDateTime: str => new Date(str).toLocaleString('id-ID') },
        '@/lib/session': { getSessionUser: async () => ({ id: 'fixture' }) },
        '@/lib/useSchoolTimeZone': { useSchoolTimeZone: () => ({ timeZone: 'Asia/Makassar', error: '' }) },
        'next/navigation': { useParams: () => ({ attemptId: 'attempt' }), useRouter: () => ({ push() {} }) },
        'framer-motion': { AnimatePresence: props => props.children, motion: { div: props => React.createElement('div', null, props.children) } },
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
    const summary = page.getByRole('region', { name: 'Ringkasan nilai' });
    await page.getByText('Total skor kepribadian', { exact: true }).waitFor();
    assert.ok((await summary.textContent()).includes('137,5'));
    assert.ok(!(await summary.textContent()).includes('Klasikal'));
    assert.equal(await page.getByText('Jawaban benar', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Akurasi', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Skor: 42,5', { exact: true }).count(), 1, 'Dimension decimals agree with total');
    await page.screenshot({ path: path.join(output, 'personality-result-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'personality-result-mobile.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Pembahasan Soal', exact: true }).click();
    assert.equal(await page.getByText('137,5', { exact: true }).count(), 1);
    await page.evaluate(() => { window.personalityFixture.personalitySummary.totalScore = 0; window.personalityFixture.attempt.metadata.dimension_scores = { discipline: 0 }; });
    await page.getByRole('button', { name: 'Periksa kembali pembahasan' }).click();
    await page.getByText('Total poin dari 3 dimensi', { exact: true }).waitFor();
    assert.ok((await summary.textContent()).includes('Total skor kepribadian0'));
    await page.evaluate(() => { window.personalityFixture.personalitySummary = { personalityQuestions: 10, academicQuestions: 5, totalScore: 25, dimensionCount: 1 }; window.personalityFixture.attempt.display_score = 80; });
    await page.getByRole('button', { name: 'Periksa kembali pembahasan' }).click();
    await page.getByText('Nilai akhir', { exact: true }).waitFor();
    assert.ok((await summary.textContent()).includes('80.00'));
    await page.getByRole('tab', { name: 'Ringkasan', exact: true }).click();
    await page.getByText('Total skor kepribadian: 25 poin', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: personality total with closed discussion, zero score, no academic labels, mixed exam keeps 80 and separate 25 points, mobile layout.');
    console.log('Previews: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
