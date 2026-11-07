import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const val = rows[0].value;
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

    const json = JSON.stringify(dto);
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO public.acca_settings (key, value, updated_at)
      VALUES ('commission_config', $1::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = $1::jsonb, updated_at = NOW()
    `, json);

    return { success: true, config: dto };
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ADMIN SUMMARY & PAYOUT MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  async getAdminSummary() {
    const config = await this.getConfig();

    // 1. Ambil daftar seluruh proktor (baik dari proctor_profiles, user_roles, maupun yang membuat ujian/materi)
    const proctors = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT
        p.id as user_id,
        p.email,
        p.full_name,
        prof.id as profile_id,
        prof.nik,
        prof.whatsapp,
        prof.bank1_name,
        prof.bank1_account_name,
        prof.bank1_account_number,
        prof.bank2_name,
        prof.bank2_account_name,
        prof.bank2_account_number,
        COALESCE(prof.can_create_exams, true) as can_create_exams,
        COALESCE(prof.can_create_materials, true) as can_create_materials,
        COALESCE(prof.status, 'approved') as profile_status
      FROM public.cbt_profiles p
      LEFT JOIN public.cbt_user_roles ur ON ur.user_id = p.id
      LEFT JOIN public.cbt_roles r ON r.id = ur.role_id
      LEFT JOIN public.proctor_profiles prof ON prof.user_id = p.id
      WHERE lower(r.name) = 'proktor' OR prof.id IS NOT NULL
      ORDER BY p.full_name ASC
    `);

    // 2. Hitung statistik komisi untuk masing-masing proktor
    const summaryList = await Promise.all(
      proctors.map(async (proc) => {
        // Hitung token dari ujian yang dibuat proktor ini
        const examStats = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            COUNT(ui.id)::int as unlock_count,
            COALESCE(SUM(e.token_price), 0)::int as total_exam_tokens
          FROM public.cbt_exams e
          JOIN public.unlocked_items ui ON ui.item_id = e.id::text AND ui.item_type = 'exam'
          WHERE e.created_by = $1::uuid AND e.is_paid = true
        `, proc.user_id);

        // Hitung token dari bahan ajar yang dibuat proktor ini
        const matStats = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            COUNT(ui.id)::int as unlock_count,
            COALESCE(SUM(m.token_price), 0)::int as total_mat_tokens
          FROM public.cbt_learning_materials m
          JOIN public.unlocked_items ui ON ui.item_id = m.id::text AND ui.item_type = 'material'
          WHERE m.created_by = $1::uuid AND m.is_paid = true
        `, proc.user_id);

        const totalUnlocks = (examStats[0]?.unlock_count || 0) + (matStats[0]?.unlock_count || 0);
        const grossTokens = (examStats[0]?.total_exam_tokens || 0) + (matStats[0]?.total_mat_tokens || 0);
        
        // Komisi proktor sesuai persentase yang disetel (misal 60%)
        const proctorTokensEarned = Math.floor((grossTokens * config.proctor_share_pct) / 100);
        const totalIdrEarned = proctorTokensEarned * config.token_idr_rate;

        // Hitung token yang sudah dicairkan
        const payoutStats = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            COALESCE(SUM(proctor_tokens), 0)::int as paid_tokens,
            COALESCE(SUM(total_idr), 0)::numeric as paid_idr
          FROM public.proctor_payouts
          WHERE proctor_id = $1::uuid AND status = 'paid'
        `, proc.user_id);

        const paidTokens = payoutStats[0]?.paid_tokens || 0;
        const paidIdr = Number(payoutStats[0]?.paid_idr || 0);
        const pendingTokens = Math.max(0, proctorTokensEarned - paidTokens);
        const pendingIdr = pendingTokens * config.token_idr_rate;

        // Status pencairan: jika token belum cair >= ambang batas (misal 200), maka 'eligible' (bisa dicairkan)
        const isEligible = pendingTokens >= config.min_withdrawal_tokens;
        const status = isEligible ? 'eligible' : 'accumulating';

        return {
          ...proc,
          total_unlocks: totalUnlocks,
          gross_tokens: grossTokens,
          proctor_tokens_earned: proctorTokensEarned,
          total_idr_earned: totalIdrEarned,
          paid_tokens: paidTokens,
          paid_idr: paidIdr,
          pending_tokens: pendingTokens,
          pending_idr: pendingIdr,
          status, // 'eligible' (>= 200) atau 'accumulating' (< 200)
          is_eligible: isEligible,
        };
      })
    );

    return {
      config,
      proctors: summaryList,
    };
  }

  async processPayout(adminUserId: string, dto: ProcessPayoutDto) {
    const config = await this.getConfig();
    if (dto.proctor_tokens < config.min_withdrawal_tokens) {
      throw new BadRequestException(
        `Penarikan belum memenuhi batas minimal ${config.min_withdrawal_tokens} token.`
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
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
      ON CONFLICT (proctor_id, period_month) DO UPDATE
      SET
        total_tokens = $3,
        proctor_share_pct = $4,
        proctor_tokens = $5,
        rate_per_token_idr = $6,
        total_idr = $7,
        status = 'paid',
        transfer_proof_url = $8,
        notes = $9,
        paid_at = NOW(),
        processed_by = $10::uuid,
        updated_at = NOW()
      RETURNING *
    `,
      dto.proctor_id,
      dto.period_month,
      dto.total_tokens,
      config.proctor_share_pct,
      dto.proctor_tokens,
      config.token_idr_rate,
      dto.total_idr,
      dto.transfer_proof_url,
      dto.notes || '',
      adminUserId
    );

    return { success: true, payout: rows[0] };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PROKTOR DETAIL & RIWAYAT PRIBADI
  // ─────────────────────────────────────────────────────────────

  async getProctorMySummary(userId: string) {
    const config = await this.getConfig();

    // Profil proktor
    const profiles = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.proctor_profiles WHERE user_id = $1::uuid LIMIT 1
    `, userId);
    const profile = profiles[0] || null;

    // Rincian per ujian
    const exams = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        e.id,
        e.title,
        e.token_price,
        COUNT(ui.id)::int as total_students,
        (COUNT(ui.id) * e.token_price)::int as total_tokens,
        FLOOR((COUNT(ui.id) * e.token_price * $2) / 100)::int as proctor_tokens,
        (FLOOR((COUNT(ui.id) * e.token_price * $2) / 100) * $3)::numeric as proctor_idr
      FROM public.cbt_exams e
      LEFT JOIN public.unlocked_items ui ON ui.item_id = e.id::text AND ui.item_type = 'exam'
      WHERE e.created_by = $1::uuid AND e.is_paid = true
      GROUP BY e.id, e.title, e.token_price
      ORDER BY e.created_at DESC
    `, userId, config.proctor_share_pct, config.token_idr_rate);

    // Rincian per bahan ajar
    const materials = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        m.id,
        m.title,
        m.token_price,
        COUNT(ui.id)::int as total_students,
        (COUNT(ui.id) * m.token_price)::int as total_tokens,
        FLOOR((COUNT(ui.id) * m.token_price * $2) / 100)::int as proctor_tokens,
        (FLOOR((COUNT(ui.id) * m.token_price * $2) / 100) * $3)::numeric as proctor_idr
      FROM public.cbt_learning_materials m
      LEFT JOIN public.unlocked_items ui ON ui.item_id = m.id::text AND ui.item_type = 'material'
      WHERE m.created_by = $1::uuid AND m.is_paid = true
      GROUP BY m.id, m.title, m.token_price
      ORDER BY m.created_at DESC
    `, userId, config.proctor_share_pct, config.token_idr_rate);

    // Total gross & proctor tokens
    let grossTokens = 0;
    let proctorTokensEarned = 0;
    let totalUnlocks = 0;

    for (const e of exams) {
      grossTokens += Number(e.total_tokens || 0);
      proctorTokensEarned += Number(e.proctor_tokens || 0);
      totalUnlocks += Number(e.total_students || 0);
    }
    for (const m of materials) {
      grossTokens += Number(m.total_tokens || 0);
      proctorTokensEarned += Number(m.proctor_tokens || 0);
      totalUnlocks += Number(m.total_students || 0);
    }

    // Riwayat pencairan
    const payouts = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        p.*,
        adm.full_name as processed_by_name
      FROM public.proctor_payouts p
      LEFT JOIN public.cbt_profiles adm ON adm.id = p.processed_by
      WHERE p.proctor_id = $1::uuid
      ORDER BY p.period_month DESC
    `, userId);

    const paidTokens = payouts
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.proctor_tokens || 0), 0);
    const paidIdr = payouts
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.total_idr || 0), 0);

    const pendingTokens = Math.max(0, proctorTokensEarned - paidTokens);
    const pendingIdr = pendingTokens * config.token_idr_rate;
    const isEligible = pendingTokens >= config.min_withdrawal_tokens;

    return {
      config,
      profile,
      summary: {
        total_unlocks: totalUnlocks,
        gross_tokens: grossTokens,
        proctor_tokens_earned: proctorTokensEarned,
        total_idr_earned: proctorTokensEarned * config.token_idr_rate,
        paid_tokens: paidTokens,
        paid_idr: paidIdr,
        pending_tokens: pendingTokens,
        pending_idr: pendingIdr,
        status: isEligible ? 'eligible' : 'accumulating',
        is_eligible: isEligible,
      },
      exams,
      materials,
      payouts,
    };
  }

  async registerOrUpdateProfile(userId: string, dto: RegisterProctorDto) {
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
      userId,
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
      RETURNING *
    `, canExams, canMats, status, profileId);

    return { success: true, profile: rows[0] };
  }
}
