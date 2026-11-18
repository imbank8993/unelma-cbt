const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('ts-node').register({ project: path.resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { Reflector } = require('@nestjs/core');
const { of, firstValueFrom } = require('rxjs');
const { RolesGuard } = require('../src/auth/roles.guard.ts');
const { SocialMediaController } = require('../src/social-media/social-media.controller.ts');
const { SocialMediaService } = require('../src/social-media/social-media.service.ts');
const { SocialMediaProvider, SocialProviderError, insightValue } = require('../src/social-media/social-media.provider.ts');
const { sealCredentials, openCredentials } = require('../src/social-media/social-media.crypto.ts');
const { validatePost, publicMediaUrl, externalPostId, canonicalPostUrl } = require('../src/social-media/social-media.validation.ts');
const { StorageUrlsInterceptor } = require('../src/storage/storage-urls.interceptor.ts');
process.env.JWT_SECRET = 'test-only-social-encryption-key-32-characters-long';
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', roles: ['ADMIN'] };
const STUDENT = { id: '22222222-2222-4222-8222-222222222222', roles: ['SISWA'] };
const ID = '33333333-3333-4333-8333-333333333333';
const CHANNEL = { id: 'channel-1', platform: 'instagram', organization_id: 'org-1', name: 'Unelma', external_account_id: '123', connected: true };
const draft = () => ({ id: ID, platform: 'instagram', channel_id: CHANNEL.id, caption: 'Informasi Unelma', media_type: 'image', media_url: 'https://media.example.org/post.jpg',
  status: 'draft', buffer_post_id: null, external_post_id: null, external_url: null, ai_generated: false, metrics: {}, metrics_at: null, metrics_error: null });

test('API key encrypted with random nonce, context binding, and authenticated tamper detection', () => {
  const secret = { bufferApiKey: 'never-return-this-token' };
  const a = sealCredentials(secret, 'settings'), b = sealCredentials(secret, 'settings');
  assert.notEqual(a, b); assert.ok(!a.includes(secret.bufferApiKey));
  assert.deepEqual(openCredentials(a, 'settings'), secret);
  assert.throws(() => openCredentials(a, 'channel:other'), /Simpan ulang/);
  const bytes = Buffer.from(a.slice(3), 'base64'); bytes[35] ^= 1;
  assert.throws(() => openCredentials('v1:' + bytes.toString('base64'), 'settings'), /Simpan ulang/);
});

test('every social endpoint is protected by Admin roles; students and internal callers denied', async () => {
  const guard = new RolesGuard(new Reflector());
  const context = user => ({ getHandler: () => SocialMediaController.prototype.workspace, getClass: () => SocialMediaController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }) });
  assert.throws(() => guard.canActivate(context(STUDENT)), /Akses ditolak/);
  assert.throws(() => guard.canActivate(context(undefined)), /identitas pengguna/);
  assert.equal(guard.canActivate(context(ADMIN)), true);
  assert.equal(guard.canActivate(context({ ...ADMIN, roles: ['SUPERADMIN'] })), true);
  const service = new SocialMediaService({}, {});
  for (const action of [() => service.workspace(STUDENT), () => service.saveSettings(STUDENT, {}), () => service.syncChannels(STUDENT),
    () => service.saveChannel(STUDENT, CHANNEL.id, {}), () => service.channelSettings(STUDENT, CHANNEL.id),
    () => service.savePost(STUDENT, ID, {}), () => service.deletePost(STUDENT, ID), () => service.publish(STUDENT, ID),
    () => service.syncPost(STUDENT, ID), () => service.reconcile(STUDENT, ID, {})]) await assert.rejects(action(), /Hanya Admin/);
});

test('public media URLs do not bypass the authenticated storage gateway on other controllers', async () => {
  const interceptor = new StorageUrlsInterceptor({ protectUrls: () => 'protected' });
  const handler = { handle: () => of('https://media.example.org/promo.jpg') };
  assert.equal(await firstValueFrom(interceptor.intercept({ getClass: () => SocialMediaController }, handler)), 'https://media.example.org/promo.jpg');
  assert.equal(await firstValueFrom(interceptor.intercept({ getClass: () => class ExamController {} }, handler)), 'protected');
});

