import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import { PrismaService } from '../prisma/prisma.service';
import { isAdminUser } from '../common/creation-limits';
import { openCredentials, sealCredentials } from './social-media.crypto';
import { SocialMediaProvider, SocialProviderError } from './social-media.provider';
import { externalPostId, field, recordInput, secretField, validatePost } from './social-media.validation';
import type { BufferPost, ChannelCredentials, SocialChannel, SocialPost } from './social-media.types';
import { SocialMediaFilesService } from './social-media-files.service';
import { uploadedSocialMediaKey } from './social-media.files';

interface SettingsRow { credentials_cipher: string; organization_id: string; graph_version: string; updated_at: Date }
const POST_COLUMNS = `id, platform, channel_id, caption, media_type, media_url, ai_generated, status,
  buffer_post_id, external_post_id, external_url, error, metrics, metrics_at, metrics_error, created_at, updated_at, published_at`;
const CHANNEL_COLUMNS = 'id, platform, organization_id, name, external_account_id, connected';
const providerMessage = (error: unknown) => error instanceof SocialProviderError ? error.message : 'Permintaan media sosial belum dapat diproses. Coba lagi nanti.';

@Injectable()
export class SocialMediaService {
  constructor(private readonly prisma: PrismaService, private readonly provider: SocialMediaProvider, private readonly files: SocialMediaFilesService) {}

  assertAdmin(user: AuthUser): void {
    if (!user || !isAdminUser(user)) throw new ForbiddenException('Hanya Admin yang dapat mengelola Media Sosial.');
  }

  private async settingsRow(): Promise<SettingsRow | null> {
    const [row] = await this.prisma.$queryRawUnsafe<SettingsRow[]>('SELECT credentials_cipher, organization_id, graph_version, updated_at FROM public.cbt_social_settings WHERE id = true');
    return row || null;
  }

  private async config() {
    const row = await this.settingsRow();
    const credentials = openCredentials<{ bufferApiKey?: string }>(row?.credentials_cipher, 'settings');
    return { key: credentials.bufferApiKey || '', organizationId: row?.organization_id || '', graphVersion: row?.graph_version || 'v26.0' };
  }

  async settings() {
    const row = await this.settingsRow();
    const credentials = openCredentials<{ bufferApiKey?: string }>(row?.credentials_cipher, 'settings');
    return { bufferKeySet: Boolean(credentials.bufferApiKey), organizationId: row?.organization_id || '', graphVersion: row?.graph_version || 'v26.0', updatedAt: row?.updated_at || null };
  }

