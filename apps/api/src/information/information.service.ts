import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '@acca-cbt/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../storage/storage.service';

type Folder = { id: string; name: string; sort_order: number; created_at: Date };
type Document = { id: string; folder_id: string; title: string; file_name: string; storage_key: string;
  size_bytes: number; published: boolean; sort_order: number; created_at: Date };

function textField(value: unknown, label: string, max: number): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text || text.length > max) throw new BadRequestException(`${label} harus berisi 1–${max} karakter.`);
  return text;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string } };
  return e?.code === '23505' || e?.code === 'P2002' || e?.meta?.code === '23505';
}

@Injectable()
export class InformationService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  assertAdmin(user: AuthUser): void {
    const roles = (user.roles || []).map(role => String(role).toUpperCase());
    if (!user.isPlatformAdmin && user.resolved?.superadmin !== true &&
        !roles.includes('ADMIN') && !roles.includes('SUPERADMIN')) {
      throw new ForbiddenException('Hanya Admin yang dapat mengelola informasi.');
    }
  }

  async list(admin = false): Promise<{ folders: Folder[]; documents: Omit<Document, 'storage_key'>[] }> {
    const [folders, documents] = await Promise.all([
      this.prisma.$queryRawUnsafe<Folder[]>(`
        SELECT id, name, sort_order, created_at FROM public.cbt_information_folders
        ORDER BY sort_order, created_at DESC, name`),
      this.prisma.$queryRawUnsafe<Document[]>(`
        SELECT id, folder_id, title, file_name, size_bytes, published, sort_order, created_at
        FROM public.cbt_information_documents ${admin ? '' : 'WHERE published = true'}
        ORDER BY sort_order, created_at DESC`),
    ]);
    const visibleFolders = admin ? folders : folders.filter(folder => documents.some(doc => doc.folder_id === folder.id));
    return { folders: visibleFolders, documents };
  }

  async publicDocument(id: string): Promise<Document> {
    const rows = await this.prisma.$queryRawUnsafe<Document[]>(`
      SELECT id, folder_id, title, file_name, storage_key, size_bytes, published, sort_order, created_at
      FROM public.cbt_information_documents WHERE id = $1::uuid AND published = true LIMIT 1`, id);
    if (!rows.length) throw new NotFoundException('Informasi tidak ditemukan.');
    return rows[0];
  }

  async publicFile(id: string) {
    const doc = await this.publicDocument(id);
    const object = await this.storage.getObject(doc.storage_key);
    if (!object) throw new NotFoundException('Berkas PDF tidak ditemukan.');
    return { doc, object };
  }

  async createFolder(user: AuthUser, body: { name?: unknown }) {
    this.assertAdmin(user);
    const name = textField(body?.name, 'Nama folder', 100);
    try {
      const [folder] = await this.prisma.$queryRawUnsafe<Folder[]>(`
        INSERT INTO public.cbt_information_folders (name) VALUES ($1) RETURNING id, name, sort_order, created_at`, name);
      return { folder };
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException('Nama folder sudah digunakan.');
      throw error;
    }
  }

  async updateFolder(user: AuthUser, id: string, body: { name?: unknown }) {
    this.assertAdmin(user);
    const name = textField(body?.name, 'Nama folder', 100);
    try {
      const [folder] = await this.prisma.$queryRawUnsafe<Folder[]>(`
        UPDATE public.cbt_information_folders SET name = $2, updated_at = now()
        WHERE id = $1::uuid RETURNING id, name, sort_order, created_at`, id, name);
      if (!folder) throw new NotFoundException('Folder tidak ditemukan.');
      return { folder };
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException('Nama folder sudah digunakan.');
      throw error;
    }
  }

  async deleteFolder(user: AuthUser, id: string) {
    this.assertAdmin(user);
    const [count] = await this.prisma.$queryRawUnsafe<{ count: number }[]>(`
      SELECT count(*)::int AS count FROM public.cbt_information_documents WHERE folder_id = $1::uuid`, id);
    if (count?.count) throw new BadRequestException('Folder masih berisi PDF. Hapus atau pindahkan berkasnya terlebih dahulu.');
    const deleted = await this.prisma.$executeRawUnsafe(`DELETE FROM public.cbt_information_folders WHERE id = $1::uuid`, id);
    if (!deleted) throw new NotFoundException('Folder tidak ditemukan.');
    return { deleted: true };
  }

  async upload(user: AuthUser, folderId: string, titleInput: unknown, file: Express.Multer.File | undefined) {
    this.assertAdmin(user);
    if (!file || !file.size || file.size > MAX_UPLOAD_BYTES || !/\.pdf$/i.test(file.originalname || '') ||
        file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException('Pilih PDF valid berukuran maksimum 25 MB.');
    }
    const title = textField(titleInput || file.originalname.replace(/\.pdf$/i, ''), 'Judul informasi', 160);
    const [folder] = await this.prisma.$queryRawUnsafe<Folder[]>(`
      SELECT id, name, sort_order, created_at FROM public.cbt_information_folders WHERE id = $1::uuid`, folderId);
    if (!folder) throw new NotFoundException('Folder tidak ditemukan.');

    const key = `public-information/${folderId}/${randomUUID()}.pdf`;
    const stored = await this.storage.putObject(key, file.buffer, 'application/pdf');
    if (!stored.success) throw new InternalServerErrorException('PDF gagal diunggah ke bucket Unelma.');
    try {
      const [document] = await this.prisma.$queryRawUnsafe<Document[]>(`
        INSERT INTO public.cbt_information_documents
          (folder_id, title, file_name, storage_key, size_bytes, created_by)
        VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)
        RETURNING id, folder_id, title, file_name, size_bytes, published, sort_order, created_at`,
        folderId, title, file.originalname.slice(0, 255), key, file.size, user.id);
      return { document };
    } catch (error) {
      await this.storage.deleteObject(key);
      throw error;
    }
  }

  async updateDocument(user: AuthUser, id: string, body: { title?: unknown; folder_id?: unknown; published?: unknown }) {
    this.assertAdmin(user);
    const sets: string[] = [];
    const params: unknown[] = [id];
    if (body?.title !== undefined) { params.push(textField(body.title, 'Judul informasi', 160)); sets.push(`title = $${params.length}`); }
    if (body?.folder_id !== undefined) {
      if (typeof body.folder_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.folder_id)) throw new BadRequestException('Folder tidak valid.');
      const [folder] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(`
        SELECT id FROM public.cbt_information_folders WHERE id = $1::uuid`, body.folder_id);
      if (!folder) throw new NotFoundException('Folder tidak ditemukan.');
      params.push(body.folder_id); sets.push(`folder_id = $${params.length}::uuid`);
    }
    if (body?.published !== undefined) {
      if (typeof body.published !== 'boolean') throw new BadRequestException('Status terbit tidak valid.');
      params.push(body.published); sets.push(`published = $${params.length}::boolean`);
    }
    if (!sets.length) throw new BadRequestException('Tidak ada perubahan yang dikirim.');
    const [document] = await this.prisma.$queryRawUnsafe<Document[]>(`
      UPDATE public.cbt_information_documents SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $1::uuid RETURNING id, folder_id, title, file_name, size_bytes, published, sort_order, created_at`, ...params);
    if (!document) throw new NotFoundException('Informasi tidak ditemukan.');
    return { document };
  }

  async deleteDocument(user: AuthUser, id: string) {
    this.assertAdmin(user);
    const [document] = await this.prisma.$queryRawUnsafe<Document[]>(`
      DELETE FROM public.cbt_information_documents WHERE id = $1::uuid RETURNING storage_key`, id);
    if (!document) throw new NotFoundException('Informasi tidak ditemukan.');
    // Metadata hilang lebih dulu: tautan publik langsung ditutup meski R2 sementara gagal.
    await this.storage.deleteObject(document.storage_key);
    return { deleted: true };
  }
}
