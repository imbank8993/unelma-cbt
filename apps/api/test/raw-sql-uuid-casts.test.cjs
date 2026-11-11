const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Prisma mengirim parameter string `$queryRawUnsafe/$executeRawUnsafe` sebagai
 * `text`. PostgreSQL menolak `uuid = text` dan menyisipkan text ke kolom uuid
 * ("column ... is of type uuid but expression is of type text"), sehingga
 * pernyataannya gagal dengan HTTP 500 — inilah penyebab "Kelola Pengguna"
 * tidak bisa mengubah peran. Parameter untuk kolom uuid wajib `::uuid`.
 */
const SRC = path.resolve(__dirname, '../src');
const files = ['auth/auth.service.ts', 'commissions/commissions.service.ts'];

test('kolom uuid peran/anggota selalu memakai parameter ::uuid', () => {
    for (const file of files) {
        const source = fs.readFileSync(path.join(SRC, file), 'utf8');
        assert.doesNotMatch(source, /organization_member_id = \$\d+(?!::uuid)/, `${file}: organization_member_id tanpa ::uuid`);
        assert.doesNotMatch(source, /cbt_member_roles \(organization_member_id, role_id\)\s*VALUES \(\$\d+, \$\d+\)/,
            `${file}: INSERT cbt_member_roles tanpa ::uuid`);
        assert.doesNotMatch(source, /cbt_organization_members SET [^`]*WHERE id = \$\d+(?!::uuid)/,
            `${file}: UPDATE cbt_organization_members tanpa ::uuid`);
    }
});
