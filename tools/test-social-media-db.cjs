// Validates real PostgreSQL statements inside a transaction that ALWAYS rolls back.
// Refuses an existing Media Sosial installation; no existing application rows are modified.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
require('dotenv').config({ path: '.env', quiet: true });
require('ts-node').register({ project: path.resolve('apps/api/tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { SocialMediaService } = require('../apps/api/src/social-media/social-media.service.ts');
const { openCredentials } = require('../apps/api/src/social-media/social-media.crypto.ts');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  process.env.JWT_SECRET = 'temporary-social-test-key-never-written-to-env-or-database';
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 12000 });
  await client.connect();
  let transaction = false;
  try {
    const exists = await client.query("SELECT to_regclass('public.cbt_social_settings') AS settings, to_regclass('public.cbt_social_channels') AS channels, to_regclass('public.cbt_social_posts') AS posts");
    assert.ok(Object.values(exists.rows[0]).every(value => value === null), 'Use an isolated database: social tables already exist.');
    await client.query('BEGIN'); transaction = true;
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const sql = fs.readFileSync('database/migrations/20261117_02_social_media.sql', 'utf8').split('\n').filter(line => !/^\s*(BEGIN|COMMIT)\s*;/i.test(line)).join('\n');
    await client.query(sql); await client.query(sql); // migration is rerunnable
    const db = {
      $queryRawUnsafe: async (sql, ...args) => (await client.query(sql, args)).rows,
      $executeRawUnsafe: async (sql, ...args) => (await client.query(sql, args)).rowCount,
      $transaction: async callback => callback(db),
    };
    const user = { id: '11111111-1111-4111-8111-111111111111', roles: ['ADMIN'] };
    const id = '22222222-2222-4222-8222-222222222222';
    const channel = { id: 'fixture-channel', platform: 'instagram', organization_id: 'fixture-org', name: 'Fixture', external_account_id: '123', connected: true };
    let publishes = 0;
    const remote = { id: 'fixture-buffer-post', channelId: channel.id, text: 'SQL integration fixture', status: 'sent', schedulingType: 'automatic', externalLink: 'https://www.instagram.com/p/fixture/', sentAt: new Date().toISOString() };
    const provider = { organizations: async () => [{ id: 'fixture-org', name: 'Fixture' }], channels: async () => [channel],
      createPost: async () => { publishes++; return remote; }, post: async () => remote,
      metrics: async () => ({ metrics: { views: 9, reach: 6, interactions: 2 }, externalId: '987' }) };
    const service = new SocialMediaService(db, provider);
    await service.saveSettings(user, { bufferApiKey: 'fixture-buffer-secret' });
    const settingsCipher = (await client.query('SELECT credentials_cipher FROM public.cbt_social_settings')).rows[0].credentials_cipher;
    assert.ok(!settingsCipher.includes('fixture-buffer-secret'));
    assert.equal(openCredentials(settingsCipher, 'settings').bufferApiKey, 'fixture-buffer-secret');
    await service.syncChannels(user);
    await service.saveChannel(user, channel.id, { accessToken: 'fixture-meta-secret', accountId: '123' });
    const info = await service.channelSettings(user, channel.id);
    assert.equal(info.tokenSet, true); assert.ok(!JSON.stringify(info).includes('fixture-meta-secret'));
    await service.savePost(user, id, { platform: 'instagram', channelId: channel.id, caption: remote.text, mediaType: 'image', mediaUrl: 'https://media.example.org/fixture.jpg' });
    await Promise.all([service.publish(user, id), service.publish(user, id)]);
    assert.equal(publishes, 1);
    assert.equal((await service.syncPost(user, id)).post.metrics.views, 9);
    await assert.rejects(service.savePost(user, id, { platform: 'instagram', channelId: channel.id, caption: 'Changed', mediaType: 'image', mediaUrl: 'https://media.example.org/fixture.jpg' }), /tidak dapat diubah/);
    await assert.rejects(service.deletePost(user, id), /Hanya draf/);
    const workspace = await service.workspace(user);
    assert.equal(workspace.totals.published, 1); assert.equal(workspace.totals.views, 9);
    assert.equal(workspace.totals.reach, 6); assert.equal(workspace.totals.interactions, 2);
    assert.equal(workspace.channels[0].tokenSet, true);
    assert.ok(!JSON.stringify(workspace).includes('fixture-meta-secret'));
    assert.ok(!JSON.stringify(workspace).includes('fixture-buffer-secret'));
    await client.query('ROLLBACK'); transaction = false;
    const after = await client.query("SELECT to_regclass('public.cbt_social_settings') AS settings, to_regclass('public.cbt_social_channels') AS channels, to_regclass('public.cbt_social_posts') AS posts");
    assert.ok(Object.values(after.rows[0]).every(value => value === null));
    console.log('PASS: migration rerun, encrypted settings/channels, draft upsert, atomic publish, metrics and aggregation verified on PostgreSQL. ROLLBACK verified; no database changes persisted.');
  } finally {
    if (transaction) await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
