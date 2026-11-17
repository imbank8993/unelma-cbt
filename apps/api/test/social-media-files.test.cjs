const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { identifySocialUpload, uploadedSocialMediaKey } = require('../src/social-media/social-media.files.ts');
const { signSocialMediaKey, verifySocialMediaKey } = require('../src/social-media/social-media.crypto.ts');
const { SocialMediaFilesService } = require('../src/social-media/social-media-files.service.ts');
const { validatePost } = require('../src/social-media/social-media.validation.ts');
process.env.JWT_SECRET = 'test-only-social-encryption-key-32-characters-long';
const owner = '11111111-1111-4111-8111-111111111111';
const filename = '33333333-3333-4333-8333-333333333333.png';
const key = `social-media/${owner}/${filename}`;
const signedUrl = () => `https://app.example.org/api/social-media/media/${owner}/${filename}?signature=${signSocialMediaKey(key)}`;
const file = (name, bytes) => ({ originalname: name, buffer: bytes, size: bytes.length });
const png = Buffer.from([137,80,78,71,13,10,26,10,0]);

test('upload verifies actual file bytes, type, and size rather than trusting MIME', () => {
  assert.equal(identifySocialUpload(file('photo.PNG', png)).contentType, 'image/png');
  assert.equal(identifySocialUpload(file('photo.jpeg', Buffer.from([255,216,255,224]))).extension, 'jpg');
  assert.equal(identifySocialUpload(file('video.mp4', Buffer.from('0000ftypisom'))).mediaType, 'video');
  for (const item of [undefined, file('bad.png', Buffer.from('<html>')), file('bad.svg', png), file('wrong.mp4', png)]) assert.throws(() => identifySocialUpload(item));
  const large = Buffer.alloc(8 * 1024 * 1024 + 1); png.copy(large);
  assert.throws(() => identifySocialUpload(file('large.png', large)), /maksimal 8 MB/);
  const video = Buffer.alloc(25 * 1024 * 1024 + 1); Buffer.from('0000ftypisom').copy(video);
  assert.throws(() => identifySocialUpload(file('large.mp4', video)), /maksimal 25 MB/);
});

test('public attachment signatures are scoped to one key and cannot access exam files', async () => {
  let reads = 0;
  const service = new SocialMediaFilesService({}, { getObject: async (_, range) => { reads++; return { contentType: 'image/png', range }; } });
  const signature = signSocialMediaKey(key);
  assert.equal(verifySocialMediaKey(key, signature), true);
  assert.equal(verifySocialMediaKey(key + 'other', signature), false);
  for (const args of [[owner, filename, ''], ['../exam', filename, signature], [owner, filename.replace('3333.png', '3334.png'), signature]]) await assert.rejects(service.publicFile(...args));
  assert.equal(reads, 0);
  assert.equal((await service.publicFile(owner, filename, signature, 'bytes=0-50')).range, 'bytes=0-50');
  await assert.rejects(service.publicFile(owner, filename, signature, 'bytes=0-5,7-9'));
  assert.equal(uploadedSocialMediaKey(signedUrl()), key);
  assert.throws(() => validatePost({ platform: 'instagram', caption: 'Post', mediaType: 'image', mediaUrl: signedUrl().replace(signature, 'a'.repeat(64)) }), /Lampiran tidak valid/);
});

test('upload requires an admin and uses dedicated R2 path and a signed app URL', async () => {
  const writes = [];
  const service = new SocialMediaFilesService({}, { putObject: async (...args) => { writes.push(args); return { success: true }; } });
  await assert.rejects(service.upload({ id: owner, roles: ['SISWA'] }, file('x.png', png), 'https://app.example.org'));
  assert.equal(writes.length, 0);
  const result = await service.upload({ id: owner, roles: ['ADMIN'] }, file('x.png', png), 'https://app.example.org');
  assert.ok(writes[0][0].startsWith(`social-media/${owner}/`));
  assert.equal(uploadedSocialMediaKey(result.media.url), writes[0][0]);
  assert.equal(result.media.name, 'x.png');
  assert.ok(!result.media.url.includes('/api/storage/file/'));
});

test('cleanup preserves every referenced file, fresh uploads, and unrelated directories', async () => {
  const old = new Date(Date.now() - 48 * 3600000), fresh = new Date();
  const used = key, unused = key.replace('3333.png', '4444.png'), recent = key.replace('3333.png', '5555.png');
  const objects = [{ key: used, size: 10, lastModified: old }, { key: unused, size: 20, lastModified: old }, { key: recent, size: 30, lastModified: fresh }, { key: 'exam/private.png', size: 100, lastModified: old }];
  const tx = { $queryRawUnsafe: async sql => sql.includes('advisory') ? [] : [{ media_url: signedUrl().replace(/signature=.*/, 'signature=old-rotated-key') }] };
  const prisma = { ...tx, $transaction: async callback => callback(tx) };
  const deleted = [];
  const storage = { listObjects: async () => ({ objects, truncated: false }), deleteObjects: async keys => { deleted.push(...keys); return { deleted: keys, failed: [] }; } };
  const service = new SocialMediaFilesService(prisma, storage);
  const admin = { id: owner, roles: ['ADMIN'] };
  assert.deepEqual((await service.usage(admin)).storage, { files: 3, bytes: 60, unusedFiles: 1, unusedBytes: 20, truncated: false });
  assert.deepEqual(await service.cleanup(admin), { deleted: 1, freedBytes: 20, failed: 0 });
  assert.deepEqual(deleted, [unused]);
  storage.listObjects = async () => ({ objects, truncated: true });
  await assert.rejects(service.cleanup(admin), /dibatalkan/);
  storage.listObjects = async () => ({ objects, truncated: false });
  tx.$queryRawUnsafe = async sql => { if (!sql.includes('advisory')) throw new Error('db down'); return []; };
  await assert.rejects(service.cleanup(admin));
  assert.deepEqual(deleted, [unused], 'Reference query failure must never delete files');
});

test('saving an uploaded attachment takes cleanup lock and rejects missing files', async () => {
  const calls = [];
  const tx = { $queryRawUnsafe: async () => calls.push('lock') };
  const storage = { objectMetadata: async () => { calls.push('head'); return { contentType: 'image/png' }; } };
  const service = new SocialMediaFilesService({ $transaction: async callback => callback(tx) }, storage);
  assert.equal(await service.guardSave(signedUrl(), async client => { assert.equal(client, tx); calls.push('save'); return 42; }), 42);
  assert.deepEqual(calls, ['lock', 'head', 'save']);
  storage.objectMetadata = async () => null;
  await assert.rejects(service.guardSave(signedUrl(), async () => { throw new Error('Must not save'); }), /tidak tersedia/);
});