test('composer validates platform/media combinations and rejects private or authenticated media URLs', () => {
  for (const url of ['http://example.org/a.jpg', 'https://localhost/a', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://user:pass@example.org/a.jpg', 'file:///secret']) {
    assert.throws(() => publicMediaUrl(url), /HTTPS publik/);
  }
  assert.equal(publicMediaUrl('https://media.example.org/a.mp4'), 'https://media.example.org/a.mp4');
  assert.throws(() => validatePost({ platform: 'tiktok', mediaType: 'text', caption: 'Hello' }), /memerlukan gambar/);
  assert.throws(() => validatePost({ platform: 'instagram', mediaType: 'image', caption: 'x'.repeat(2201), mediaUrl: 'https://a.example.org/a.jpg' }), /2200/);
  assert.equal(validatePost({ platform: 'facebook', mediaType: 'text', caption: 'Informasi' }).mediaUrl, null);
  assert.equal(validatePost({ platform: 'instagram', mediaType: 'image', caption: 'Draf caption' }).mediaUrl, null);
  assert.throws(() => validatePost({ platform: 'instagram', mediaType: 'image', caption: 'Draf caption' }, true), /Tambahkan gambar atau video/);
  assert.throws(() => validatePost(null), /permintaan tidak valid/);
});

test('settings responses expose presence flags, not the stored Buffer key', async () => {
  const row = { credentials_cipher: sealCredentials({ bufferApiKey: 'buffer-private-key' }, 'settings'), organization_id: 'org-1', graph_version: 'v26.0' };
  const service = new SocialMediaService({ $queryRawUnsafe: async () => [row] }, {});
  const result = await service.settings();
  assert.equal(result.bufferKeySet, true);
  assert.ok(!JSON.stringify(result).includes('buffer-private-key'));
  assert.ok(!JSON.stringify(result).includes('credentials_cipher'));
});

test('blank key preserves existing secret and replacement/clear is encrypted in a transaction', async () => {
  const row = { credentials_cipher: sealCredentials({ bufferApiKey: 'original-key' }, 'settings'), organization_id: 'org-1', graph_version: 'v26.0' };
  const tx = { $queryRawUnsafe: async () => [{ ...row }], $executeRawUnsafe: async (sql, ...args) => {
    if (sql.startsWith('UPDATE public.cbt_social_settings SET credentials_cipher')) {
      row.credentials_cipher = args[0]; row.organization_id = args[1]; row.graph_version = args[2];
    }
    return 1;
  } };
  const service = new SocialMediaService({ ...tx, $transaction: async callback => callback(tx) }, {});
  await service.saveSettings(ADMIN, { graphVersion: 'v25.0', bufferApiKey: '' });
  assert.equal(openCredentials(row.credentials_cipher, 'settings').bufferApiKey, 'original-key');
  await service.saveSettings(ADMIN, { bufferApiKey: 'replacement' });
  assert.equal(openCredentials(row.credentials_cipher, 'settings').bufferApiKey, 'replacement');
  await service.saveSettings(ADMIN, { clearBufferKey: true });
  assert.deepEqual(openCredentials(row.credentials_cipher, 'settings'), {});
});

function publishFixture(provider, credentials) {
  const post = draft();
  const channel = { ...CHANNEL, ...(credentials ? { credentials_cipher: sealCredentials(credentials, `channel:${CHANNEL.id}`) } : {}) };
  const row = { credentials_cipher: sealCredentials({ bufferApiKey: 'buffer-test-key' }, 'settings'), organization_id: 'org-1', graph_version: 'v26.0' };
  const prisma = {
    $queryRawUnsafe: async (sql, ...args) => {
      if (sql.includes('FROM public.cbt_social_settings')) return [row];
      if (sql.includes('FROM public.cbt_social_channels')) return [channel];
      if (sql.includes("SET status = 'sending'")) {
        if (!['draft', 'failed'].includes(post.status) || post.buffer_post_id) return [];
        post.status = 'sending'; return [{ ...post }];
      }
      if (sql.includes('FROM public.cbt_social_posts')) return [{ ...post }];
      throw new Error('Unexpected SQL: ' + sql);
    },
    $executeRawUnsafe: async (sql, ...args) => {
      if (sql.includes('SET buffer_post_id')) {
        if (post.status === 'published' && args[2] !== 'published') return 0;
        Object.assign(post, { buffer_post_id: args[1], status: args[2], external_url: args[3] || post.external_url, external_post_id: post.external_post_id || args[4], error: args[5], published_at: args[6] || post.published_at });
      }
      else if (sql.includes('SET metrics =')) Object.assign(post, { metrics: JSON.parse(args[1]), metrics_at: sql.includes('external_post_id = $3') ? new Date().toISOString() : args[2] || new Date().toISOString(), metrics_error: null });
      else if (sql.includes('SET metrics_error = NULL')) post.metrics_error = null;
      else if (sql.includes('SET status = $2')) Object.assign(post, { status: args[1], error: args[2] });
      else if (sql.includes('SET metrics_error')) post.metrics_error = args[1];
      else throw new Error('Unexpected SQL: ' + sql);
      return 1;
    },
  };
  return { service: new SocialMediaService(prisma, provider), post };
}

test('concurrent publish and retries cause a single external publish', async () => {
  let calls = 0;
  const { service, post } = publishFixture({ createPost: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 20));
    return { id: 'buffer-1', channelId: CHANNEL.id, status: 'sent', schedulingType: 'automatic', externalLink: 'https://www.instagram.com/p/example/', sentAt: new Date().toISOString() };
  } });
  await Promise.all([service.publish(ADMIN, ID), service.publish(ADMIN, ID)]);
  await service.publish(ADMIN, ID);
  assert.equal(calls, 1); assert.equal(post.status, 'published'); assert.equal(post.buffer_post_id, 'buffer-1');
});

