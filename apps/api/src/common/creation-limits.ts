import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import type { DbService } from '../prisma/prisma-db-adapter';
import { isPaidItem } from './paid-content';

/**
 * Batas pembuatan konten untuk Proktor, diatur Admin di Komisi → Proktor:
 *  - `can_create_exams` / `can_create_materials`: boleh membuat ujian /
 *    menerbitkan bahan ajar sama sekali;
 *  - `free_exam_quota` / `free_material_quota`: jumlah ujian gratis / bahan ajar
 *    gratis yang sudah terbit. NULL = tanpa batas. Bila habis, konten berikutnya
 *    wajib berbayar.
 * Admin tidak dibatasi. Pengguna tanpa profil Proktor juga tidak dibatasi
 * (perilaku sebelum fitur ini).
 */
export type CreationKind = 'exam' | 'material';

export interface FreeQuota {
    /** null = tanpa batas. */
    quota: number | null;
    used: number;
    remaining: number | null;
}

export interface CreationLimits {
    unlimited: boolean;
    canCreateExams: boolean;
    canCreateMaterials: boolean;
    freeExam: FreeQuota;
    freeMaterial: FreeQuota;
}

const LABEL: Record<CreationKind, string> = { exam: 'ujian', material: 'bahan ajar' };

/** Admin/Superadmin: tidak terkena izin maupun kuota Proktor. */
export function isAdminUser(user: AuthUser): boolean {
    const roles = (user.roles || []).map(role => String(role).toUpperCase());
    return user.isPlatformAdmin === true || user.resolved?.superadmin === true || roles.includes('ADMIN') || roles.includes('SUPERADMIN');
}

const quota = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : null;
};

/** Ujian gratis milik pengguna (bukan arsip, bukan ujian folder ASAS/AM). */
async function countFreeExams(db: Pick<DbService, 'from'>, userId: string, excludeId?: string): Promise<number> {
    const { data, error } = await db.from('cbt_exams').select('id, is_paid, token_price, status, metadata').eq('created_by', userId);
    if (error) throw new InternalServerErrorException('Kuota ujian gratis belum dapat dihitung.');
    return ((data as any[]) || []).filter(exam => exam.id !== excludeId && exam.status !== 'archived'
        && exam.metadata?.is_pas_exam !== true && !isPaidItem(exam)).length;
}

/** Bahan ajar gratis milik pengguna yang sudah terbit. */
async function countFreeMaterials(db: Pick<DbService, 'from'>, userId: string, excludeId?: string): Promise<number> {
    const { data, error } = await db.from('cbt_learning_materials').select('id, is_paid, token_price, status').eq('created_by', userId);
    if (error) throw new InternalServerErrorException('Kuota bahan ajar gratis belum dapat dihitung.');
    return ((data as any[]) || []).filter(row => row.id !== excludeId && row.status === 'published' && !isPaidItem(row)).length;
}

function summarize(limit: number | null, used: number): FreeQuota {
    return { quota: limit, used, remaining: limit === null ? null : Math.max(limit - used, 0) };
}

export async function loadCreationLimits(db: Pick<DbService, 'from'>, user: AuthUser): Promise<CreationLimits> {
    const [examsUsed, materialsUsed] = await Promise.all([countFreeExams(db, user.id), countFreeMaterials(db, user.id)]);
    if (isAdminUser(user)) {
        return { unlimited: true, canCreateExams: true, canCreateMaterials: true,
            freeExam: summarize(null, examsUsed), freeMaterial: summarize(null, materialsUsed) };
    }
    const { data, error } = await db.from('proctor_profiles')
        .select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw new InternalServerErrorException('Izin pembuatan konten belum dapat dibaca.');
    const row = data as { can_create_exams?: boolean | null; can_create_materials?: boolean | null; free_exam_quota?: unknown; free_material_quota?: unknown } | null;
    return {
        unlimited: false,
        canCreateExams: row?.can_create_exams !== false,
        canCreateMaterials: row?.can_create_materials !== false,
        freeExam: summarize(quota(row?.free_exam_quota), examsUsed),
        freeMaterial: summarize(quota(row?.free_material_quota), materialsUsed),
    };
}

/** Tolak bila Admin menonaktifkan akses membuat ujian / menerbitkan bahan ajar. */
export async function assertMayCreate(db: Pick<DbService, 'from'>, user: AuthUser, kind: CreationKind): Promise<void> {
    if (isAdminUser(user)) return;
    const limits = await loadCreationLimits(db, user);
    const allowed = kind === 'exam' ? limits.canCreateExams : limits.canCreateMaterials;
    if (!allowed) {
        throw new ForbiddenException(kind === 'exam'
            ? 'Akses membuat ujian Anda sedang dinonaktifkan Admin.'
            : 'Akses menerbitkan bahan ajar Anda sedang dinonaktifkan Admin.');
    }
}

/**
 * Tolak konten GRATIS baru bila kuota gratis pengguna habis. `excludeId` =
 * item yang sedang disunting, supaya ia tidak dihitung dua kali.
 */
export async function assertFreeQuotaAvailable(db: Pick<DbService, 'from'>, user: AuthUser, kind: CreationKind, excludeId?: string): Promise<void> {
    if (isAdminUser(user)) return;
    const { data, error } = await db.from('proctor_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw new InternalServerErrorException('Kuota konten gratis belum dapat dibaca.');
    const limit = quota((data as Record<string, unknown> | null)?.[kind === 'exam' ? 'free_exam_quota' : 'free_material_quota']);
    if (limit === null) return;
    const used = kind === 'exam' ? await countFreeExams(db, user.id, excludeId) : await countFreeMaterials(db, user.id, excludeId);
    if (used >= limit) {
        throw new ForbiddenException(`Kuota ${LABEL[kind]} gratis Anda sudah habis (${used}/${limit}). Jadikan ${LABEL[kind]} ini berbayar dan tentukan harga tokennya.`);
    }
}
