// Run from repository root: node --test apps/api/test/paid-exam-retake.test.cjs
// Aturan: ujian BERBAYAR yang sudah dibuka boleh dikerjakan ulang tanpa batas
// (tanpa potong token lagi) selama jadwal masih buka; nilai resmi = pengerjaan
// terakhir; pengerjaan lama tetap tersimpan. Ujian gratis tetap sekali kerjakan.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });

const { fixtureDb } = require('./fixture-db.cjs');
const { ExamAttemptsService } = require('../src/students/exam-attempts.service.ts');
const { StudentsService } = require('../src/students/students.service.ts');
const { allowsPaidRetake } = require('../src/common/paid-content.ts');
const { finishedAttemptOrder, withoutSupersededAttempts } = require('../src/common/attempt-history.ts');
const { dashboardScoreSummaries, officialResults } = require('../../web/lib/student-dashboard-score.ts');
const { scheduleState } = require('../../web/lib/student-schedule.ts');

const user = { id: 'student', isPlatformAdmin: false };
const finished = { id: 'old', exam_id: 'exam', user_id: 'student', status: 'submitted', total_score: 40,
    started_at: '2026-11-01T01:00:00Z', finished_at: '2026-11-01T02:00:00Z', metadata: {} };

function tables({ paid, unlocked }) {
    return {
        cbt_exams: [{
            id: 'exam', organization_id: 'school', question_bank_id: 'bank', is_published: true,
            start_time: null, end_time: null, duration_minutes: 60, status: 'active',
            metadata: { is_public: true }, is_paid: paid, token_price: paid ? 5 : 0,
        }],
        cbt_exam_attempts: [{ ...finished }],
        cbt_answers: [],
        cbt_attempt_security_logs: [],
        cbt_organization_members: [{ user_id: user.id, organization_id: 'school', is_active: true }],
        cbt_class_members: [],
        cbt_additional_class_members: [],
        cbt_exam_participants: [],
        cbt_exam_targets: [],
        cbt_profiles: [{ id: user.id, full_name: 'Siswa', identity_number: '1', token_balance: 10 }],
        unlocked_items: unlocked ? [{ id: 'u1', user_id: user.id, item_type: 'exam', item_id: 'exam' }] : [],
        token_transactions: [],
    };
}

function service(db) {
    return new ExamAttemptsService(
        db,
        { post: async () => ({ items: [], scaled_score: 0, needs_manual_grading: false, dimension_scores: {} }) },
        { gradeAttemptFromSavedAnswers: async () => null },
    );
}

test('allowsPaidRetake: hanya ujian berbayar dengan harga > 0', () => {
    assert.equal(allowsPaidRetake({ is_paid: true, token_price: 5 }), true);
    assert.equal(allowsPaidRetake({ is_paid: true, token_price: '3' }), true);
    assert.equal(allowsPaidRetake({ is_paid: true, token_price: 0 }), false);
    assert.equal(allowsPaidRetake({ is_paid: false, token_price: 5 }), false);
    assert.equal(allowsPaidRetake({}), false);
});

test('ujian berbayar yang sudah dibuka dapat dikerjakan ulang; pengerjaan lama tetap tersimpan', async () => {
    const db = fixtureDb(tables({ paid: true, unlocked: true }));
    const result = await service(db).start(user, 'exam', 'device-one');

    assert.equal(result.started, true, JSON.stringify(result));
    assert.notEqual(result.attempt.id, 'old');
    const rows = db.tables.cbt_exam_attempts;
    assert.equal(rows.length, 2);
    const old = rows.find(row => row.id === 'old');
    assert.equal(old.status, 'submitted');
    assert.equal(old.total_score, 40, 'skor pengerjaan lama tidak berubah');
    // Tidak ada token yang dipotong lagi.
    assert.equal(db.tables.cbt_profiles[0].token_balance, 10);
    assert.equal(db.tables.token_transactions.length, 0);

    // Memulai lagi saat pengerjaan ulang berjalan = melanjutkan, bukan membuat baru.
    const again = await service(db).start(user, 'exam', 'device-one');
    assert.equal(again.attempt.id, result.attempt.id);
    assert.equal(db.tables.cbt_exam_attempts.length, 2);
});

