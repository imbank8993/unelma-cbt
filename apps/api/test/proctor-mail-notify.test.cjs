const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { MailService, renderHtml } = require('../src/common/mail.service.ts');
const { CommissionsService } = require('../src/commissions/commissions.service.ts');

const ADMIN = { id: '55555555-5555-4555-8555-555555555555' };
const PROFILE = '66666666-6666-4666-8666-666666666666';

test('template email meng-escape isi dan tanpa SMTP tidak mengirim apa pun', async () => {
    const html = renderHtml({ to: 'a@b.c', subject: 's', heading: '<b>Halo</b>', paragraphs: ['<script>x</script>'], action: { label: 'Masuk', url: 'https://unelma.id/login' } });
    assert.match(html, /&lt;b&gt;Halo&lt;\/b&gt;/);
    assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    const previous = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
        assert.equal(await new MailService().send({ to: 'a@b.c', subject: 's', heading: 'h', paragraphs: [] }), false);
    } finally {
        if (previous !== undefined) process.env.SMTP_HOST = previous;
    }
});

test('pengaju proktor menerima email saat ditolak dan disetujui', async () => {
    const sent = [];
    const mail = { appUrl: 'https://unelma.id', send: async (message) => { sent.push(message); return true; } };

    const rejectPrisma = { $queryRawUnsafe: async () => [{ id: PROFILE, status: 'rejected', email: 'andi@gmail.com', full_name: 'Andi' }] };
    const rejected = await new CommissionsService(rejectPrisma, undefined, mail).rejectApplication(ADMIN, PROFILE, 'NIK tidak sesuai');
    assert.equal(rejected.application.email, undefined, 'email tidak ikut dikembalikan ke klien');
    assert.equal(sent[0].to, 'andi@gmail.com');
    assert.match(sent[0].subject, /belum dapat disetujui/);
    assert.ok(sent[0].paragraphs.some(p => p.includes('NIK tidak sesuai')));

    const tx = {
        $queryRawUnsafe: async (sql) => {
            if (/FROM public\.proctor_profiles WHERE id/.test(sql)) return [{ id: PROFILE, user_id: 'u', status: 'pending', email: 'budi@gmail.com', full_name: 'Budi' }];
            if (/cbt_organization_members/.test(sql)) return [{ id: 'member' }];
            if (/cbt_roles/.test(sql)) return [{ id: 'role' }];
            return [{ id: PROFILE, status: 'approved' }];
        },
        $executeRawUnsafe: async () => 1,
    };
    const approvePrisma = { $transaction: async (fn) => fn(tx) };
    await new CommissionsService(approvePrisma, undefined, mail).approveApplication(ADMIN, PROFILE);
    assert.equal(sent[1].to, 'budi@gmail.com');
    assert.match(sent[1].subject, /disetujui/);
});
