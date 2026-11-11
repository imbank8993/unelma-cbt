const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });

const web = (rel) => fs.readFileSync(path.resolve(__dirname, '../../web', rel), 'utf8');

test('ujian berbayar dibayar di kartu sebelum halaman ujian dibuka', () => {
    const gate = web('lib/paid-exam-gate.ts');
    // Logika "perlu dibuka": berbayar, belum dibuka, dan bukan pengerjaan yang sedang berjalan.
    assert.match(gate, /exam\.is_paid && \(exam\.token_price \?\? 0\) > 0 && !exam\.isUnlocked && !exam\.isInProgress/);
    assert.match(gate, /unlockItemWithTokens\('exam', exam\.id, price\)/, 'harga yang disetujui ikut dikirim');
    assert.match(gate, /Top Up Token/);

    for (const page of ['app/dashboard/siswa/page.tsx', 'app/dashboard/siswa/schedule/page.tsx']) {
        const source = web(page);
        assert.match(source, /if \(await unlockPaidExamBeforeStart\(exam, [\s\S]{0,80}?\)\) \{\s*router\.push\(`\/dashboard\/siswa\/exam\/\$\{exam\.id\}`\)/, page);
        assert.match(source, /onClick=\{\(\) => \{ void openExam\(exam\); \}\}/, page);
        assert.doesNotMatch(source, /=== 'open'[^\n]*\) router\.push\(`\/dashboard\/siswa\/exam/, `${page}: tidak boleh langsung masuk tanpa gerbang`);
    }
});

test('halaman ujian menampilkan langkah buka-akses, bukan jalan buntu', async () => {
    const page = web('app/components/questions/ExamPage.tsx');
    assert.match(page, /'paymentRequired' in result && result\.paymentRequired\) \{\s*confirmedStartExamIdRef\.current = null;\s*setAwaitingStart\(true\);/);
    assert.match(web('lib/api/students.ts'), /paymentRequired: res\.paymentRequired === true/);

    // Detail ujian membawa tarif sehingga layar persiapan tahu ujiannya berbayar.
    const { StudentsService } = require('../src/students/students.service.ts');
    const { fixtureDb } = require('./fixture-db.cjs');
    const db = fixtureDb({
        cbt_organization_members: [{ user_id: 'stu', organization_id: 'school', is_active: true }],
        cbt_class_members: [], cbt_additional_class_members: [], cbt_exam_participants: [], cbt_exam_targets: [],
        cbt_exams: [{ id: 'paid', organization_id: 'school', title: 'Ujicoba Token', is_published: true, status: 'active', metadata: { is_public: true }, is_paid: true, token_price: 5 }],
        cbt_profiles: [{ id: 'stu', full_name: 'Siswa', identity_number: '1' }],
        cbt_exam_attempts: [],
    });
    await new StudentsService(db).getExamForAttempt({ id: 'stu' }, 'paid').catch(() => null);
    const select = db.queries.find(q => q.table === 'cbt_exams').calls.find(call => call[0] === 'select')[1];
    assert.match(select, /\bis_paid\b/); assert.match(select, /\btoken_price\b/);
});

test('judul halaman ujian bukan UUID', () => {
    const layout = web('app/dashboard/layout.tsx');
    assert.match(layout, /pathname\.startsWith\('\/dashboard\/siswa\/exam\/'\)\) return 'Ujian'/);
    assert.match(layout, /return 'Detail';/);
});