test('ambiguous network failure locks publishing instead of sending again', async () => {
  let calls = 0;
  const { service, post } = publishFixture({ createPost: async () => { calls++; throw new SocialProviderError('Koneksi terputus', false); } });
  await service.publish(ADMIN, ID); await service.publish(ADMIN, ID);
  assert.equal(post.status, 'uncertain'); assert.equal(calls, 1);
});

test('explicit rejection may be corrected; an accepted Buffer job is processing rather than published', async () => {
  const failed = publishFixture({ createPost: async () => { throw new SocialProviderError('Token ditolak', true); } });
  await failed.service.publish(ADMIN, ID); assert.equal(failed.post.status, 'failed');
  const pending = publishFixture({ createPost: async () => ({ id: 'buffer-2', channelId: CHANNEL.id, status: 'sending', schedulingType: 'automatic' }) });
  await pending.service.publish(ADMIN, ID); assert.equal(pending.post.status, 'processing');
});

test('unavailable metrics remain null and real zero stays zero', () => {
  assert.equal(insightValue([], 'views'), null);
  assert.equal(insightValue([{ name: 'views', values: [] }], 'views'), null);
  assert.equal(insightValue([{ name: 'views', values: [{ value: 0 }] }], 'views'), 0);
  assert.equal(insightValue([{ name: 'views', total_value: { value: 23 } }], 'views'), 23);
  assert.equal(insightValue([{ name: 'views', values: [{ value: -1 }] }], 'views'), null);
});

test('a processing post is reconciled with Buffer without publishing it again, even without a Meta token', async () => {
  const { service, post } = publishFixture({
    post: async () => ({ id: 'buffer-1', channelId: CHANNEL.id, status: 'sent', externalLink: 'https://www.instagram.com/p/target/', sentAt: '2026-11-18T13:44:09Z' }),
    postMetrics: async () => null,
    createPost: async () => { throw new Error('Must not republish'); },
  });
  Object.assign(post, { status: 'processing', buffer_post_id: 'buffer-1' });
  const result = await service.syncPost(ADMIN, ID);
  assert.equal(result.post.status, 'published');
  assert.equal(result.post.external_url, 'https://www.instagram.com/p/target/');
  assert.equal(result.post.published_at, '2026-11-18T13:44:09Z');
  assert.equal(result.post.metrics_at, null);
  assert.equal(result.post.metrics_error, null);
  assert.deepEqual(result.post.metrics, {});
});