  async saveSettings(user: AuthUser, body: Record<string, unknown>) {
    this.assertAdmin(user);
    recordInput(body);
    const key = body.bufferApiKey ? secretField(body.bufferApiKey) : undefined;
    const organization = body.organizationId !== undefined ? field(body.organizationId, 'Organisasi Buffer') : undefined;
    const version = body.graphVersion !== undefined ? field(body.graphVersion, 'Versi Graph API', 10) : undefined;
    if (version && !/^v\d{2}\.0$/.test(version)) throw new BadRequestException('Versi Graph API harus berformat v26.0.');
    if (body.clearBufferKey !== undefined && typeof body.clearBufferKey !== 'boolean') throw new BadRequestException('Pilihan hapus API key tidak valid.');
    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`INSERT INTO public.cbt_social_settings (credentials_cipher) VALUES ($1) ON CONFLICT DO NOTHING`, sealCredentials({}, 'settings'));
      const [row] = await tx.$queryRawUnsafe<SettingsRow[]>('SELECT credentials_cipher, organization_id, graph_version, updated_at FROM public.cbt_social_settings WHERE id = true FOR UPDATE');
      let credentials: { bufferApiKey?: string };
      try { credentials = openCredentials(row.credentials_cipher, 'settings'); }
      catch (error) { if (key || body.clearBufferKey === true) credentials = {}; else throw error; }
      if (body.clearBufferKey === true) delete credentials.bufferApiKey;
      else if (key) credentials.bufferApiKey = key;
      if (key || body.clearBufferKey || (organization !== undefined && organization !== row.organization_id)) {
        await tx.$executeRawUnsafe('UPDATE public.cbt_social_channels SET connected = false');
      }
      await tx.$executeRawUnsafe(`UPDATE public.cbt_social_settings SET credentials_cipher = $1, organization_id = $2,
        graph_version = $3, updated_by = $4::uuid, updated_at = now() WHERE id = true`,
        sealCredentials(credentials, 'settings'), organization ?? row.organization_id, version || row.graph_version, user.id);
    });
    return { settings: await this.settings() };
  }

  async workspace(user: AuthUser) {
    this.assertAdmin(user);
    const settings = await this.settings();
    const [channels, posts, totals] = await Promise.all([
      this.prisma.$queryRawUnsafe<(SocialChannel & { token_set: boolean })[]>(`SELECT ${CHANNEL_COLUMNS},
        credentials_cipher IS NOT NULL AS token_set FROM public.cbt_social_channels WHERE organization_id = $1 ORDER BY platform, name`, settings.organizationId),
      this.prisma.$queryRawUnsafe<SocialPost[]>(`SELECT ${POST_COLUMNS} FROM public.cbt_social_posts ORDER BY created_at DESC LIMIT 100`),
      this.prisma.$queryRawUnsafe<{ published: number; drafts: number; views: number | null; reach: number | null; interactions: number | null; measured: number }[]>(`
        SELECT count(*) FILTER (WHERE status = 'published')::int AS published,
          count(*) FILTER (WHERE status = 'draft')::int AS drafts,
          sum((metrics->>'views')::float8) FILTER (WHERE status = 'published') AS views,
          sum((metrics->>'reach')::float8) FILTER (WHERE status = 'published') AS reach,
          sum((metrics->>'interactions')::float8) FILTER (WHERE status = 'published') AS interactions,
          count(*) FILTER (WHERE metrics_at IS NOT NULL AND status = 'published')::int AS measured FROM public.cbt_social_posts`),
    ]);
    return { settings, channels: channels.map(({ token_set, ...channel }) => ({ ...channel, tokenSet: token_set })), posts,
      totals: totals[0] || { published: 0, drafts: 0, views: null, reach: null, interactions: null, measured: 0 } };
  }

  async syncChannels(user: AuthUser) {
    this.assertAdmin(user);
    const config = await this.config();
    if (!config.key) throw new BadRequestException('Isi API key Buffer di Pengaturan terlebih dahulu.');
    try {
      const organizations = await this.provider.organizations(config.key);
      const chosen = organizations.find(org => org.id === config.organizationId) || (organizations.length === 1 ? organizations[0] : null);
      if (!chosen) return { organizations, needsOrganization: true };
      const channels = await this.provider.channels(config.key, chosen.id);
      await this.prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('UPDATE public.cbt_social_settings SET organization_id = $1 WHERE id = true', chosen.id);
        await tx.$executeRawUnsafe('UPDATE public.cbt_social_channels SET connected = false');
        for (const channel of channels) await tx.$executeRawUnsafe(`INSERT INTO public.cbt_social_channels
          (id, platform, organization_id, name, external_account_id, connected, updated_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7::uuid) ON CONFLICT (id) DO UPDATE SET
          platform = EXCLUDED.platform, organization_id = EXCLUDED.organization_id, name = EXCLUDED.name,
          external_account_id = EXCLUDED.external_account_id, connected = EXCLUDED.connected, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          channel.id, channel.platform, chosen.id, channel.name, channel.external_account_id, channel.connected, user.id);
      });
      return { organizations, needsOrganization: false, count: channels.length };
    } catch (error) { if (error instanceof SocialProviderError) throw new BadRequestException(error.message); throw error; }
  }

  private async channel(id: string): Promise<SocialChannel> {
    const [row] = await this.prisma.$queryRawUnsafe<SocialChannel[]>(`SELECT ${CHANNEL_COLUMNS}, credentials_cipher FROM public.cbt_social_channels WHERE id = $1`, id);
    if (!row) throw new NotFoundException('Akun media sosial tidak ditemukan.');
    return row;
  }

  async saveChannel(user: AuthUser, id: string, body: Record<string, unknown>) {
    this.assertAdmin(user);
    recordInput(body);
    await this.prisma.$transaction(async tx => {
      const [row] = await tx.$queryRawUnsafe<SocialChannel[]>('SELECT id, platform, credentials_cipher FROM public.cbt_social_channels WHERE id = $1 FOR UPDATE', id);
      if (!row) throw new NotFoundException('Akun media sosial tidak ditemukan.');
      let credentials: ChannelCredentials = {};
      try { credentials = body.clearCredentials === true ? {} : openCredentials<ChannelCredentials>(row.credentials_cipher, `channel:${id}`); }
      catch (error) { if (!body.accessToken) throw error; }
      for (const name of ['accessToken', 'refreshToken', 'clientKey', 'clientSecret'] as const) {
        if (body[name]) credentials[name] = secretField(body[name]);
      }
      if (body.accountId !== undefined) {
        credentials.accountId = field(body.accountId, 'ID akun statistik', 160);
        if (row.platform !== 'tiktok' && credentials.accountId && !/^\d+$/.test(credentials.accountId)) throw new BadRequestException('ID akun Meta harus berupa angka.');
      }
      if (body.accessToken) delete credentials.expiresAt;
      await tx.$executeRawUnsafe(`UPDATE public.cbt_social_channels SET credentials_cipher = $1, updated_by = $2::uuid,
        updated_at = now() WHERE id = $3`, credentials.accessToken ? sealCredentials(credentials, `channel:${id}`) : null, user.id, id);
    });
    return { saved: true };
  }

  async channelSettings(user: AuthUser, id: string) {
    this.assertAdmin(user);
    const channel = await this.channel(id);
    let credentials: ChannelCredentials = {};
    let credentialsUnreadable = false;
    try { credentials = openCredentials<ChannelCredentials>(channel.credentials_cipher, `channel:${id}`); }
    catch { credentialsUnreadable = true; }
    return { accountId: credentials.accountId || channel.external_account_id, tokenSet: Boolean(credentials.accessToken),
      refreshTokenSet: Boolean(credentials.refreshToken), clientKeySet: Boolean(credentials.clientKey), clientSecretSet: Boolean(credentials.clientSecret), credentialsUnreadable };
  }

  private async post(id: string): Promise<SocialPost> {
    const [row] = await this.prisma.$queryRawUnsafe<SocialPost[]>(`SELECT ${POST_COLUMNS} FROM public.cbt_social_posts WHERE id = $1::uuid`, id);
    if (!row) throw new NotFoundException('Posting tidak ditemukan.');
    return row;
  }

  async savePost(user: AuthUser, id: string, body: Record<string, unknown>) {
    this.assertAdmin(user);
    const draft = validatePost(body);
    if (draft.channelId && (await this.channel(draft.channelId)).platform !== draft.platform) throw new BadRequestException('Akun tidak sesuai dengan platform posting.');
    const save = (client: Pick<PrismaService, '$queryRawUnsafe'>) => client.$queryRawUnsafe<SocialPost[]>(`INSERT INTO public.cbt_social_posts
      (id, platform, channel_id, caption, media_type, media_url, ai_generated, created_by, updated_by)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::uuid, $8::uuid)
      ON CONFLICT (id) DO UPDATE SET platform = EXCLUDED.platform, channel_id = EXCLUDED.channel_id,
        caption = EXCLUDED.caption, media_type = EXCLUDED.media_type, media_url = EXCLUDED.media_url,
        ai_generated = EXCLUDED.ai_generated, updated_by = EXCLUDED.updated_by, status = 'draft', error = NULL, updated_at = now()
      WHERE cbt_social_posts.status IN ('draft', 'failed') AND cbt_social_posts.buffer_post_id IS NULL RETURNING ${POST_COLUMNS}`,
      id, draft.platform, draft.channelId, draft.caption, draft.mediaType, draft.mediaUrl, draft.aiGenerated, user.id);
    const [post] = draft.mediaUrl && uploadedSocialMediaKey(draft.mediaUrl) ?
      await this.files.guardSave(draft.mediaUrl, save) : await save(this.prisma);
    if (!post) throw new ConflictException('Posting ini sudah dikirim atau sedang diproses dan tidak dapat diubah.');
    return { post };
  }

  async deletePost(user: AuthUser, id: string) {
    this.assertAdmin(user);
    const count = await this.prisma.$executeRawUnsafe(`DELETE FROM public.cbt_social_posts WHERE id = $1::uuid
      AND status IN ('draft', 'failed') AND buffer_post_id IS NULL`, id);
    if (!count) throw new ConflictException('Hanya draf yang belum dikirim yang dapat dihapus.');
    return { deleted: true };
  }

  private async recordBuffer(post: SocialPost, remote: BufferPost) {
    if (remote.channelId !== post.channel_id) throw new ConflictException('Akun posting Buffer tidak sesuai dengan draf ini.');
    const channel = await this.channel(post.channel_id!);
    const status = remote.schedulingType === 'notification' ? 'failed' : remote.status === 'sent' ? 'published' :
      remote.status === 'error' ? 'failed' : 'processing';
    const error = remote.schedulingType === 'notification' ? 'Akun ini memerlukan penyelesaian manual di Buffer. Aktifkan publikasi otomatis untuk posting berikutnya.' :
      remote.status === 'error' ? 'Publikasi ditolak platform. Buka Buffer untuk melihat penyebab dan memperbaikinya.' :
      ['draft', 'needs_approval'].includes(remote.status) ? 'Posting tertahan di Buffer. Periksa persetujuan atau status draf di Buffer.' : null;
    const link = remote.externalLink && /^https:\/\/(?:[^/]+\.)?(?:instagram\.com|facebook\.com|tiktok\.com)\//i.test(remote.externalLink) ? remote.externalLink : null;
    await this.prisma.$executeRawUnsafe(`UPDATE public.cbt_social_posts SET buffer_post_id = $2, status = $3,
      external_url = COALESCE($4, external_url), external_post_id = COALESCE(external_post_id, $5), error = $6,
      published_at = COALESCE(published_at, $7::timestamptz), updated_at = now() WHERE id = $1::uuid`,
      post.id, remote.id, status, link, externalPostId(post.platform, link, channel.external_account_id), error,
      status === 'published' ? remote.sentAt || new Date().toISOString() : null);
  }

  async publish(user: AuthUser, id: string) {
    this.assertAdmin(user);
    const current = await this.post(id);
    if (current.buffer_post_id || !['draft', 'failed'].includes(current.status)) return { post: current };
    validatePost({ platform: current.platform, channelId: current.channel_id, caption: current.caption, mediaType: current.media_type, mediaUrl: current.media_url, aiGenerated: current.ai_generated }, true);
    const config = await this.config();
    if (!config.key || !config.organizationId) throw new BadRequestException('Lengkapi API key dan sinkronkan akun Buffer melalui Pengaturan.');
    if (!current.channel_id) throw new BadRequestException('Pilih akun tujuan sebelum mempublikasikan.');
    const channel = await this.channel(current.channel_id);
    if (!channel.connected || channel.organization_id !== config.organizationId || channel.platform !== current.platform) throw new BadRequestException('Akun tujuan belum terhubung. Sinkronkan akun Buffer pada Pengaturan.');
    // Claim tunggal sebelum efek eksternal. Request serentak/retry tidak mengirim dua kali.
    const [claimed] = await this.prisma.$queryRawUnsafe<SocialPost[]>(`UPDATE public.cbt_social_posts
      SET status = 'sending', error = NULL, published_by = $2::uuid, updated_at = now()
      WHERE id = $1::uuid AND status IN ('draft', 'failed') AND buffer_post_id IS NULL
        AND channel_id IS NOT DISTINCT FROM $3 AND caption = $4 AND media_type = $5
        AND media_url IS NOT DISTINCT FROM $6 AND platform = $7 AND ai_generated = $8
      RETURNING ${POST_COLUMNS}`, id, user.id, current.channel_id, current.caption, current.media_type, current.media_url, current.platform, current.ai_generated);
    if (!claimed) {
      const latest = await this.post(id);
      if (['draft', 'failed'].includes(latest.status) && !latest.buffer_post_id) throw new ConflictException('Draf berubah saat diperiksa. Muat ulang draf dan periksa pratinjau sebelum mengirim.');
      return { post: latest };
    }
    let remote: BufferPost;
    try { remote = await this.provider.createPost(config.key, claimed); }
    catch (error) {
      const status = error instanceof SocialProviderError && error.definitive ? 'failed' : 'uncertain';
      await this.prisma.$executeRawUnsafe('UPDATE public.cbt_social_posts SET status = $2, error = $3, updated_at = now() WHERE id = $1::uuid', id, status, providerMessage(error));
      return { post: await this.post(id) };
    }
    // Kegagalan DB sesudah Buffer menerima posting dibiarkan terkunci, tidak dikirim ulang.
    await this.recordBuffer(claimed, remote);
    return { post: await this.post(id) };
  }

  async syncPost(user: AuthUser, id: string) {
    this.assertAdmin(user);
    let post = await this.post(id);
    const config = await this.config();
    if (post.buffer_post_id && config.key) {
      try { await this.recordBuffer(post, await this.provider.post(config.key, post.buffer_post_id)); }
      catch (error) { throw new BadRequestException(providerMessage(error)); }
      post = await this.post(id);
    }
    if (post.status !== 'published') return { post };
    if (!post.channel_id) return { post };
    const channel = await this.channel(post.channel_id);
    let credentials = openCredentials<ChannelCredentials>(channel.credentials_cipher, `channel:${channel.id}`);
    try {
      if (post.platform === 'tiktok' && (!credentials.expiresAt || credentials.expiresAt < Date.now() + 60000) && credentials.refreshToken) {
        credentials = await this.provider.refreshTikTok(credentials);
        const written = await this.prisma.$executeRawUnsafe('UPDATE public.cbt_social_channels SET credentials_cipher = $2 WHERE id = $1 AND credentials_cipher = $3',
          channel.id, sealCredentials(credentials, `channel:${channel.id}`), channel.credentials_cipher);
        // Jangan menimpa token baru yang disimpan Admin saat refresh masih berjalan.
        if (!written) credentials = openCredentials<ChannelCredentials>((await this.channel(channel.id)).credentials_cipher, `channel:${channel.id}`);
      }
      const result = await this.provider.metrics(post, channel, credentials, config.graphVersion);
      await this.prisma.$executeRawUnsafe(`UPDATE public.cbt_social_posts SET metrics = $2::jsonb, metrics_at = now(), metrics_error = NULL,
        external_post_id = $3, updated_at = now() WHERE id = $1::uuid`, id, JSON.stringify(result.metrics), result.externalId);
    } catch (error) {
      await this.prisma.$executeRawUnsafe('UPDATE public.cbt_social_posts SET metrics_error = $2 WHERE id = $1::uuid', id, providerMessage(error));
    }
    return { post: await this.post(id) };
  }

  async reconcile(user: AuthUser, id: string, body: Record<string, unknown>) {
    this.assertAdmin(user);
    recordInput(body);
    const post = await this.post(id);
    if (body.bufferPostId) {
      if (!['uncertain', 'sending'].includes(post.status) || post.buffer_post_id) throw new BadRequestException('ID Buffer hanya diperlukan untuk pengiriman yang belum pasti.');
      const config = await this.config();
      if (!config.key) throw new BadRequestException('Isi API key Buffer terlebih dahulu.');
      const remote = await this.provider.post(config.key, field(body.bufferPostId, 'ID posting Buffer', 160)).catch(error => { throw new BadRequestException(providerMessage(error)); });
      if (remote.channelId !== post.channel_id || remote.text.trim() !== post.caption.trim()) throw new BadRequestException('Akun atau caption posting Buffer tidak cocok dengan draf.');
      await this.recordBuffer(post, remote);
    }
    if (body.externalPostId !== undefined) {
      const value = field(body.externalPostId, 'ID posting platform', 160);
      if (!/^[\d_]+$/.test(value)) throw new BadRequestException('ID posting platform harus berupa angka (atau page_id_post_id untuk Facebook).');
      if ((await this.post(id)).status !== 'published') throw new BadRequestException('ID statistik hanya dapat diisi setelah posting terbit.');
      await this.prisma.$executeRawUnsafe('UPDATE public.cbt_social_posts SET external_post_id = $2, metrics = $3::jsonb, metrics_at = NULL, metrics_error = NULL WHERE id = $1::uuid', id, value, '{}');
    }
    return { post: await this.post(id) };
  }
}
