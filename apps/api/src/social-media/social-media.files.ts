import { BadRequestException } from '@nestjs/common';
import { verifySocialMediaKey } from './social-media.crypto';

export const SOCIAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const SOCIAL_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const SOCIAL_UNUSED_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const SOCIAL_OBJECT_PATTERN = new RegExp(`^social-media/(${UUID})/(${UUID}\\.(?:jpg|png|mp4))$`, 'i');
export const SOCIAL_MEDIA_PATH_PATTERN = new RegExp(`^/api/social-media/media/(${UUID})/(${UUID}\\.(?:jpg|png|mp4))$`, 'i');

export function socialMediaObjectKey(owner: string, file: string): string | null {
  const key = `social-media/${owner}/${file}`;
  return SOCIAL_OBJECT_PATTERN.test(key) ? key.toLowerCase() : null;
}

/** Parse only our dedicated media path. Cleanup preserves old links even after key rotation. */
export function uploadedSocialMediaKey(value: string, verify = true): string | null {
  try {
    const url = new URL(value);
    const match = SOCIAL_MEDIA_PATH_PATTERN.exec(url.pathname);
    if (!match) return null;
    const key = socialMediaObjectKey(match[1], match[2])!;
    return !verify || verifySocialMediaKey(key, url.searchParams.get('signature') || '') ? key : null;
  } catch { return null; }
}

export function identifySocialUpload(file: Express.Multer.File | undefined) {
  if (!file?.buffer?.length || file.size !== file.buffer.length) throw new BadRequestException('Pilih gambar atau video yang valid.');
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  const bytes = file.buffer;
  const jpeg = ['jpg', 'jpeg'].includes(extension || '') && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = extension === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const mp4 = extension === 'mp4' && bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'].includes(bytes.subarray(8, 12).toString('ascii'));
  if (!jpeg && !png && !mp4) throw new BadRequestException('Format berkas tidak sesuai. Gunakan gambar JPG/PNG atau video MP4.');
  if (file.size > (mp4 ? SOCIAL_VIDEO_MAX_BYTES : SOCIAL_IMAGE_MAX_BYTES)) throw new BadRequestException(mp4 ? 'Ukuran video maksimal 25 MB.' : 'Ukuran gambar maksimal 8 MB.');
  return { extension: mp4 ? 'mp4' : png ? 'png' : 'jpg', contentType: mp4 ? 'video/mp4' : png ? 'image/png' : 'image/jpeg',
    mediaType: mp4 ? 'video' as const : 'image' as const };
}
