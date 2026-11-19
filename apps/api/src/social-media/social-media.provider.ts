import { Injectable } from '@nestjs/common';
import { canonicalPostUrl, externalPostId } from './social-media.validation';
import type { BufferPost, ChannelCredentials, SocialChannel, SocialMetrics, SocialPost } from './social-media.types';

export class SocialProviderError extends Error {
  constructor(message: string, readonly definitive = true) { super(message); }
}

const POST_FIELDS = 'id channelId text status externalLink sentAt schedulingType error { message }';
function bufferDetail(value: unknown, key: string): string {
  if (typeof value !== 'string') return '';
  return (key ? value.split(key).join('[API key disamarkan]') : value)
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [disamarkan]')
    .replace(/([?&](?:access_token|token|api_key|key|signature)=)[^\s&"'<>]+/gi, '$1[disamarkan]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
}
type Insight = { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } };
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function insightValue(data: Insight[], name: string): number | null {
  const row = data.find(item => item.name === name);
  return numeric(row?.total_value?.value ?? row?.values?.[0]?.value);
}

@Injectable()
export class SocialMediaProvider {
  private async json<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    } catch {
      throw new SocialProviderError('Layanan media sosial belum merespons. Periksa status sebelum mencoba mengirim ulang.', false);
    }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new SocialProviderError('Balasan layanan media sosial tidak dapat dibaca.', false); }
    if (!response.ok) {
      const message = response.status === 429 ? 'Batas permintaan layanan tercapai. Coba lagi nanti.' :
        response.status === 401 || response.status === 403 ? 'Token atau izin akun ditolak. Periksa Pengaturan Media Sosial.' :
        'Layanan media sosial menolak permintaan. Periksa token, izin akun, dan persyaratan media.';
      throw new SocialProviderError(message, response.status >= 400 && response.status < 500);
    }
    return body as T;
  }

  private async buffer<T>(key: string, query: string, variables: object = {}, mutation = false): Promise<T> {
    const result = await this.json<{ data?: T; errors?: { message?: string; extensions?: { code?: string } }[] }>('https://api.buffer.com', key,
      { method: 'POST', body: JSON.stringify({ query, variables }) });
    if (result.errors?.length || !result.data) {
      const validation = result.errors?.every(error => ['GRAPHQL_VALIDATION_FAILED', 'GRAPHQL_PARSE_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN'].includes(error.extensions?.code || ''));
      const detail = bufferDetail(result.errors?.map(error => error.message || '').filter(Boolean).join('; '), key);
      throw new SocialProviderError(detail ? `Buffer belum dapat memproses permintaan: ${detail}` :
        'Buffer belum dapat memproses permintaan. Periksa API key, akses akun, dan kompatibilitas API.', !mutation || Boolean(validation));
    }
    return result.data;
  }

  async organizations(key: string): Promise<{ id: string; name: string }[]> {
    const result = await this.buffer<{ account: { organizations: { id: string; name: string }[] } }>(key,
      'query { account { organizations { id name } } }');
    return result.account.organizations;
  }

  async channels(key: string, organizationId: string): Promise<SocialChannel[]> {
    const result = await this.buffer<{ channels: { id: string; service: string; serviceId: string; displayName?: string;
      name: string; isDisconnected: boolean; isLocked: boolean }[] }>(key,
      `query Channels($input: ChannelsInput!) { channels(input: $input) { id service serviceId displayName name isDisconnected isLocked } }`,
      { input: { organizationId } });
    return result.channels.filter(channel => ['instagram', 'facebook', 'tiktok'].includes(channel.service)).map(channel => ({
      id: channel.id, platform: channel.service as SocialChannel['platform'], name: channel.displayName || channel.name,
      external_account_id: channel.serviceId, organization_id: organizationId,
      connected: !channel.isDisconnected && !channel.isLocked,
    }));
  }

  async createPost(key: string, post: SocialPost): Promise<BufferPost> {
    const assets = post.media_url ? [{ [post.media_type]: { url: post.media_url } }] : [];
    const metadata = post.platform === 'instagram' ? { instagram: {
      type: post.media_type === 'video' ? 'reel' : 'post', shouldShareToFeed: true, isAiGenerated: post.ai_generated,
    } } : post.platform === 'facebook' ? { facebook: { type: 'post' } } : { tiktok: { isAiGenerated: post.ai_generated } };
    const result = await this.buffer<{ createPost: { __typename: string; message?: string; post?: BufferPost } }>(key,
      `mutation Publish($input: CreatePostInput!) { createPost(input: $input) { __typename ... on PostActionSuccess { post { ${POST_FIELDS} } } ... on MutationError { message } } }`,
      { input: { channelId: post.channel_id, text: post.caption, assets, metadata,
        mode: 'shareNow', schedulingType: 'automatic', saveToDraft: false, needsApproval: false, source: 'unelma-cbt' } }, true);
    if (result.createPost.__typename !== 'PostActionSuccess' || !result.createPost.post?.id) {
      // UnexpectedError/RestProxyError may happen after a downstream publish was accepted.
      const definitive = ['NotFoundError', 'UnauthorizedError', 'LimitReachedError', 'InvalidInputError'].includes(result.createPost.__typename);
      const detail = bufferDetail(result.createPost.message, key);
      if (detail) throw new SocialProviderError(`Buffer menolak posting: ${detail}`, definitive);
      throw new SocialProviderError(result.createPost.__typename === 'LimitReachedError'
        ? 'Batas posting Buffer tercapai. Periksa paket atau antrean akun di Buffer.'
        : 'Buffer belum menerima posting. Periksa akun, izin publikasi otomatis, dan format media di Buffer.', definitive);
    }
    return this.cleanPost(result.createPost.post, key);
  }

  private cleanPost(post: BufferPost, key: string): BufferPost {
    return { ...post, error: post.error ? { message: bufferDetail(post.error.message, key) } : null };
  }

  async post(key: string, id: string): Promise<BufferPost> {
    const result = await this.buffer<{ post: BufferPost }>(key,
      `query Post($input: PostInput!) { post(input: $input) { ${POST_FIELDS} } }`, { input: { id } });
    return this.cleanPost(result.post, key);
  }

  async postMetrics(key: string, post: SocialPost): Promise<{ metrics: SocialMetrics; updatedAt: string | null } | null> {
    // Separate from the status query: unavailable Insights must never hide a successful publication.
    const result = await this.buffer<{ post: { id: string; channelId: string; metricsUpdatedAt?: string | null;
      metrics?: { type: string; value: number; unit: string }[] | null } }>(key,
      `query PostMetrics($input: PostInput!) { post(input: $input) { id channelId metrics { type value unit } metricsUpdatedAt } }`,
      { input: { id: post.buffer_post_id } });
    if (result.post?.id !== post.buffer_post_id || result.post.channelId !== post.channel_id) {
      throw new SocialProviderError('Akun atau ID statistik Buffer tidak cocok dengan posting ini.');
    }
    const value = (type: string) => numeric(result.post.metrics?.find(metric => metric.type === type && metric.unit === 'count')?.value);
    const counts = ['reactions', 'comments', 'shares', ...(post.platform === 'instagram' ? ['saves'] : [])].map(value);
    const metrics: SocialMetrics = {
      views: value('views') ?? value('impressions'),
      reach: post.platform === 'tiktok' ? null : value('reach'),
      interactions: counts.every(count => count !== null) ? (counts as number[]).reduce((sum, count) => sum + count, 0) : null,
      source: 'buffer',
    };
    if ([metrics.views, metrics.reach, metrics.interactions].every(count => count === null)) return null;
    const timestamp = result.post.metricsUpdatedAt;
    return { metrics, updatedAt: timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null };
  }

  private async meta<T>(token: string, version: string, path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    url.search = new URLSearchParams(params).toString();
    const result = await this.json<T & { error?: unknown }>(url.href, token);
    if (result.error) throw new SocialProviderError('Meta menolak token atau izin statistik akun. Perbarui token di Pengaturan.');
    return result;
  }

  private async nativeId(post: SocialPost, channel: SocialChannel, credentials: ChannelCredentials, version: string): Promise<string> {
    if (post.external_post_id) return post.external_post_id;
    const accountId = credentials.accountId || channel.external_account_id;
    const parsed = externalPostId(post.platform, post.external_url, accountId);
    if (parsed) return parsed;
    if (!post.external_url) throw new SocialProviderError('Tautan posting belum tersedia dari Buffer. Perbarui status nanti atau isi ID posting asli setelah terbit.');
    if (post.platform === 'tiktok') throw new SocialProviderError('ID video TikTok belum tersedia. Tunggu posting terbit atau isi ID video pada riwayat posting.');
    if (!/^\d+$/.test(accountId)) throw new SocialProviderError('ID akun statistik belum valid. Isi ID numerik akun pada Pengaturan.');
    let after = '';
    for (let page = 0; page < 3; page++) {
      const instagram = post.platform === 'instagram';
      const data = await this.meta<{ data: { id: string; permalink?: string; permalink_url?: string }[];
        paging?: { cursors?: { after?: string }; next?: string } }>(credentials.accessToken!, version,
        `${accountId}/${instagram ? 'media' : 'posts'}`, { fields: instagram ? 'id,permalink' : 'id,permalink_url', limit: '100', ...(after ? { after } : {}) });
      const matched = data.data?.find(row => canonicalPostUrl(row.permalink || row.permalink_url || '') === canonicalPostUrl(post.external_url || ''));
      if (matched) return matched.id;
      if (!data.paging?.next || !data.paging.cursors?.after) break;
      after = data.paging.cursors.after;
    }
    throw new SocialProviderError('Posting belum ditemukan di akun statistik. Periksa token/ID akun, atau isi ID posting pada riwayat posting.');
  }

  async metrics(post: SocialPost, channel: SocialChannel, credentials: ChannelCredentials, version: string): Promise<{ metrics: SocialMetrics; externalId: string }> {
    if (!credentials.accessToken) throw new SocialProviderError('Token statistik akun belum diisi. Lengkapi pada Pengaturan Media Sosial.');
    const id = await this.nativeId(post, channel, credentials, version);
    if (!/^[\d_]+$/.test(id)) throw new SocialProviderError('ID posting statistik harus berupa ID numerik platform.');
    if (post.platform === 'tiktok') {
      const result = await this.json<{ data?: { videos?: { id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] };
        error?: { code?: string } }>('https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count', credentials.accessToken,
        { method: 'POST', body: JSON.stringify({ filters: { video_ids: [id] } }) });
      if (result.error?.code && result.error.code !== 'ok') throw new SocialProviderError('TikTok menolak token statistik. Pastikan izin video.list tersedia dan token belum kedaluwarsa.');
      const row = result.data?.videos?.find(video => video.id === id);
      if (!row) throw new SocialProviderError('Video belum tersedia untuk statistik TikTok. Akun pemilik video dan token harus sesuai.');
      const counts = [numeric(row.like_count), numeric(row.comment_count), numeric(row.share_count)];
      return { externalId: id, metrics: { views: numeric(row.view_count), reach: null,
        interactions: counts.every(value => value !== null) ? (counts as number[]).reduce((sum, value) => sum + value, 0) : null } };
    }
    const names = post.platform === 'instagram' ? ['views', 'reach', 'total_interactions'] : ['post_media_view', 'post_total_media_view_unique'];
    // Tiap metrik terpisah: metrik yang tidak didukung tidak menghapus metrik lain.
    const values = await Promise.all(names.map(async metric => {
      try {
        const result = await this.meta<{ data: Insight[] }>(credentials.accessToken!, version, `${id}/insights`, { metric });
        return { value: insightValue(result.data || [], metric), error: null };
      } catch (error) { return { value: null, error }; }
    }));
    let interactions = values[2]?.value ?? null;
    if (post.platform === 'facebook') {
      try {
        const row = await this.meta<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(
          credentials.accessToken, version, id, { fields: 'reactions.limit(0).summary(true),comments.limit(0).summary(true),shares' });
        const counts = [numeric(row.reactions?.summary?.total_count), numeric(row.comments?.summary?.total_count), numeric(row.shares?.count ?? 0)];
        if (counts.every(value => value !== null)) interactions = (counts as number[]).reduce((sum, value) => sum + value, 0);
      } catch { /* Statistik tayangan masih dapat ditampilkan bila izin interaksi tidak tersedia. */ }
    }
    if (values.every(row => row.value === null) && interactions === null) {
      throw new SocialProviderError(values.some(row => row.error) ? 'Statistik belum dapat dibaca. Periksa izin Insights, token, dan versi Graph API pada Pengaturan.' : 'Platform belum menyediakan statistik untuk posting ini.');
    }
    return { externalId: id, metrics: { views: values[0].value, reach: values[1].value, interactions } };
  }

  async refreshTikTok(credentials: ChannelCredentials): Promise<ChannelCredentials> {
    if (!credentials.refreshToken || !credentials.clientKey || !credentials.clientSecret) return credentials;
    const body = new URLSearchParams({ client_key: credentials.clientKey, client_secret: credentials.clientSecret,
      grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
    const result = await this.json<{ access_token?: string; refresh_token?: string; expires_in?: number }>(
      'https://open.tiktokapis.com/v2/oauth/token/', '', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!result.access_token) throw new SocialProviderError('Token TikTok belum dapat diperbarui. Periksa client key, client secret, dan refresh token.');
    return { ...credentials, accessToken: result.access_token, refreshToken: result.refresh_token || credentials.refreshToken,
      expiresAt: Date.now() + (result.expires_in || 86400) * 1000 };
  }
}
