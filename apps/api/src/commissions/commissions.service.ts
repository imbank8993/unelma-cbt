import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { advisoryTransactionLock } from '../common/transaction-lock';
import type { AuthUser } from '@acca-cbt/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApplyProctorDto,
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
const CONTENT_CREATOR_ROLES = ['PROKTOR', 'ADMIN', 'SUPERADMIN'];

type RawClient = Pick<PrismaService, '$queryRawUnsafe'>;

/**
 * Pendapatan pembuat konten dihitung dari token yang BENAR-BENAR dipotong saat
 * siswa membuka item (`token_transactions` jenis `usage`), bukan dari harga item
 * saat ini. Dengan begitu menaikkan harga setelah siswa membuka item tidak
 * menggelembungkan komisi, dan menggratiskan item tidak menghapus komisi sah.
 *
 * Bagi hasil mengikuti aturan yang BERLAKU PADA TANGGAL transaksi
 * (`commission_rule_history`): aturan yang diubah tanggal 30 hanya berlaku untuk
 * transaksi mulai tanggal 30; transaksi tanggal 29 ke bawah tetap memakai aturan
 * lama. `weighted` = Σ(token × persen proktor), sehingga komisi = ⌊weighted/100⌋.
 *
 * Parameter: `$1` (uuid|null) batasi ke satu pemilik konten; `$2` persen proktor
 * saat ini, dipakai bila tabel riwayat belum ada atau transaksi lebih tua dari
 * aturan tercatat pertama.
 */
function earningsSql(withHistory: boolean) {
  const share = withHistory ? 'COALESCE(rule.proctor_share_pct, $2::int)' : '$2::int';
  const ruleJoin = withHistory
    ? `LEFT JOIN LATERAL (
         SELECT h.proctor_share_pct
         FROM public.commission_rule_history h
         WHERE h.effective_from <= revenue.created_at
         ORDER BY h.effective_from DESC, h.created_at DESC
         LIMIT 1
       ) rule ON TRUE`
    : '';
  return `
  SELECT owner_id,
         COUNT(*)::int AS unlock_count,
         COALESCE(SUM(tokens), 0)::int AS gross_tokens,
         COALESCE(SUM(tokens * ${share}), 0)::float8 AS weighted_tokens
  FROM (
    SELECT e.created_by AS owner_id, -tt.amount AS tokens, tt.created_at
    FROM public.token_transactions tt
    JOIN public.cbt_exams e ON tt.reference_id = e.id::text
    WHERE tt.type = 'usage' AND tt.amount < 0
    UNION ALL
    SELECT m.created_by AS owner_id, -tt.amount AS tokens, tt.created_at
    FROM public.token_transactions tt
    JOIN public.cbt_learning_materials m ON tt.reference_id = m.id::text
    WHERE tt.type = 'usage' AND tt.amount < 0
  ) revenue
  ${ruleJoin}
  WHERE owner_id IS NOT NULL AND ($1::uuid IS NULL OR owner_id = $1::uuid)
  GROUP BY owner_id
`;
}

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

/** Komisi proktor dari Σ(token × persen) — tiap transaksi memakai persen pada tanggalnya. */
export function shareFromWeighted(weightedTokens: unknown): number {
  return Math.floor(Math.max(0, Number(weightedTokens) || 0) / 100);
}

function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  return e?.meta?.code === '42703' || e?.code === '42703' || /42703|column .* does not exist/i.test(String(e?.message || ''));
}

const APPLICATION_MIGRATION_MESSAGE =
  'Fitur pengajuan Proktor belum siap: jalankan migrasi 20261111_04_google_only_proctor_applications.sql.';

function upperRoles(user: AuthUser): string[] {
  return (user.roles || []).map((role) => String(role).toUpperCase());
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; meta?: { code?: string }; message?: string };
  return e?.code === '23505' || e?.meta?.code === '23505' || /23505|duplicate key|unique constraint/i.test(String(e?.message || ''));
}