test('ujian berbayar yang aksesnya belum dibuka tetap meminta pembayaran', async () => {
    const db = fixtureDb(tables({ paid: true, unlocked: false }));
    const result = await service(db).start(user, 'exam', 'device-one');
    assert.equal(result.started, false);
    assert.equal(result.paymentRequired, true);
    assert.equal(db.tables.cbt_exam_attempts.length, 1);
});

test('ujian gratis tetap sekali kerjakan', async () => {
    const db = fixtureDb(tables({ paid: false, unlocked: false }));
    const result = await service(db).start(user, 'exam', 'device-one');
    assert.equal(result.started, false);
    assert.match(result.error, /sudah menyelesaikan/);
    assert.equal(result.expiredAttemptId, 'old');
    assert.equal(db.tables.cbt_exam_attempts.length, 1);
});

test('jadwal ujian siswa menandai ujian berbayar selesai sebagai dapat dikerjakan ulang', async () => {
    for (const [paid, unlocked, expected] of [[true, true, true], [true, false, false], [false, false, false]]) {
        const db = fixtureDb(tables({ paid, unlocked }));
        db.raw = async () => [{ now: new Date('2026-11-12T00:00:00Z') }];
        const [exam] = await new StudentsService(db).listExams(user);
        assert.equal(exam.isCompleted, true);
        assert.equal(exam.canRetake, expected, `paid=${paid} unlocked=${unlocked}`);
        assert.equal(scheduleState(exam, Date.parse('2026-11-12T00:00:00Z')), expected ? 'open' : 'closed');
    }
});

test('layar ujian: pengerjaan selesai pada ujian berbayar tidak dihitung "sudah dimulai"', async () => {
    const paid = fixtureDb(tables({ paid: true, unlocked: true }));
    assert.equal((await new StudentsService(paid).getExamForAttempt(user, 'exam')).hasStartedAttempt, false);
    const free = fixtureDb(tables({ paid: false, unlocked: false }));
    assert.equal((await new StudentsService(free).getExamForAttempt(user, 'exam')).hasStartedAttempt, true);
});

test('riwayat nilai: semua pengerjaan tampil, nilai resmi = pengerjaan terakhir', async () => {
    const exam = { title: 'Tryout', duration_minutes: 60, show_results: true, scoring_type: 'classical', metadata: {} };
    const db = fixtureDb({
        cbt_exam_attempts: [
            { ...finished, exams: exam },
            { ...finished, id: 'new', total_score: 70, finished_at: '2026-11-05T02:00:00Z', exams: exam },
            { ...finished, id: 'other', exam_id: 'exam-2', total_score: 90, finished_at: '2026-11-03T02:00:00Z', exams: exam },
        ],
    });
    const results = await new StudentsService(db).listResults(user);
    const byId = Object.fromEntries(results.map(row => [row.id, row]));
    assert.deepEqual([byId.old.attempt_number, byId.old.attempt_count, byId.old.is_latest_attempt], [1, 2, false]);
    assert.deepEqual([byId.new.attempt_number, byId.new.attempt_count, byId.new.is_latest_attempt], [2, 2, true]);
    assert.equal(byId.other.is_latest_attempt, true);

    assert.deepEqual(officialResults(results).map(row => row.id).sort(), ['new', 'other']);
    // Rata-rata memakai nilai terakhir (70) dan ujian lain (90), bukan 40.
    assert.equal(dashboardScoreSummaries(results)[0].average, 80);
});