test('Buffer metrics are available without native credentials and keep the network refresh time', async () => {
  const snapshot = { metrics: { views: 0, reach: 12, interactions: 4, source: 'buffer' }, updatedAt: '2026-11-18T14:00:00Z' };
  const { service, post } = publishFixture({ post: async () => ({ id: 'buffer-1', channelId: CHANNEL.id, status: 'sent' }), postMetrics: async () => snapshot });
  Object.assign(post, { status: 'published', buffer_post_id: 'buffer-1' });
  const result = await service.syncPost(ADMIN, ID);
  assert.deepEqual(result.post.metrics, snapshot.metrics);
  assert.equal(result.post.metrics_at, snapshot.updatedAt);
});

test('missing Buffer data preserves previous metrics and late status snapshots never revert a published post', async () => {
  const { service, post } = publishFixture({ post: async () => ({ id: 'buffer-1', channelId: CHANNEL.id, status: 'sending' }), postMetrics: async () => null });
  Object.assign(post, { status: 'published', buffer_post_id: 'buffer-1', metrics: { views: 42 }, metrics_at: '2026-11-18T14:00:00Z' });
  const result = await service.syncPost(ADMIN, ID);
  assert.equal(result.post.status, 'published');
  assert.deepEqual(result.post.metrics, { views: 42 });
  assert.equal(result.post.metrics_at, '2026-11-18T14:00:00Z');
});

test('native Insights failures fall back to Buffer, while unavailable Buffer permissions keep a useful error', async () => {
  const { service, post } = publishFixture({
    post: async () => ({ id: 'buffer-1', channelId: CHANNEL.id, status: 'sent' }),
    metrics: async () => { throw new SocialProviderError('Token Meta kedaluwarsa'); },
    postMetrics: async () => { throw new SocialProviderError('Buffer menolak izin Insights'); },
  }, { accessToken: 'expired-meta-token' });
  Object.assign(post, { status: 'published', buffer_post_id: 'buffer-1', metrics: { views: 42 } });
  const result = await service.syncPost(ADMIN, ID);
  assert.equal(result.post.status, 'published');
  assert.deepEqual(result.post.metrics, { views: 42 });
  assert.match(result.post.metrics_error, /Meta kedaluwarsa.*Buffer menolak izin/);
});

test('Buffer metric mapping avoids duplicate view counts, missing-as-zero, and cross-account data', async () => {
  const original = global.fetch;
  let metricRows = null, channelId = CHANNEL.id;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.buffer.com');
    const request = JSON.parse(options.body);
    assert.match(request.query, /metricsUpdatedAt/);
    return new Response(JSON.stringify({ data: { post: { id: 'buffer-1', channelId, metrics: metricRows, metricsUpdatedAt: '2026-11-18T14:00:00Z' } } }));
  };
  try {
    const provider = new SocialMediaProvider(), post = { ...draft(), buffer_post_id: 'buffer-1' };
    assert.equal(await provider.postMetrics('buffer-key', post), null);
    metricRows = [{ type: 'views', value: 0, unit: 'count' }, { type: 'impressions', value: 20, unit: 'count' }, { type: 'reactions', value: 2, unit: 'count' }];
    assert.deepEqual((await provider.postMetrics('buffer-key', post)).metrics, { views: 0, reach: null, interactions: null, source: 'buffer' });
    metricRows = ['reactions', 'comments', 'shares', 'saves'].map(type => ({ type, value: 1, unit: 'count' }));
    assert.equal((await provider.postMetrics('buffer-key', post)).metrics.interactions, 4);
    channelId = 'other-account';
    await assert.rejects(provider.postMetrics('buffer-key', post), /tidak cocok/);
  } finally { global.fetch = original; }
});

test('TikTok video queries use the native ID and never invent unique reach', async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/open.tiktokapis.com\/v2\/video\/query\//);
    assert.deepEqual(JSON.parse(options.body).filters.video_ids, ['987654321']);
    assert.equal(options.headers.Authorization, 'Bearer tiktok-token');
    return new Response(JSON.stringify({ data: { videos: [{ id: '987654321', view_count: 12, like_count: 2, comment_count: 1, share_count: 0 }] }, error: { code: 'ok' } }));
  };
  try {
    const result = await new SocialMediaProvider().metrics({ ...draft(), platform: 'tiktok', external_url: 'https://www.tiktok.com/@unelma/video/987654321' },
      { ...CHANNEL, platform: 'tiktok' }, { accessToken: 'tiktok-token' }, 'v26.0');
    assert.deepEqual(result.metrics, { views: 12, reach: null, interactions: 3 });
  } finally { global.fetch = original; }
});

