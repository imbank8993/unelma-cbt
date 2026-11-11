const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('SSO-ROLE-01: school roles, including Admin, are replaced from the SSO ticket', () => {
    const auth = read('apps/api/src/auth/auth.service.ts');
    assert.match(auth, /SSO_SYNCED_ROLES\s*=\s*\['ADMIN',\s*'PROKTOR',\s*'PENGAWAS',\s*'SISWA'\]/);
    assert.match(auth, /current\.filter\(\(id\) => syncedIds\.has\(id\) && !desired\.has\(id\)\)/);
});

test('SSO-ROLE-02: stale school roles in user metadata do not restore access', () => {
    const roles = read('apps/api/src/auth/cbt-roles.service.ts');
    assert.match(roles, /if \(orgRoleNames\.has\('ADMIN'\)\) out\.admin = true/);
    assert.doesNotMatch(roles, /metaRoles\.has\('(ADMIN|PROKTOR|GURU|PENGAWAS|SISWA)'\)/);
});

test('SSO-LOGOUT-01: logout lewat tautan menghapus sesi lalu kembali ke login Unelma CBT sendiri', () => {
    const logout = read('apps/web/app/api/auth/logout/route.ts');
    assert.match(logout, /export async function GET/);
    assert.match(logout, /response\.cookies\.set\(SESSION_COOKIE,\s*'',\s*sessionCookieOptions\(0\)\)/);
    // ACCA New tidak lagi terhubung: tujuan logout tidak boleh ke domain ACCA.
    assert.doesNotMatch(logout, /NEXT_PUBLIC_ACCA_URL/);
    assert.match(logout, /new URL\('\/login\?logged_out=1', resolvePublicOrigin\(request\)\)/);
});
