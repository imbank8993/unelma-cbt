import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@acca-cbt/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProcessPayoutDto,
  RegisterProctorDto,
  UpdateCommissionConfigDto,
  UpdateProctorPermissionsDto,
} from './commissions.dto';

export interface CommissionConfig {
  admin_share_pct: number;
  proctor_share_pct: number;
  token_idr_rate: number;
  min_withdrawal_tokens: number;
  min_exam_token_price: number;
  min_material_token_price: number;
}

const DEFAULT_CONFIG: CommissionConfig = {
  admin_share_pct: 40,
  proctor_share_pct: 60,
  token_idr_rate: 5000,
  min_withdrawal_tokens: 200,
  min_exam_token_price: 1,
  min_material_token_price: 1,
};

/** Peran yang boleh mendaftarkan rekening penerima komisi (pembuat konten). */
const CONTENT_CREATOR_ROLES = ['PROKTOR', 'GURU', 'ADMIN', 'SUPERADMIN'];

type RawClient = Pick<PrismaService, '$queryRawUnsafe'>;

/**
 * Pendapatan pembuat konten dihitung dari token yang BENAR-BENAR dipotong saat
 * siswa membuka item (`token_transactions` jenis `usage`), bukan dari harga item
 * saat ini. Dengan begitu menaikkan harga setelah siswa membuka item tidak
 * menggelembungkan komisi, dan menggratiskan item tidak menghapus komisi sah.
 *
 * `$1` opsional: batasi ke satu pemilik konten.
 */
const EARNINGS_SQL = `
  SELECT owner_id,
         COUNT(*)::int AS unlock_count,
         COALESCE(SUM(tokens), 0)::int AS gross_tokens
  FROM (
    SELECT e.created_by AS owner_id, -tt.amount AS tokens
    FROM public.token_transactions tt
    JOIN public.cbt_exams e ON tt.reference_id = e.id::text
    WHERE tt.type = 'usage' AND tt.amount < 0
    UNION ALL
    SELECT m.created_by AS owner_id, -tt.amount AS tokens
    FROM public.token_transactions tt
    JOIN public.cbt_learning_materials m ON tt.reference_id = m.id::text
    WHERE tt.type = 'usage' AND tt.amount < 0
  ) revenue
  WHERE owner_id IS NOT NULL AND ($1::uuid IS NULL OR owner_id = $1::uuid)
  GROUP BY owner_id
`;

const PAID_SQL = `
  SELECT proctor_id,
         COALESCE(SUM(proctor_tokens), 0)::int AS paid_tokens,
         COALESCE(SUM(total_idr), 0)::float8 AS paid_idr
  FROM public.proctor_payouts
  WHERE status = 'paid' AND ($1::uuid IS NULL OR proctor_id = $1::uuid)
  GROUP BY proctor_id
`;

/** Hanya tautan http(s) yang disimpan: nilainya dipakai sebagai <iframe src>/<a href> di halaman proktor. */
export function normalizeProofUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.href;
  } catch {
    /* jatuh ke error di bawah */
  }
  throw new BadRequestException('Tautan bukti transfer harus berupa URL http(s) yang valid.');
}

