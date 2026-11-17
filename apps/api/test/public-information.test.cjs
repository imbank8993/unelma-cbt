const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { InformationService } = require('../src/information/information.service.ts');

const FOLDER = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const ADMIN = { id: '33333333-3333-4333-8333-333333333333', roles: ['ADMIN'] };
const STUDENT = { id: '44444444-4444-4444-8444-444444444444', roles: ['SISWA'] };
const pdf = { originalname: 'Panduan.pdf', size: 12, buffer: Buffer.from('%PDF-1.7\nbody') };

test('public listing only contains published PDFs and folders with visible files', async () => {
  const folders = [{ id: FOLDER, name: 'Panduan' }, { id: DOCUMENT, name: 'Kosong' }];
  const published = [{ id: DOCUMENT, folder_id: FOLDER, title: 'Panduan', published: true }];
  const prisma = { $queryRawUnsafe: async sql => {
    if (sql.includes('FROM public.cbt_information_folders')) return folders;
    assert.match(sql, /WHERE published = true/);
    return published;
  } };
  const service = new InformationService(prisma, {});
  assert.deepEqual(await service.list(), { folders: [folders[0]], documents: published });
});

test('only Admin can create folders and upload PDFs', async () => {
  const service = new InformationService({ $queryRawUnsafe: async () => { throw new Error('query must not run'); } },
    { putObject: async () => { throw new Error('upload must not run'); } });
  await assert.rejects(service.createFolder(STUDENT, { name: 'Panduan' }), /Hanya Admin/);
  await assert.rejects(service.upload(STUDENT, FOLDER, 'Panduan', pdf), /Hanya Admin/);
});

test('PDF upload verifies content and stores it under the dedicated R2 prefix', async () => {
  const calls = [];
  const prisma = { $queryRawUnsafe: async (sql, ...args) => {
    calls.push({ sql, args });
    if (sql.includes('FROM public.cbt_information_folders')) return [{ id: FOLDER }];
    if (sql.includes('INSERT INTO public.cbt_information_documents')) return [{ id: DOCUMENT, title: 'Panduan' }];
    throw new Error('Unexpected query');
  } };
  const storage = { putObject: async (key, body, type) => {
    assert.match(key, new RegExp(`^public-information/${FOLDER}/[0-9a-f-]+\\.pdf$`));
    assert.equal(body, pdf.buffer); assert.equal(type, 'application/pdf');
    return { success: true, key };
  } };
  const service = new InformationService(prisma, storage);
  await assert.rejects(service.upload(ADMIN, FOLDER, 'Panduan', { ...pdf, buffer: Buffer.from('not a pdf!!!') }), /PDF valid/);
  assert.equal((await service.upload(ADMIN, FOLDER, 'Panduan', pdf)).document.id, DOCUMENT);
  assert.equal(calls[1].args[0], FOLDER);
  assert.match(calls[1].args[3], /^public-information\//);
});

test('failed metadata write removes the new R2 object', async () => {
  let storedKey = '';
  let deletedKey = '';
  const service = new InformationService({ $queryRawUnsafe: async sql => {
    if (sql.includes('FROM public.cbt_information_folders')) return [{ id: FOLDER }];
    throw new Error('database unavailable');
  } }, {
    putObject: async key => { storedKey = key; return { success: true, key }; },
    deleteObject: async key => { deletedKey = key; return { success: true }; },
  });
  await assert.rejects(service.upload(ADMIN, FOLDER, 'Panduan', pdf), /database unavailable/);
  assert.equal(deletedKey, storedKey);
});

test('file lookup requires a published document before reading R2', async () => {
  let reads = 0;
  const service = new InformationService({ $queryRawUnsafe: async sql => {
    assert.match(sql, /published = true/);
    return [];
  } }, { getObject: async () => { reads++; return null; } });
  await assert.rejects(service.publicFile(DOCUMENT), /tidak ditemukan/);
  assert.equal(reads, 0);
});
