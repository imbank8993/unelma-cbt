import { apiGet, apiSend } from './api/client';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';
export type SocialMediaType = 'text' | 'image' | 'video';
export interface SocialMetrics { views?: number | null; reach?: number | null; interactions?: number | null }
export interface SocialChannel {
  id: string; platform: SocialPlatform; organization_id: string; name: string;
  external_account_id: string; connected: boolean; tokenSet: boolean;
}
export interface SocialPost {
  id: string; platform: SocialPlatform; channel_id: string | null; caption: string;
  media_type: SocialMediaType; media_url: string | null; ai_generated: boolean;
  status: 'draft' | 'sending' | 'processing' | 'published' | 'failed' | 'uncertain';
  buffer_post_id: string | null; external_post_id: string | null; external_url: string | null;
  error: string | null; metrics: SocialMetrics; metrics_at: string | null; metrics_error: string | null;
  created_at: string; updated_at: string; published_at: string | null;
}
export interface SocialSettings { bufferKeySet: boolean; organizationId: string; graphVersion: string; updatedAt: string | null }
export interface ChannelSettings { accountId: string; tokenSet: boolean; refreshTokenSet: boolean; clientKeySet: boolean; clientSecretSet: boolean; credentialsUnreadable?: boolean }
export interface SocialWorkspace {
  settings: SocialSettings; channels: SocialChannel[]; posts: SocialPost[];
  totals: { published: number; drafts: number; measured: number; views: number | null; reach: number | null; interactions: number | null };
}
export interface SocialDraft {
  platform: SocialPlatform; channelId: string; caption: string; mediaType: SocialMediaType; mediaUrl: string; aiGenerated: boolean;
}
export const PLATFORM_LABELS: Record<SocialPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
export const POST_STATUS_LABELS: Record<SocialPost['status'], string> = {
  draft: 'Draf', sending: 'Sedang dikirim', processing: 'Diproses Buffer', published: 'Terbit', failed: 'Perlu diperbaiki', uncertain: 'Perlu diperiksa',
};
export const getSocialWorkspace = () => apiGet<SocialWorkspace>('/api/social-media');
export const saveSocialSettings = (body: { bufferApiKey?: string; clearBufferKey?: boolean; organizationId?: string; graphVersion?: string }) =>
  apiSend<{ settings: SocialSettings }>('/api/social-media/settings', body, 'PUT');
export const syncSocialChannels = () => apiSend<{ organizations: { id: string; name: string }[]; needsOrganization: boolean; count?: number }>('/api/social-media/channels/sync', {});
export const getSocialChannelSettings = (id: string) => apiGet<ChannelSettings>(`/api/social-media/channels/${encodeURIComponent(id)}/settings`);
export const saveSocialChannelSettings = (id: string, body: { accountId?: string; accessToken?: string; refreshToken?: string; clientKey?: string; clientSecret?: string; clearCredentials?: boolean }) =>
  apiSend<{ saved: boolean }>(`/api/social-media/channels/${encodeURIComponent(id)}/settings`, body, 'PUT');
export const saveSocialDraft = (id: string, body: SocialDraft) => apiSend<{ post: SocialPost }>(`/api/social-media/posts/${id}`, body, 'PUT');
export const publishSocialPost = (id: string) => apiSend<{ post: SocialPost }>(`/api/social-media/posts/${id}/publish`, {});
export const syncSocialPost = (id: string) => apiSend<{ post: SocialPost }>(`/api/social-media/posts/${id}/sync`, {});
export const deleteSocialDraft = (id: string) => apiSend<{ deleted: boolean }>(`/api/social-media/posts/${id}`, {}, 'DELETE');
export const reconcileSocialPost = (id: string, body: { bufferPostId?: string; externalPostId?: string }) =>
  apiSend<{ post: SocialPost }>(`/api/social-media/posts/${id}/reference`, body, 'PUT');