test('analisis staf: pengerjaan lama yang digantikan tidak dihitung ganda', () => {
    const rows = [
        { id: 'a1', exam_id: 'e', user_id: 's1', status: 'submitted', finished_at: '2026-11-01T00:00:00Z' },
        { id: 'a2', exam_id: 'e', user_id: 's1', status: 'auto_submitted', finished_at: '2026-11-02T00:00:00Z' },
        { id: 'a3', exam_id: 'e', user_id: 's1', status: 'in_progress', finished_at: null },
        { id: 'b1', exam_id: 'e', user_id: 's2', status: 'submitted', finished_at: '2026-11-01T00:00:00Z' },
    ];
    const order = finishedAttemptOrder(rows);
    assert.equal(order.get('a1').is_latest_attempt, false);
    assert.equal(order.get('a2').attempt_number, 2);
    assert.equal(order.has('a3'), false);
    assert.deepEqual(withoutSupersededAttempts(rows).map(row => row.id), ['a2', 'a3', 'b1']);

    const monitoring = fs.readFileSync(path.resolve(__dirname, '../src/proctor/exam-monitoring.service.ts'), 'utf8');
    assert.match(monitoring, /const attemptList = withoutSupersededAttempts\(/);
});

test('analitik staf memakai pengerjaan terakhir tiap siswa', async () => {
    const { AnalyticsService } = require('../src/analytics/analytics.service.ts');
    const attempts = [
        { id: 'a1', exam_id: 'exam', user_id: 's1', status: 'submitted', total_score: 20, finished_at: '2026-11-01T00:00:00Z', profiles: { full_name: 'S1' } },
        { id: 'a2', exam_id: 'exam', user_id: 's1', status: 'submitted', total_score: 80, finished_at: '2026-11-02T00:00:00Z', profiles: { full_name: 'S1' } },
        { id: 'b1', exam_id: 'exam', user_id: 's2', status: 'submitted', total_score: 60, finished_at: '2026-11-01T00:00:00Z', profiles: { full_name: 'S2' } },
    ];
    const db = fixtureDb({ cbt_exams: [{ id: 'exam', title: 'Tryout', question_bank_id: null }], cbt_exam_attempts: attempts,
        cbt_answers: [], cbt_exam_question_snapshots: [], cbt_exam_question_sources: [], cbt_bank_questions: [] });
    const analytics = new AnalyticsService(db, { assertExamStaff: async () => undefined }, {});

    const performance = await analytics.studentPerformance({ id: 'staff' }, 'exam');
    const s1 = performance.find(row => row.student_id === 's1');
    assert.equal(s1.average_score, 80, 'nilai terakhir, bukan rata-rata 50');
    assert.equal(s1.attempt_id, 'a2');
    assert.equal(s1.attempt_count, 2);
    assert.equal(performance.length, 2);

    const summary = await analytics.examAnalytics({ id: 'staff' }, 'exam');
    assert.equal(summary.completed_count, 2);
    assert.equal(summary.score_stats.average, 70, '(80 + 60) / 2, bukan (20 + 80 + 60) / 3');

    const source = fs.readFileSync(path.resolve(__dirname, '../src/analytics/analytics.service.ts'), 'utf8');
    assert.equal((source.match(/withoutSupersededAttempts\(/g) || []).length, 5, 'daftar ujian, analitik, performa, respons soal, ekspor');
    const proctor = fs.readFileSync(path.resolve(__dirname, '../src/proctor/proctor.service.ts'), 'utf8');
    assert.match(proctor, /NOT EXISTS \(\s*SELECT 1 FROM public\.cbt_exam_attempts newer\s*WHERE newer\.exam_id = a\.exam_id AND newer\.user_id = a\.user_id/);
});

test('monitoring web menandai pengerjaan ulang dan ekspor menyertakan kolomnya', () => {
    const web = rel => fs.readFileSync(path.resolve(__dirname, '../../web', rel), 'utf8');
    assert.match(web('app/components/monitoring/MonitoringResultsTable.tsx'), /Pengerjaan ke-\{att\.attempt_number\}/);
    assert.match(web('lib/export-excel-analysis.ts'), /'Pengerjaan': \(a\.attempt_count \?\? 1\) > 1/);
});
