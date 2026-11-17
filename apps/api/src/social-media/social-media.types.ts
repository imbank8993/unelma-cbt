export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';
export type MediaType = 'text' | 'image' | 'video';
export type PostStatus = 'draft' | 'sending' | 'processing' | 'published' | 'failed' | 'uncertain';
export interface SocialMetrics { views?: number | null; reach?: number | null; interactions?: number | null }
export interface SocialChannel {
  id: string; platform: SocialPlatform; organization_id: string; name: string;
  external_account_id: string; connected: boolean; credentials_cipher?: string | null;
}
export interface SocialPost {
  id: string; platform: SocialPlatform; channel_id: string | null; caption: string;
  media_type: MediaType; media_url: string | null; ai_generated: boolean; status: PostStatus;
  buffer_post_id: string | null; external_post_id: string | null; external_url: string | null;
  error: string | null; metrics: SocialMetrics; metrics_at: Date | null; metrics_error: string | null;
  created_at: Date; updated_at: Date; published_at: Date | null;
}
export interface ChannelCredentials {
  accessToken?: string; refreshToken?: string; clientKey?: string; clientSecret?: string;
  accountId?: string; expiresAt?: number;
}
export interface BufferPost {
  id: string; channelId: string; text: string; status: string; externalLink?: string | null;
  sentAt?: string | null; schedulingType?: string;
}