test('Buffer GraphQL mutation requests automatic publish and handles union failures without leaking keys', async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.buffer.com');
    const body = JSON.parse(options.body);
    assert.match(body.query, /PostActionSuccess/);
    assert.deepEqual(body.variables.input.assets, [{ image: { url: 'https://media.example.org/post.jpg' } }]);
    assert.equal(body.variables.input.mode, 'shareNow'); assert.equal(body.variables.input.schedulingType, 'automatic');
    assert.equal(body.variables.input.metadata.instagram.shouldShareToFeed, true);
    return new Response(JSON.stringify({ data: { createPost: { __typename: 'InvalidInputError' } } }));
  };
  try { await assert.rejects(new SocialMediaProvider().createPost('do-not-leak-key', draft()), error => error.definitive && !error.message.includes('do-not-leak-key')); }
  finally { global.fetch = original; }
});

test('Instagram resolves its exact permalink and preserves zero and unavailable metrics independently', async () => {
  const original = global.fetch;
  const metricsRequested = [];
  global.fetch = async (target, options) => {
    const url = new URL(target);
    assert.equal(url.hostname, 'graph.facebook.com');
    assert.equal(options.headers.Authorization, 'Bearer instagram-token');
    if (url.pathname.endsWith('/123/media')) return new Response(JSON.stringify({ data: [
      { id: '111', permalink: 'https://www.instagram.com/p/other/' }, { id: '222', permalink: 'https://www.instagram.com/p/target/' },
    ] }));
    assert.equal(url.pathname, '/v26.0/222/insights');
    const metric = url.searchParams.get('metric'); metricsRequested.push(metric);
    return new Response(JSON.stringify({ data: metric === 'total_interactions' ? [] : [{ name: metric, values: [{ value: metric === 'views' ? 0 : 5 }] }] }));
  };
  try {
    const result = await new SocialMediaProvider().metrics({ ...draft(), external_url: 'https://www.instagram.com/p/target/?igsh=tracking' }, CHANNEL, { accessToken: 'instagram-token' }, 'v26.0');
    assert.equal(result.externalId, '222');
    assert.deepEqual(result.metrics, { views: 0, reach: 5, interactions: null });
    assert.deepEqual(metricsRequested.sort(), ['reach', 'total_interactions', 'views']);
  } finally { global.fetch = original; }
});

test('Facebook uses current media-view metrics and adds reactions, comments, and shares', async () => {
  const original = global.fetch;
  global.fetch = async target => {
    const url = new URL(target);
    if (url.pathname.endsWith('/insights')) {
      const metric = url.searchParams.get('metric');
      assert.ok(['post_media_view', 'post_total_media_view_unique'].includes(metric));
      return new Response(JSON.stringify({ data: [{ name: metric, values: [{ value: metric === 'post_media_view' ? 40 : 19 }] }] }));
    }
    assert.equal(url.pathname, '/v26.0/123_456');
    return new Response(JSON.stringify({ reactions: { summary: { total_count: 2 } }, comments: { summary: { total_count: 3 } }, shares: { count: 1 } }));
  };
  try {
    const result = await new SocialMediaProvider().metrics({ ...draft(), platform: 'facebook', external_url: 'https://www.facebook.com/123/posts/456/' }, { ...CHANNEL, platform: 'facebook' }, { accessToken: 'facebook-token' }, 'v26.0');
    assert.deepEqual(result.metrics, { views: 40, reach: 19, interactions: 6 });
  } finally { global.fetch = original; }
});

test('native post IDs are derived only from the correct social network host', () => {
  assert.equal(externalPostId('facebook', 'https://www.facebook.com/story.php?story_fbid=456&id=123', '123'), '123_456');
  assert.equal(externalPostId('tiktok', 'https://www.tiktok.com/@unelma/video/987', 'ignored'), '987');
  assert.equal(externalPostId('tiktok', 'https://evil.example/video/987', 'ignored'), null);
  assert.notEqual(canonicalPostUrl('https://www.facebook.com/story.php?story_fbid=a&id=123'), canonicalPostUrl('https://www.facebook.com/story.php?story_fbid=b&id=123'));
});
