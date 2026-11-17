import { BadRequestException } from '@nestjs/common';
import type { MediaType, SocialPlatform } from './social-media.types';

export const PLATFORMS = ['instagram', 'facebook', 'tiktok'] as const;
export function recordInput(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Isian permintaan tidak valid.');
}
export function platform(value: unknown): SocialPlatform {
  if (!PLATFORMS.includes(value as SocialPlatform)) throw new BadRequestException('Platform tidak valid.');
  return value as SocialPlatform;
}
export function field(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new BadRequestException(`${label} tidak valid (maksimal ${max} karakter).`);
  }
  return value.trim();
}
export function secretField(value: unknown): string {
  const text = field(value, 'Token/API key', 12000);
  if (/\s/.test(text)) throw new BadRequestException('Token/API key tidak boleh memuat spasi atau baris baru.');
  return text;
}
export function publicMediaUrl(value: unknown): string {
  const text = field(value, 'URL media', 2048);
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !host.includes('.') || host.includes(':') || /^\d+(\.\d+){3}$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error('url');
    return url.href;
  } catch { throw new BadRequestException('Media harus memakai URL HTTPS publik tanpa autentikasi.'); }
}
export function validatePost(body: Record<string, unknown>, publishing = false) {
  recordInput(body);
  const selectedPlatform = platform(body.platform);
  const caption = field(body.caption, 'Caption', 2200);
  const mediaType = body.mediaType as MediaType;
  if (!['text', 'image', 'video'].includes(mediaType)) throw new BadRequestException('Jenis media tidak valid.');
  const mediaUrl = mediaType === 'text' || body.mediaUrl === undefined || body.mediaUrl === null || body.mediaUrl === '' ? null : publicMediaUrl(body.mediaUrl);
  if (!caption && !mediaUrl) throw new BadRequestException('Isi caption atau tambahkan media.');
  if (selectedPlatform !== 'facebook' && mediaType === 'text') throw new BadRequestException('Instagram dan TikTok memerlukan gambar atau video.');
  if (publishing && mediaType !== 'text' && !mediaUrl) throw new BadRequestException('Lengkapi URL media sebelum mempublikasikan posting.');
  const channelId = body.channelId ? field(body.channelId, 'Akun', 160) : null;
  if (body.aiGenerated !== undefined && typeof body.aiGenerated !== 'boolean') throw new BadRequestException('Label konten AI tidak valid.');
  return { platform: selectedPlatform, caption, mediaType, mediaUrl, channelId, aiGenerated: body.aiGenerated === true };
}

export function canonicalPostUrl(value: string): string {
  try {
    const url = new URL(value);
    const query = new URLSearchParams();
    // Facebook memakai query sebagai identitas permalink; jangan menyamakan semua story.php.
    if (/(^|\.)facebook\.com$/.test(url.hostname)) for (const key of ['id', 'story_fbid', 'fbid']) {
      const item = url.searchParams.get(key); if (item) query.set(key, item);
    }
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${query.size ? `?${query}` : ''}`;
  }
  catch { return ''; }
}
export function externalPostId(selectedPlatform: SocialPlatform, link: string | null, accountId: string): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (selectedPlatform === 'tiktok' && /(^|\.)tiktok\.com$/.test(url.hostname)) return /\/video\/(\d+)/.exec(url.pathname)?.[1] || null;
    if (selectedPlatform === 'facebook' && /(^|\.)facebook\.com$/.test(url.hostname)) {
      const id = /\/posts\/(\d+)/.exec(url.pathname)?.[1] || url.searchParams.get('story_fbid');
      return id && /^\d+$/.test(id) && /^\d+$/.test(accountId) ? `${accountId}_${id}` : null;
    }
  } catch { /* Bentuk permalink lain diselesaikan lewat API resmi. */ }
  return null;
}
