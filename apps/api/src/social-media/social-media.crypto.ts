import { ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Memakai rahasia server yang SUDAH ada. API key/token tidak perlu masuk .env.
function key(context = 'social-media-credentials-v1'): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new ServiceUnavailableException('Kunci keamanan server belum siap untuk menyimpan API media sosial.');
  return Buffer.from(hkdfSync('sha256', secret, 'unelma-cbt', context, 32));
}

export function signSocialMediaKey(objectKey: string): string {
  return createHmac('sha256', key('social-media-upload-links-v1')).update(objectKey).digest('hex');
}

export function verifySocialMediaKey(objectKey: string, signature: string): boolean {
  return /^[a-f0-9]{64}$/.test(signature) && timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(signSocialMediaKey(objectKey), 'hex'));
}

export function sealCredentials(value: object, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

export function openCredentials<T extends object>(value: string | null | undefined, context: string): T {
  if (!value) return {} as T;
  try {
    if (!value.startsWith('v1:')) throw new Error('version');
    const bytes = Buffer.from(value.slice(3), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as T;
  } catch {
    throw new ServiceUnavailableException('Kredensial tersimpan belum dapat dibuka. Simpan ulang API key atau token di Pengaturan Media Sosial.');
  }
}