export function proctorShare(grossTokens: number, config: CommissionConfig): number {
  return Math.floor((Math.max(0, grossTokens) * config.proctor_share_pct) / 100);
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  return e?.code === '23505' || e?.meta?.code === '23505' || /23505|duplicate key|unique constraint/i.test(String(e?.message || ''));
}

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // 1. CONFIGURATION
  // ─────────────────────────────────────────────────────────────

  async getConfig(): Promise<CommissionConfig> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT value FROM public.acca_settings WHERE key = 'commission_config' LIMIT 1
    `);
    if (!rows.length || !rows[0].value) {
      return DEFAULT_CONFIG;
    }
    const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    return {
      admin_share_pct: Number(val.admin_share_pct ?? DEFAULT_CONFIG.admin_share_pct),
      proctor_share_pct: Number(val.proctor_share_pct ?? DEFAULT_CONFIG.proctor_share_pct),
      token_idr_rate: Number(val.token_idr_rate ?? DEFAULT_CONFIG.token_idr_rate),
      min_withdrawal_tokens: Number(val.min_withdrawal_tokens ?? DEFAULT_CONFIG.min_withdrawal_tokens),
      min_exam_token_price: Number(val.min_exam_token_price ?? DEFAULT_CONFIG.min_exam_token_price),
      min_material_token_price: Number(val.min_material_token_price ?? DEFAULT_CONFIG.min_material_token_price),
    };
  }

  async updateConfig(dto: UpdateCommissionConfigDto) {
    if (dto.admin_share_pct + dto.proctor_share_pct !== 100) {
      throw new BadRequestException('Total persentase komisi Admin dan Proktor harus bernilai 100%');
    }
    const config: CommissionConfig = {
      admin_share_pct: dto.admin_share_pct,
      proctor_share_pct: dto.proctor_share_pct,
      token_idr_rate: dto.token_idr_rate,
      min_withdrawal_tokens: dto.min_withdrawal_tokens,
      min_exam_token_price: dto.min_exam_token_price,
      min_material_token_price: dto.min_material_token_price,
    };

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO public.acca_settings (key, value, updated_at)
      VALUES ('commission_config', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = $1::jsonb, updated_at = NOW()
    `, JSON.stringify(config));

    return { success: true, config };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ADMIN SUMMARY & PAYOUT MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  private async earningsFor(db: RawClient, ownerId: string) {
    const [earned] = await db.$queryRawUnsafe<any[]>(EARNINGS_SQL, ownerId);
    const [paid] = await db.$queryRawUnsafe<any[]>(PAID_SQL, ownerId);
    return {
      unlocks: Number(earned?.unlock_count || 0),
      grossTokens: Number(earned?.gross_tokens || 0),
      paidTokens: Number(paid?.paid_tokens || 0),
      paidIdr: Number(paid?.paid_idr || 0),
    };
  }

  async getAdminSummary() {
    const config = await this.getConfig();

    // Satu query untuk seluruh daftar (sebelumnya 3 query per proktor).
    // Yang tampil: pemegang peran Proktor, pemilik profil rekening, dan siapa
    // pun yang kontennya sudah menghasilkan token (mis. Guru).
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      WITH earnings AS (${EARNINGS_SQL.replace('$1::uuid IS NULL OR owner_id = $1::uuid', 'TRUE')}),
           paid AS (${PAID_SQL.replace('$1::uuid IS NULL OR proctor_id = $1::uuid', 'TRUE')})
      SELECT
        p.id AS user_id,
        p.email,
        p.full_name,
        prof.id AS profile_id,
        CASE WHEN prof.nik IS NULL THEN NULL
             ELSE repeat('•', GREATEST(length(prof.nik) - 4, 0)) || right(prof.nik, 4) END AS nik,
        prof.whatsapp,
        prof.bank1_name,
        prof.bank1_account_name,
        prof.bank1_account_number,
        prof.bank2_name,
        prof.bank2_account_name,
        prof.bank2_account_number,
        COALESCE(prof.can_create_exams, true) AS can_create_exams,
        COALESCE(prof.can_create_materials, true) AS can_create_materials,
        COALESCE(prof.status, 'approved') AS profile_status,
        COALESCE(earnings.unlock_count, 0)::int AS total_unlocks,
        COALESCE(earnings.gross_tokens, 0)::int AS gross_tokens,
        COALESCE(paid.paid_tokens, 0)::int AS paid_tokens,
        COALESCE(paid.paid_idr, 0)::float8 AS paid_idr
      FROM public.cbt_profiles p
      LEFT JOIN public.proctor_profiles prof ON prof.user_id = p.id
      LEFT JOIN earnings ON earnings.owner_id = p.id
      LEFT JOIN paid ON paid.proctor_id = p.id
      WHERE prof.id IS NOT NULL
         OR earnings.owner_id IS NOT NULL
         OR EXISTS (
           SELECT 1
           FROM public.cbt_organization_members om
           JOIN public.cbt_member_roles mr ON mr.organization_member_id = om.id
           JOIN public.cbt_roles r ON r.id = mr.role_id
           WHERE om.user_id = p.id AND lower(r.name) = 'proktor'
         )
      ORDER BY p.full_name ASC NULLS LAST
    `);

    const proctors = rows.map((row) => {
      const grossTokens = Number(row.gross_tokens || 0);
      const earned = proctorShare(grossTokens, config);
      const paidTokens = Number(row.paid_tokens || 0);
      const pendingTokens = Math.max(0, earned - paidTokens);
      const isEligible = pendingTokens >= config.min_withdrawal_tokens;
      return {
        ...row,
        total_unlocks: Number(row.total_unlocks || 0),
        gross_tokens: grossTokens,
        proctor_tokens_earned: earned,
        total_idr_earned: earned * config.token_idr_rate,
        paid_tokens: paidTokens,
        paid_idr: Number(row.paid_idr || 0),
        pending_tokens: pendingTokens,
        pending_idr: pendingTokens * config.token_idr_rate,
        status: isEligible ? 'eligible' : 'accumulating',
        is_eligible: isEligible,
      };
    });

    return { config, proctors };
  }

  /**
   * Catat pencairan. Jumlahnya DIHITUNG SERVER dari saldo yang belum dicairkan
   * (bukan dari angka kiriman browser), di dalam transaksi yang dikunci per
   * proktor sehingga klik ganda tidak membuat dua pencairan. Setiap pencairan
   * adalah baris baru — tidak pernah menimpa pencairan sebelumnya.
   */
  async processPayout(adminUserId: string, dto: ProcessPayoutDto) {
    const proofUrl = normalizeProofUrl(dto.transfer_proof_url);
    const config = await this.getConfig();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext($1))) l`,
          `proctor_payout:${dto.proctor_id}`,
        );

        const owner = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM public.cbt_profiles WHERE id = $1::uuid`,
          dto.proctor_id,
        );
        if (!owner.length) throw new NotFoundException('Proktor tidak ditemukan.');

        const earnings = await this.earningsFor(tx, dto.proctor_id);
        const earned = proctorShare(earnings.grossTokens, config);
        const pendingTokens = Math.max(0, earned - earnings.paidTokens);
        if (pendingTokens < config.min_withdrawal_tokens) {
          throw new BadRequestException(
            `Saldo komisi yang belum dicairkan (${pendingTokens} token) belum memenuhi batas minimal ${config.min_withdrawal_tokens} token.`,
          );
        }

        const rows = await tx.$queryRawUnsafe<any[]>(`
          INSERT INTO public.proctor_payouts (
            proctor_id, period_month, total_tokens, proctor_share_pct,
            proctor_tokens, rate_per_token_idr, total_idr, status,
            transfer_proof_url, notes, paid_at, processed_by, created_at, updated_at
          )
          VALUES (
            $1::uuid, $2, $3, $4,
            $5, $6, $7, 'paid',
            $8, $9, NOW(), $10::uuid, NOW(), NOW()
          )
          RETURNING *
        `,
          dto.proctor_id,
          dto.period_month,
          earnings.grossTokens,
          config.proctor_share_pct,
          pendingTokens,
          config.token_idr_rate,
          pendingTokens * config.token_idr_rate,
          proofUrl,
          (dto.notes || '').trim(),
          adminUserId,
        );

        return { success: true, payout: rows[0] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException(
          'Proktor ini sudah dicairkan pada periode tersebut. Jalankan migrasi 20261111_03_proctor_payouts_multi.sql agar pencairan kedua dalam bulan yang sama bisa dicatat, atau pilih periode lain.',
        );
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PROKTOR DETAIL & RIWAYAT PRIBADI
  // ─────────────────────────────────────────────────────────────

  async getProctorMySummary(userId: string) {
    const config = await this.getConfig();

    const profiles = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.proctor_profiles WHERE user_id = $1::uuid LIMIT 1
    `, userId);
    const profile = profiles[0] || null;

    // Rincian per item: token yang benar-benar dibayar siswa untuk item itu.
    const itemSql = (table: string) => `
      SELECT
        i.id,
        i.title,
        i.token_price,
        COUNT(DISTINCT tt.user_id)::int AS total_students,
        COALESCE(SUM(-tt.amount), 0)::int AS total_tokens
      FROM public.${table} i
      LEFT JOIN public.token_transactions tt
        ON tt.reference_id = i.id::text AND tt.type = 'usage' AND tt.amount < 0
      WHERE i.created_by = $1::uuid AND (i.is_paid = true OR tt.id IS NOT NULL)
      GROUP BY i.id, i.title, i.token_price, i.created_at
      ORDER BY i.created_at DESC
    `;
    const withShare = (rows: any[]) => rows.map((row) => {
      const proctorTokens = proctorShare(Number(row.total_tokens || 0), config);
      return { ...row, proctor_tokens: proctorTokens, proctor_idr: proctorTokens * config.token_idr_rate };
    });
    const exams = withShare(await this.prisma.$queryRawUnsafe<any[]>(itemSql('cbt_exams'), userId));
    const materials = withShare(await this.prisma.$queryRawUnsafe<any[]>(itemSql('cbt_learning_materials'), userId));

    const payouts = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.*,
        adm.full_name as processed_by_name
      FROM public.proctor_payouts p
      LEFT JOIN public.cbt_profiles adm ON adm.id = p.processed_by
      WHERE p.proctor_id = $1::uuid
      ORDER BY p.period_month DESC, p.created_at DESC
    `, userId);

    const earnings = await this.earningsFor(this.prisma, userId);
    const proctorTokensEarned = proctorShare(earnings.grossTokens, config);
    const pendingTokens = Math.max(0, proctorTokensEarned - earnings.paidTokens);
    const isEligible = pendingTokens >= config.min_withdrawal_tokens;

    return {
      config,
      profile,
      summary: {
        total_unlocks: earnings.unlocks,
        gross_tokens: earnings.grossTokens,
        proctor_tokens_earned: proctorTokensEarned,
        total_idr_earned: proctorTokensEarned * config.token_idr_rate,
        paid_tokens: earnings.paidTokens,
        paid_idr: earnings.paidIdr,
        pending_tokens: pendingTokens,
        pending_idr: pendingTokens * config.token_idr_rate,
        status: isEligible ? 'eligible' : 'accumulating',
        is_eligible: isEligible,
      },
      exams,
      materials,
      payouts,
    };
  }

  async registerOrUpdateProfile(user: AuthUser, dto: RegisterProctorDto) {
    const roles = (user.roles || []).map((role) => String(role).toUpperCase());
    const allowed = user.isPlatformAdmin || user.resolved?.superadmin === true
      || roles.some((role) => CONTENT_CREATOR_ROLES.includes(role));
    if (!allowed) {
      throw new ForbiddenException('Hanya Proktor, Guru, atau Admin yang dapat mendaftarkan rekening penerima komisi.');
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO public.proctor_profiles (
        user_id, full_name, nik, whatsapp, email,
        bank1_name, bank1_account_name, bank1_account_number,
        bank2_name, bank2_account_name, bank2_account_number,
        can_create_exams, can_create_materials, status, updated_at
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        true, true, 'approved', NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        full_name = $2,
        nik = $3,
        whatsapp = $4,
        email = $5,
        bank1_name = $6,
        bank1_account_name = $7,
        bank1_account_number = $8,
        bank2_name = $9,
        bank2_account_name = $10,
        bank2_account_number = $11,
        updated_at = NOW()
      RETURNING *
    `,
      user.id,
      dto.full_name,
      dto.nik,
      dto.whatsapp,
      dto.email,
      dto.bank1_name,
      dto.bank1_account_name,
      dto.bank1_account_number,
      dto.bank2_name || null,
      dto.bank2_account_name || null,
      dto.bank2_account_number || null
    );

    return { success: true, profile: rows[0] };
  }

  async updateProctorPermissions(profileId: string, dto: UpdateProctorPermissionsDto) {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.proctor_profiles WHERE id = $1::uuid
    `, profileId);
    if (!existing.length) throw new NotFoundException('Profil proktor tidak ditemukan.');

    const curr = existing[0];
    const canExams = dto.can_create_exams ?? curr.can_create_exams;
    const canMats = dto.can_create_materials ?? curr.can_create_materials;
    const status = dto.status ?? curr.status;

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      UPDATE public.proctor_profiles
      SET can_create_exams = $1, can_create_materials = $2, status = $3, updated_at = NOW()
      WHERE id = $4::uuid
      RETURNING id, user_id, can_create_exams, can_create_materials, status
    `, canExams, canMats, status, profileId);

    return { success: true, profile: rows[0] };
  }
}
