import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import { randomUUID } from 'node:crypto';
import { isAdminUser } from '../common/creation-limits';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { signSocialMediaKey, verifySocialMediaKey } from './social-media.crypto';
import { identifySocialUpload, SOCIAL_OBJECT_PATTERN, SOCIAL_UNUSED_MIN_AGE_MS, socialMediaObjectKey, uploadedSocialMediaKey } from './social-media.files';

type QueryClient = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;
const LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('unelma-social-media-files'))::text AS locked";

@Injectable()
export class SocialMediaFilesService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  private assertAdmin(user: AuthUser) {
    if (!user || !isAdminUser(user)) throw new ForbiddenException('Hanya Admin yang dapat mengelola lampiran Media Sosial.');
  }

  async upload(user: AuthUser, file: Express.Multer.File | undefined, publicOrigin: string) {
    this.assertAdmin(user);
    const type = identifySocialUpload(file);
    let origin: URL;
    try {
      origin = new URL(publicOrigin);
      if (origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol) ||
        (origin.protocol !== 'https:' && (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new Error('origin');
    } catch { throw new BadRequestException('Alamat aplikasi belum valid untuk unggah media. Muat ulang halaman dan coba lagi.'); }
    const owner = user.id.toLowerCase();
    const name = `${randomUUID()}.${type.extension}`;
    const key = socialMediaObjectKey(owner, name);
    if (!key) throw new BadRequestException('Identitas pengunggah tidak valid.');
    const signature = signSocialMediaKey(key);
    const stored = await this.storage.putObject(key, file!.buffer, type.contentType);
    if (!stored.success) throw new InternalServerErrorException('File belum berhasil diunggah. Periksa penyimpanan R2 aplikasi.');
    return { media: { url: `${origin.origin}/api/social-media/media/${owner}/${name}?signature=${signature}`,
      name: file!.originalname.slice(0, 180), size: file!.size, mediaType: type.mediaType } };
  }

  async publicFile(owner: string, file: string, signature: string, range?: string, head = false) {
    const key = socialMediaObjectKey(owner, file);
    if (!key || !verifySocialMediaKey(key, signature)) throw new NotFoundException('Lampiran tidak ditemukan.');
    if (range && !/^bytes=\d*-\d*$/.test(range)) throw new BadRequestException('Rentang berkas tidak valid.');
    const object = head ? await this.storage.objectMetadata(key) : await this.storage.getObject(key, range);
    if (!object) throw new NotFoundException('Lampiran tidak ditemukan.');
    return object;
  }

  /** Save/delete share a DB lock; a cleanup cannot remove an attachment being referenced. */
  async guardSave<T>(url: string, save: (client: QueryClient) => Promise<T>): Promise<T> {
    const key = uploadedSocialMediaKey(url);
    if (!key) throw new BadRequestException('Tautan lampiran unggahan tidak valid. Unggah kembali file.');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(LOCK_SQL);
      if (!await this.storage.objectMetadata(key)) throw new BadRequestException('Lampiran sudah tidak tersedia. Unggah kembali file dari perangkat.');
      return save(tx);
    }, { timeout: 30000 });
  }

  private async references(client: QueryClient) {
    const rows = await client.$queryRawUnsafe<{ media_url: string }[]>('SELECT media_url FROM public.cbt_social_posts WHERE media_url IS NOT NULL');
    return new Set(rows.map(row => uploadedSocialMediaKey(row.media_url, false)).filter((key): key is string => Boolean(key)));
  }

  async usage(user: AuthUser) {
    this.assertAdmin(user);
    try {
      const [listing, used] = await Promise.all([this.storage.listObjects('social-media/', 10000), this.references(this.prisma)]);
      const objects = listing.objects.filter(object => SOCIAL_OBJECT_PATTERN.test(object.key));
      const cutoff = Date.now() - SOCIAL_UNUSED_MIN_AGE_MS;
      const unused = objects.filter(object => !used.has(object.key) && object.lastModified && object.lastModified.getTime() < cutoff);
      return { storage: { files: objects.length, bytes: objects.reduce((sum, object) => sum + object.size, 0),
        unusedFiles: unused.length, unusedBytes: unused.reduce((sum, object) => sum + object.size, 0), truncated: listing.truncated } };
    } catch { throw new InternalServerErrorException('Pemakaian media belum dapat diperiksa. Tidak ada file yang dihapus.'); }
  }

  async cleanup(user: AuthUser) {
    this.assertAdmin(user);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(LOCK_SQL);
      // Refuse cleanup if either listing/reference query is incomplete or fails.
      const [listing, used] = await Promise.all([this.storage.listObjects('social-media/', 10000), this.references(tx)]);
      if (listing.truncated) throw new BadRequestException('Daftar media terlalu besar. Pembersihan otomatis dibatalkan agar seluruh referensi dapat diperiksa.');
      const cutoff = Date.now() - SOCIAL_UNUSED_MIN_AGE_MS;
      const candidates = listing.objects.filter(object => SOCIAL_OBJECT_PATTERN.test(object.key) &&
        !used.has(object.key) && object.lastModified && object.lastModified.getTime() < cutoff).slice(0, 50);
      if (!candidates.length) return { deleted: 0, freedBytes: 0, failed: 0 };
      const result = await this.storage.deleteObjects(candidates.map(object => object.key));
      return { deleted: result.deleted.length, freedBytes: candidates.filter(object => result.deleted.includes(object.key)).reduce((sum, object) => sum + object.size, 0), failed: result.failed.length };
    }, { timeout: 30000 });
  }
}
