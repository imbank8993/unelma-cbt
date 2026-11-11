import { BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import type { DbService } from '../prisma/prisma-db-adapter';

export type PaidContentKind = 'exam' | 'material';

/** Batas atas harga satu item, sama dengan batas pada DTO ujian & bahan ajar. */
export const MAX_ITEM_TOKEN_PRICE = 10_000;

const LABEL: Record<PaidContentKind, string> = { exam: 'ujian', material: 'bahan ajar' };

/**
 * Aturan konten berbayar, dijalankan saat item DIJADIKAN berbayar atau
 * harganya DIUBAH (bukan pada setiap penyimpanan):
 *  - harga bilangan bulat ≥ 1 dan ≥ harga minimal di Konfigurasi Komisi;
 *  - pemilik konten tidak sedang dicabut izinnya oleh Admin
 *    (proctor_profiles.can_create_exams / can_create_materials, atau status `rejected`).
 *
 * `ownerId` = pembuat konten (penerima komisi), bukan selalu pengguna yang menyimpan.
 */
export async function assertPaidContentAllowed(
  db: Pick<DbService, 'from'>,
  ownerId: string,
  kind: PaidContentKind,
  tokenPrice: unknown,
): Promise<void> {
  const price = Number(tokenPrice);
  if (!Number.isInteger(price) || price < 1 || price > MAX_ITEM_TOKEN_PRICE) {
    throw new BadRequestException(`Harga ${LABEL[kind]} berbayar harus bilangan bulat 1–${MAX_ITEM_TOKEN_PRICE} token.`);
  }

  const { data: settings, error: settingsError } = await db
    .from('acca_settings')
    .select('value')
    .eq('key', 'commission_config')
    .maybeSingle();
  if (settingsError) throw new InternalServerErrorException('Konfigurasi harga minimal belum dapat dibaca.');
  const config = (settings as { value?: Record<string, unknown> } | null)?.value || {};
  const minimum = Math.max(1, Number(kind === 'exam' ? config.min_exam_token_price : config.min_material_token_price) || 1);
  if (price < minimum) {
    throw new BadRequestException(`Harga ${LABEL[kind]} berbayar minimal ${minimum} token (ditetapkan Admin).`);
  }

  const { data: profile, error: profileError } = await db
    .from('proctor_profiles')
    .select('can_create_exams, can_create_materials, status')
    .eq('user_id', ownerId)
    .maybeSingle();
  if (profileError) throw new InternalServerErrorException('Izin konten berbayar belum dapat diperiksa.');
  const row = profile as { can_create_exams?: boolean; can_create_materials?: boolean; status?: string } | null;
  if (!row) return;
  const permitted = kind === 'exam' ? row.can_create_exams !== false : row.can_create_materials !== false;
  if (!permitted || row.status === 'rejected') {
    throw new ForbiddenException(`Izin menjual ${LABEL[kind]} berbayar untuk pembuat konten ini sedang dicabut Admin.`);
  }
}

/**
 * Apakah item berbayar MASIH TERKUNCI bagi pengguna ini.
 * Item gratis (is_paid=false atau harga 0) tidak pernah terkunci — sama dengan
 * aturan `TokensService.checkAccess`. Pemanggil menangani pengecualian staf.
 */
export async function isPaidItemLocked(
  db: Pick<DbService, 'from'>,
  userId: string,
  kind: PaidContentKind,
  item: { id: string; is_paid?: boolean | null; token_price?: number | string | null },
): Promise<boolean> {
  if (!item.is_paid || !(Number(item.token_price) > 0)) return false;
  const { data, error } = await db
    .from('unlocked_items')
    .select('id')
    .eq('user_id', userId)
    .eq('item_type', kind)
    .eq('item_id', item.id)
    .maybeSingle();
  if (error) throw new InternalServerErrorException('Status akses konten berbayar belum dapat diperiksa.');
  return !data;
}

export const PAID_LOCKED_MESSAGE: Record<PaidContentKind, string> = {
  exam: 'Ujian ini berbayar. Buka aksesnya dengan token terlebih dahulu.',
  material: 'Bahan ajar ini berbayar. Buka aksesnya dengan token terlebih dahulu.',
};
