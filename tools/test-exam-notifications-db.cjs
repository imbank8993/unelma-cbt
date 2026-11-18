// Uses temporary tables and always rolls back. No real student receives a notification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('ts-node').register({ project: path.resolve('apps/api/tsconfig.json'), transpileOnly: true });
const { Client } = require('pg');
const { fixtureDb } = require('../apps/api/test/fixture-db.cjs');
const { NotificationsService } = require('../apps/api/src/notifications/notifications.service.ts');
const uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

(async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
    try {
        await db.connect(); await db.query('BEGIN');
        await db.query("SET LOCAL statement_timeout = '15s'");
        for (const table of ['cbt_exams', 'cbt_notifications', 'cbt_notification_preferences', 'cbt_exam_attempts']) {
            await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
        }
        await db.query('ALTER TABLE pg_temp.cbt_exams ADD PRIMARY KEY (id)');
        const migration = fs.readFileSync('database/migrations/20261118_01_exam_notifications.sql', 'utf8')
            .replace(/^BEGIN;|^COMMIT;/gm, '').replaceAll('public.', 'pg_temp.');
        await db.query(migration);
        const user = { id: uuid(1), roles: ['SISWA'] }, organization = uuid(2), otherOrganization = uuid(3);
        const regular = uuid(4), additional = uuid(5);
        const fixture = fixtureDb({
            cbt_organization_members: [{ user_id: user.id, organization_id: organization, is_active: true }],
            cbt_class_members: [{ user_id: user.id, class_id: regular }],
            cbt_additional_class_members: [{ user_id: user.id, class_id: additional }],
            cbt_exam_participants: [{ user_id: user.id, exam_id: uuid(14) }],
            cbt_exam_targets: [{ exam_id: uuid(12), class_id: regular }, { exam_id: uuid(13), additional_class_id: additional }],
        });
        fixture.raw = async (sql, ...parameters) => (await db.query(sql.replaceAll('public.', 'pg_temp.'), parameters)).rows;
        const service = new NotificationsService(fixture);
        const exam = async (id, patch = {}) => {
            const row = { organization, published: true, status: 'active', metadata: {}, end: null, ...patch };
            await db.query(`INSERT INTO pg_temp.cbt_exams (id, organization_id, title, is_published, status, metadata, end_time, duration_minutes)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 30)`, [uuid(id), row.organization, `Exam ${id}`, row.published, row.status, JSON.stringify(row.metadata), row.end]);
        };
        await exam(11, { metadata: { is_public: true } });
        await exam(12); await exam(13); await exam(14); // regular class, additional class, individual
        await exam(15); // private, unassigned
        await exam(16, { organization: otherOrganization, metadata: { is_public: true } });
        await exam(17, { published: false, metadata: { is_public: true } });
        await exam(18, { status: 'archived', metadata: { is_public: true } });
        await exam(19, { end: '2020-01-01T00:00:00Z', metadata: { is_public: true } });
        await exam(20, { metadata: { is_public: true } });
        await exam(21, { status: 'scheduled', metadata: { is_public: true } });
        await exam(22, { metadata: { is_public: true, key_correction: { state: 'processing' } } });
        await db.query(`INSERT INTO pg_temp.cbt_exam_attempts (exam_id, user_id, status) VALUES ($1, $2, 'submitted')`, [uuid(20), user.id]);
        await service.syncAvailableExams(user);
        let rows = (await db.query('SELECT user_id, data, action_url FROM pg_temp.cbt_notifications')).rows;
        assert.deepEqual(rows.map(row => row.data.exam_id).sort(), [11, 12, 13, 14, 21].map(uuid).sort());
        assert.ok(rows.every(row => row.user_id === user.id && row.action_url === '/dashboard/siswa/schedule'));
        await service.syncAvailableExams(user);
        assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_temp.cbt_notifications')).rows[0].count, 5);
        await db.query('DELETE FROM pg_temp.cbt_notifications');
        await service.syncAvailableExams(user);
        assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_temp.cbt_notifications')).rows[0].count, 0);
        await exam(23, { metadata: { is_public: true } });
        await db.query('INSERT INTO pg_temp.cbt_notification_preferences (user_id, exam_reminder) VALUES ($1, false)', [user.id]);
        await service.syncAvailableExams(user);
        assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_temp.cbt_notifications')).rows[0].count, 0);
        await db.query('DELETE FROM pg_temp.cbt_notification_preferences');
        await service.syncAvailableExams(user);
        rows = (await db.query('SELECT data FROM pg_temp.cbt_notifications')).rows;
        assert.deepEqual(rows.map(row => row.data.exam_id), [uuid(23)]);
        // A staff account does not receive student exam discovery notifications.
        await service.syncAvailableExams({ id: uuid(99), roles: ['GURU'] });
        assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_temp.cbt_exam_notification_deliveries')).rows[0].count, 6);
        await exam(24, { metadata: { is_public: true } });
        await db.query(`INSERT INTO pg_temp.cbt_notifications (user_id, type, title, data) VALUES ($1, 'exam_available', 'Legacy', $2::jsonb)`, [user.id, JSON.stringify({ exam_id: uuid(24) })]);
        await db.query(migration); // replay/backfill an existing notification before it is deleted
        await db.query(`DELETE FROM pg_temp.cbt_notifications WHERE data->>'exam_id' = $1`, [uuid(24)]);
        await service.syncAvailableExams(user);
        assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_temp.cbt_exam_notification_deliveries')).rows[0].count, 7);
        assert.equal((await db.query('SELECT count(*)::int AS count FROM pg_temp.cbt_notifications')).rows[0].count, 1);
        console.log('PASS: public/class/additional/individual audiences; school isolation; draft/archived/expired/completed/paused exclusions; one-time delivery after deletion; preferences; newly published exams. All fixture data rolled back.');
    } finally { await db.query('ROLLBACK').catch(() => {}); await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