@Injectable()
export class CommissionsService {
  private historyKnown: { value: boolean; checkedAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  /** Tabel riwayat aturan ada (migrasi 20261111_04)? Positif disimpan permanen, negatif dicek ulang tiap menit. */
  private async hasRuleHistory(): Promise<boolean> {
    if (this.historyKnown && (this.historyKnown.value || Date.now() - this.historyKnown.checkedAt < 60_000)) {
      return this.historyKnown.value;
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT to_regclass('public.commission_rule_history') IS NOT NULL AS ok`,
    );
    const value = Boolean(rows[0]?.ok);
    this.historyKnown = { value, checkedAt: Date.now() };
    return value;
  }

  private async schoolTimeZone(): Promise<string> {
    try {
      return (await this.settings?.getSchoolTimeZone?.()) || 'Asia/Makassar';
    } catch {
      return 'Asia/Makassar';
    }
  }

  async getRuleHistory(limit = 20) {
    if (!(await this.hasRuleHistory())) return [];
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT h.id, h.admin_share_pct, h.proctor_share_pct, h.token_idr_rate::float8 AS token_idr_rate,
             CASE WHEN h.effective_from = '-infinity'::timestamptz THEN NULL ELSE h.effective_from END AS effective_from,
             h.created_at, adm.full_name AS created_by_name
      FROM public.commission_rule_history h
      LEFT JOIN public.cbt_profiles adm ON adm.id = h.created_by
      ORDER BY h.effective_from DESC, h.created_at DESC
      LIMIT $1
    `, limit);
  }

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

  async updateConfig(dto: UpdateCommissionConfigDto, actorId?: string) {
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

    const withHistory = await this.hasRuleHistory();
    const timeZone = await this.schoolTimeZone();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO public.acca_settings (key, value, updated_at)
        VALUES ('commission_config', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE
        SET value = $1::jsonb, updated_at = NOW()
      `, JSON.stringify(config));

      if (withHistory) {
        // Berlaku sejak awal HARI INI (zona waktu sekolah): transaksi hari ini
        // memakai aturan baru, transaksi kemarin ke bawah tetap aturan lama.
        // Perubahan berikutnya di hari yang sama menggantikan aturan hari itu.
        await tx.$executeRawUnsafe(`
          INSERT INTO public.commission_rule_history (
            admin_share_pct, proctor_share_pct, token_idr_rate,
            min_withdrawal_tokens, min_exam_token_price, min_material_token_price,
            effective_from, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6,
                  date_trunc('day', NOW() AT TIME ZONE $7) AT TIME ZONE $7,
                  $8::uuid)
        `,
          config.admin_share_pct, config.proctor_share_pct, config.token_idr_rate,
          config.min_withdrawal_tokens, config.min_exam_token_price, config.min_material_token_price,
          timeZone, actorId || null,
        );
      }
    });

    return { success: true, config };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ADMIN SUMMARY & PAYOUT MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  private async earningsFor(db: RawClient, ownerId: string, config: CommissionConfig) {
    const withHistory = await this.hasRuleHistory();
    const [earned] = await db.$queryRawUnsafe<any[]>(earningsSql(withHistory), ownerId, config.proctor_share_pct);
    const [paid] = await db.$queryRawUnsafe<any[]>(PAID_SQL, ownerId);
    return {
      unlocks: Number(earned?.unlock_count || 0),
      grossTokens: Number(earned?.gross_tokens || 0),
      earnedTokens: shareFromWeighted(earned?.weighted_tokens),
      paidTokens: Number(paid?.paid_tokens || 0),
      paidIdr: Number(paid?.paid_idr || 0),
    };
  }

  async getAdminSummary() {
    const config = await this.getConfig();

    // Satu query untuk seluruh daftar (sebelumnya 3 query per proktor).
    // Yang tampil: pemegang peran Proktor, pemilik profil rekening, dan siapa
    // pun yang kontennya sudah menghasilkan token.
    const withHistory = await this.hasRuleHistory();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      WITH earnings AS (${earningsSql(withHistory)}),
           paid AS (${PAID_SQL})
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
        COALESCE(earnings.weighted_tokens, 0)::float8 AS weighted_tokens,
        COALESCE(paid.paid_tokens, 0)::int AS paid_tokens,
        COALESCE(paid.paid_idr, 0)::float8 AS paid_idr
      FROM public.cbt_profiles p
      LEFT JOIN public.proctor_profiles prof ON prof.user_id = p.id
      LEFT JOIN earnings ON earnings.owner_id = p.id
      LEFT JOIN paid ON paid.proctor_id = p.id
      WHERE (prof.id IS NOT NULL AND COALESCE(prof.status, 'approved') = 'approved')
         OR earnings.owner_id IS NOT NULL
         OR EXISTS (
           SELECT 1
           FROM public.cbt_organization_members om
           JOIN public.cbt_member_roles mr ON mr.organization_member_id = om.id
           JOIN public.cbt_roles r ON r.id = mr.role_id
           WHERE om.user_id = p.id AND lower(r.name) = 'proktor'
         )
      ORDER BY p.full_name ASC NULLS LAST
    `, null, config.proctor_share_pct);

    const proctors = rows.map(({ weighted_tokens: weightedTokens, ...row }) => {
      const grossTokens = Number(row.gross_tokens || 0);
      const earned = shareFromWeighted(weightedTokens);
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

    return { config, proctors, rule_history: await this.getRuleHistory() };
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
        await advisoryTransactionLock(
          { raw: (sql: string, ...params: unknown[]) => tx.$queryRawUnsafe(sql, ...params) } as never,
          `proctor_payout:${dto.proctor_id}`,
        );

        const owner = await tx.$queryRawUnsafe<any[]>(
          `SELECT id FROM public.cbt_profiles WHERE id = $1::uuid`,
          dto.proctor_id,
        );
        if (!owner.length) throw new NotFoundException('Proktor tidak ditemukan.');

        const earnings = await this.earningsFor(tx, dto.proctor_id, config);
        const earned = earnings.earnedTokens;
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
    const withHistory = await this.hasRuleHistory();
    const itemSql = (table: string) => `
      SELECT
        i.id,
        i.title,
        i.token_price,
        COUNT(DISTINCT tt.user_id)::int AS total_students,
        COALESCE(SUM(-tt.amount), 0)::int AS total_tokens,
        COALESCE(SUM(-tt.amount * ${withHistory ? 'COALESCE(rule.proctor_share_pct, $2::int)' : '$2::int'}), 0)::float8 AS weighted_tokens
      FROM public.${table} i
      LEFT JOIN public.token_transactions tt
        ON tt.reference_id = i.id::text AND tt.type = 'usage' AND tt.amount < 0
      ${withHistory ? `LEFT JOIN LATERAL (
        SELECT h.proctor_share_pct
        FROM public.commission_rule_history h
        WHERE h.effective_from <= tt.created_at
        ORDER BY h.effective_from DESC, h.created_at DESC
        LIMIT 1
      ) rule ON TRUE` : ''}
      WHERE i.created_by = $1::uuid AND (i.is_paid = true OR tt.id IS NOT NULL)
      GROUP BY i.id, i.title, i.token_price, i.created_at
      ORDER BY i.created_at DESC
    `;
    const withShare = (rows: any[]) => rows.map(({ weighted_tokens: weightedTokens, ...row }) => {
      const proctorTokens = shareFromWeighted(weightedTokens);
      return { ...row, proctor_tokens: proctorTokens, proctor_idr: proctorTokens * config.token_idr_rate };
    });
    const exams = withShare(await this.prisma.$queryRawUnsafe<any[]>(itemSql('cbt_exams'), userId, config.proctor_share_pct));
    const materials = withShare(await this.prisma.$queryRawUnsafe<any[]>(itemSql('cbt_learning_materials'), userId, config.proctor_share_pct));

    const payouts = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.*,
        adm.full_name as processed_by_name
      FROM public.proctor_payouts p
      LEFT JOIN public.cbt_profiles adm ON adm.id = p.processed_by
      WHERE p.proctor_id = $1::uuid
      ORDER BY p.period_month DESC, p.created_at DESC
    `, userId);

    const earnings = await this.earningsFor(this.prisma, userId, config);
    const proctorTokensEarned = earnings.earnedTokens;
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
      throw new ForbiddenException('Hanya Proktor atau Admin yang dapat memperbarui rekening penerima komisi. Ajukan diri menjadi Proktor terlebih dahulu.');
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

  // ─────────────────────────────────────────────────────────────
  // 4. PENGAJUAN MENJADI PROKTOR
  // ─────────────────────────────────────────────────────────────

  private static readonly APPLICATION_COLUMNS = `
    prof.id, prof.user_id, prof.full_name, prof.nik, prof.whatsapp, prof.email,
    prof.bank1_name, prof.bank1_account_name, prof.bank1_account_number,
    prof.bank2_name, prof.bank2_account_name, prof.bank2_account_number,
    prof.status, prof.expertise, prof.motivation, prof.submitted_at,
    prof.reviewed_at, prof.rejection_reason, prof.created_at, prof.updated_at
  `;

  /** Status pengajuan milik pengguna yang login (null bila belum pernah mengajukan). */
  async getMyApplication(user: AuthUser) {
    const roles = upperRoles(user);
    const isProctor = roles.includes('PROKTOR') || roles.includes('ADMIN') || user.isPlatformAdmin === true;
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT ${CommissionsService.APPLICATION_COLUMNS}
        FROM public.proctor_profiles prof
        WHERE prof.user_id = $1::uuid
        LIMIT 1
      `, user.id);
      return { application: rows[0] || null, is_proctor: isProctor, email: user.email || '' };
    } catch (error) {
      if (isMissingColumn(error)) throw new BadRequestException(APPLICATION_MIGRATION_MESSAGE);
      throw error;
    }
  }

  /**
   * Ajukan diri menjadi Proktor dengan akun Google yang sedang login. Pengajuan
   * yang ditolak boleh diajukan ulang; selama menunggu, isinya boleh diperbarui.
   */
  async applyAsProctor(user: AuthUser, dto: ApplyProctorDto) {
    const roles = upperRoles(user);
    if (roles.includes('PROKTOR') || roles.includes('ADMIN') || user.isPlatformAdmin === true) {
      throw new BadRequestException('Akun Anda sudah berperan Proktor/Admin. Perbarui data rekening di menu Komisi Saya.');
    }
    const email = (user.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Masuk dengan akun Google terlebih dahulu.');

    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO public.proctor_profiles (
          user_id, full_name, nik, whatsapp, email,
          bank1_name, bank1_account_name, bank1_account_number,
          bank2_name, bank2_account_name, bank2_account_number,
          expertise, motivation,
          can_create_exams, can_create_materials, status,
          submitted_at, reviewed_at, reviewed_by, rejection_reason, updated_at
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, $13,
          true, true, 'pending',
          NOW(), NULL, NULL, NULL, NOW()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          full_name = $2, nik = $3, whatsapp = $4, email = $5,
          bank1_name = $6, bank1_account_name = $7, bank1_account_number = $8,
          bank2_name = $9, bank2_account_name = $10, bank2_account_number = $11,
          expertise = $12, motivation = $13,
          status = 'pending', submitted_at = NOW(),
          reviewed_at = NULL, reviewed_by = NULL, rejection_reason = NULL,
          updated_at = NOW()
        RETURNING id, status, submitted_at
      `,
        user.id, dto.full_name, dto.nik, dto.whatsapp, email,
        dto.bank1_name, dto.bank1_account_name, dto.bank1_account_number,
        dto.bank2_name || null, dto.bank2_account_name || null, dto.bank2_account_number || null,
        dto.expertise, dto.motivation,
      );

      // Role tidak boleh ganda: cabut peran Siswa jika ada agar akun murni berstatus pemohon Proktor.
      const [member] = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM public.cbt_organization_members WHERE user_id = $1::uuid LIMIT 1`,
        user.id,
      );
      if (member) {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM public.cbt_member_roles mr
           USING public.cbt_roles r
           WHERE mr.organization_member_id = $1::uuid AND r.id = mr.role_id AND lower(r.name) = 'siswa'`,
          member.id,
        );
      }

      return { success: true, application: rows[0] };
    } catch (error) {
      if (isMissingColumn(error)) throw new BadRequestException(APPLICATION_MIGRATION_MESSAGE);
      throw error;
    }
  }

  async listApplications(status = 'pending') {
    const filter = ['pending', 'approved', 'rejected'].includes(status) ? status : null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT ${CommissionsService.APPLICATION_COLUMNS},
               p.full_name AS account_name, p.email AS account_email, p.avatar_url,
               reviewer.full_name AS reviewed_by_name
        FROM public.proctor_profiles prof
        LEFT JOIN public.cbt_profiles p ON p.id = prof.user_id
        LEFT JOIN public.cbt_profiles reviewer ON reviewer.id = prof.reviewed_by
        WHERE prof.submitted_at IS NOT NULL
          AND ($1::text IS NULL OR prof.status = $1)
        ORDER BY (prof.status = 'pending') DESC, prof.submitted_at DESC
        LIMIT 500
      `, filter);
      const [counts] = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
        FROM public.proctor_profiles
        WHERE submitted_at IS NOT NULL
      `);
      return { applications: rows, counts: counts || { pending: 0, approved: 0, rejected: 0 } };
    } catch (error) {
      if (isMissingColumn(error)) throw new BadRequestException(APPLICATION_MIGRATION_MESSAGE);
      throw error;
    }
  }

  /** Setujui: status approved + peran Proktor diberikan (menggantikan Siswa), dalam satu transaksi. */
  async approveApplication(admin: AuthUser, profileId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [application] = await tx.$queryRawUnsafe<any[]>(`
        SELECT id, user_id, status FROM public.proctor_profiles WHERE id = $1::uuid FOR UPDATE
      `, profileId);
      if (!application) throw new NotFoundException('Pengajuan tidak ditemukan.');
      if (application.status !== 'pending') {
        throw new BadRequestException('Hanya pengajuan berstatus menunggu yang dapat disetujui.');
      }

      const [member] = await tx.$queryRawUnsafe<any[]>(`
        SELECT id FROM public.cbt_organization_members WHERE user_id = $1::uuid LIMIT 1
      `, application.user_id);
      if (!member) {
        throw new BadRequestException('Akun pengaju belum terdaftar di sekolah. Minta pengaju masuk dengan Google sekali lagi.');
      }
      const [proktorRole] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM public.cbt_roles WHERE lower(name) = 'proktor' LIMIT 1`,
      );
      if (!proktorRole) throw new BadRequestException('Peran Proktor tidak ditemukan di database.');

      await tx.$executeRawUnsafe(`UPDATE public.cbt_organization_members SET is_active = true WHERE id = $1::uuid`, member.id);
      await tx.$executeRawUnsafe(`
        DELETE FROM public.cbt_member_roles mr
        USING public.cbt_roles r
        WHERE mr.organization_member_id = $1::uuid AND r.id = mr.role_id AND lower(r.name) = 'siswa'
      `, member.id);
      await tx.$executeRawUnsafe(`
        INSERT INTO public.cbt_member_roles (organization_member_id, role_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT DO NOTHING
      `, member.id, proktorRole.id);

      const [updated] = await tx.$queryRawUnsafe<any[]>(`
        UPDATE public.proctor_profiles
        SET status = 'approved', reviewed_at = NOW(), reviewed_by = $2::uuid, rejection_reason = NULL,
            can_create_exams = true, can_create_materials = true, updated_at = NOW()
        WHERE id = $1::uuid
        RETURNING id, user_id, status, reviewed_at
      `, profileId, admin.id);
      return { success: true, application: updated };
    });
  }

  async rejectApplication(admin: AuthUser, profileId: string, reason: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      UPDATE public.proctor_profiles
      SET status = 'rejected', rejection_reason = $3, reviewed_at = NOW(), reviewed_by = $2::uuid, updated_at = NOW()
      WHERE id = $1::uuid AND status = 'pending'
      RETURNING id, user_id, status, reviewed_at, rejection_reason
    `, profileId, admin.id, reason);
    if (!rows.length) throw new BadRequestException('Pengajuan tidak ditemukan atau sudah diproses.');
    return { success: true, application: rows[0] };
  }
}
