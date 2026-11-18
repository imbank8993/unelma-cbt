const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const { createExamSubmissionNoticeGate, EXAM_SUBMISSION_NOTICE_KEY } = require('../../web/lib/exam-submission-notices.ts');
const { createExamSubmissionWorker } = require('../../web/lib/exam-submission-worker.ts');
const entry = { attemptId: 'attempt', examId: 'exam', userId: 'student', deviceId: 'device', deadlineAt: 1000, assignment: false,
    startedAt: '2026-11-18T00:00:00Z', personalEndTime: '2026-11-18T01:00:00Z' };
const issue = 'Sesi atau perangkat pengiriman tidak cocok.';
function store() { const values = new Map(); return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; }

test('one warning per issue survives page reloads and a second tab without touching answer storage', () => {
    const storage = store(); storage.values.set('exam_answers_attempt', 'saved answers');
    const first = createExamSubmissionNoticeGate(() => storage);
    assert.equal(first.claim(entry, issue), true);
    assert.equal(first.claim(entry, issue), false);
    const reload = createExamSubmissionNoticeGate(() => storage);
    assert.equal(reload.claim(entry, issue), false);
    assert.equal(reload.claim({ ...entry, startedAt: '2026-11-18T00:00:00.000Z' }, issue), false);
    assert.equal(storage.getItem('exam_answers_attempt'), 'saved answers');
    assert.deepEqual([...storage.values.keys()].sort(), [EXAM_SUBMISSION_NOTICE_KEY, 'exam_answers_attempt'].sort());
});

test('different users, devices, attempts, generations and errors still get their own first warning', () => {
    const storage = store(), gate = createExamSubmissionNoticeGate(() => storage);
    assert.equal(gate.claim(entry, issue), true);
    for (const changed of [{ userId: 'other' }, { deviceId: 'other' }, { examId: 'other' }, { attemptId: 'other' },
        { startedAt: '2026-11-19T00:00:00Z' }, { personalEndTime: '2026-11-18T02:00:00Z' }]) assert.equal(gate.claim({ ...entry, ...changed }, issue), true);
    assert.equal(gate.claim(entry, 'Jawaban berbeda dari salinan terkunci.'), true);
    gate.clear(entry);
    assert.equal(createExamSubmissionNoticeGate(() => storage).claim(entry, issue), true);
    assert.equal(gate.claim({ ...entry, userId: 'other' }, issue), false, 'Clearing one generation preserves other users');
});

test('corrupt or blocked storage cannot stop submission recovery; notice history stays bounded', () => {
    const storage = store(); storage.setItem(EXAM_SUBMISSION_NOTICE_KEY, '{bad json');
    let now = 10000;
    const gate = createExamSubmissionNoticeGate(() => storage, () => now);
    for (let i = 0; i < 130; i++) { now++; assert.equal(gate.claim({ ...entry, attemptId: `attempt-${i}` }, issue), true); }
    assert.equal(JSON.parse(storage.getItem(EXAM_SUBMISSION_NOTICE_KEY)).length, 100);
    const blocked = createExamSubmissionNoticeGate(() => { throw new Error('storage blocked'); });
    assert.equal(blocked.claim(entry, issue), true);
    assert.equal(blocked.claim(entry, issue), false);
    now += 8 * 24 * 3600000;
    assert.equal(gate.claim(entry, issue), true);
    assert.equal(JSON.parse(storage.getItem(EXAM_SUBMISSION_NOTICE_KEY)).length, 1);
});

test('recreated delivery workers suppress the same rejection but keep local answers and keep checking', async () => {
    const storage = store(), calls = [], notices = [];
    const snapshot = { answers: { q: 'last answer' }, doubtfulAnswers: [] };
    const make = () => {
        const gate = createExamSubmissionNoticeGate(() => storage);
        return createExamSubmissionWorker({ online: () => true, now: () => 1000, activeExamId: () => null,
            list: async () => [entry], currentUser: async () => ({ id: 'student' }), currentDevice: async () => 'device',
            read: async () => snapshot, status: async () => { calls.push('status'); return { success: false, retryable: false, error: issue }; },
            assignment: () => undefined, freeze: async (_, s) => s, send: async () => { calls.push('send'); },
            confirm: async () => calls.push('confirm'), discard: async () => calls.push('discard'),
            notify: async (e, result) => { if (gate.claim(e, result.error)) notices.push(result.error); },
        });
    };
    await make().run(); await make().run();
    assert.deepEqual(notices, [issue]);
    assert.deepEqual(calls, ['status', 'status']);
    assert.equal(snapshot.answers.q, 'last answer');
});

test('a new generation bypasses old backoff immediately; stopped workers cannot publish stale warnings', async () => {
    let current = entry, calls = 0, release;
    const warnings = [];
    const deps = { online: () => true, now: () => 1000, activeExamId: () => null,
        list: async () => [current], currentUser: async () => ({ id: 'student' }), currentDevice: async () => 'device',
        read: async () => ({ answers: { q: 'answer' }, doubtfulAnswers: [] }),
        status: async () => { calls++; return { success: false, retryable: false, error: issue }; },
        assignment: () => undefined, freeze: async (_, s) => s, send: async () => { throw new Error('must not send'); },
        confirm: async () => {}, notify: async (_, result) => warnings.push(result.error) };
    const worker = createExamSubmissionWorker(deps);
    await worker.run(); await worker.run();
    assert.equal(calls, 1);
    current = { ...entry, startedAt: '2026-11-19T00:00:00Z' };
    await worker.run(); assert.equal(calls, 2);
    const pending = new Promise(resolve => { release = resolve; });
    const stopped = createExamSubmissionWorker({ ...deps, status: async () => pending });
    const run = stopped.run(); await new Promise(resolve => setImmediate(resolve));
    stopped.stop(); release({ success: false, retryable: false, error: 'stale warning' }); await run;
    assert.deepEqual(warnings, [issue, issue]);
});
