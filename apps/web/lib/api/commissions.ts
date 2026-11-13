import { apiGet, apiSend, type ApiResult } from './client';

export interface CommissionConfig {
  admin_share_pct: number;
  proctor_share_pct: number;
  token_idr_rate: number;
  min_withdrawal_tokens: number;
  min_exam_token_price: number;
  min_material_token_price: number;
}

export interface ProctorSummaryItem {
  user_id: string;
  email: string;
  full_name: string;
  profile_id?: string;
  nik?: string;
  whatsapp?: string;
  bank1_name?: string;
  bank1_account_name?: string;
  bank1_account_number?: string;
  bank2_name?: string;
  bank2_account_name?: string;
  bank2_account_number?: string;
  can_create_exams: boolean;
  can_create_materials: boolean;
  /** Kuota ujian / bahan ajar gratis; null = tanpa batas. */
  free_exam_quota?: number | null;
  free_material_quota?: number | null;
  free_exams_used?: number;
  free_materials_used?: number;
  profile_status: string;
  total_unlocks: number;
  gross_tokens: number;
  proctor_tokens_earned: number;
  total_idr_earned: number;
  paid_tokens: number;
  paid_idr: number;
  pending_tokens: number;
  pending_idr: number;
  status: 'eligible' | 'accumulating';
  is_eligible: boolean;
}

export interface ProctorPayout {
  id: string;
  proctor_id: string;
  period_month: string;
  total_tokens: number;
  proctor_share_pct: number;
  proctor_tokens: number;
  rate_per_token_idr: number;
  total_idr: number;
  status: 'accumulating' | 'eligible' | 'paid';
  transfer_proof_url?: string;
  notes?: string;
  paid_at?: string;
  processed_by_name?: string;
  created_at: string;
}

export interface ProctorMySummaryResponse {
  config: CommissionConfig;
  profile?: {
    id: string;
    full_name: string;
    nik: string;
    whatsapp: string;
    email: string;
    bank1_name: string;
    bank1_account_name: string;
    bank1_account_number: string;
    bank2_name?: string;
    bank2_account_name?: string;
    bank2_account_number?: string;
    can_create_exams: boolean;
    can_create_materials: boolean;
    status: string;
  };
  summary: {
    total_unlocks: number;
    gross_tokens: number;
    proctor_tokens_earned: number;
    total_idr_earned: number;
    paid_tokens: number;
    paid_idr: number;
    pending_tokens: number;
    pending_idr: number;
    status: 'eligible' | 'accumulating';
    is_eligible: boolean;
  };
  exams: Array<{
    id: string;
    title: string;
    token_price: number;
    total_students: number;
    total_tokens: number;
    proctor_tokens: number;
    proctor_idr: number;
  }>;
  materials: Array<{
    id: string;
    title: string;
    token_price: number;
    total_students: number;
    total_tokens: number;
    proctor_tokens: number;
    proctor_idr: number;
  }>;
  payouts: ProctorPayout[];
}

export async function getCommissionConfig(): Promise<ApiResult<CommissionConfig>> {
  return apiGet<CommissionConfig>('/api/commissions/config');
}

export async function updateCommissionConfig(
  data: CommissionConfig
): Promise<ApiResult<{ config: CommissionConfig }>> {
  return apiSend<{ config: CommissionConfig }>('/api/commissions/config', data, 'PUT');
}

/** Satu versi aturan komisi; berlaku untuk transaksi sejak `effective_from` (null = sejak awal). */
export interface CommissionRuleHistoryItem {
  id: string;
  admin_share_pct: number;
  proctor_share_pct: number;
  token_idr_rate: number;
  effective_from: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export async function getAdminCommissionsSummary(): Promise<
  ApiResult<{ config: CommissionConfig; proctors: ProctorSummaryItem[]; rule_history?: CommissionRuleHistoryItem[] }>
> {
  return apiGet<{ config: CommissionConfig; proctors: ProctorSummaryItem[]; rule_history?: CommissionRuleHistoryItem[] }>(
    '/api/commissions/admin/summary'
  );
}

/** Jumlah token/rupiah dihitung server dari saldo komisi yang belum dicairkan. */
export async function processAdminPayout(data: {
  proctor_id: string;
  period_month: string;
  transfer_proof_url: string;
  notes?: string;
}): Promise<ApiResult<{ payout: ProctorPayout }>> {
  return apiSend<{ payout: ProctorPayout }>('/api/commissions/admin/payout', data, 'POST');
}

export async function updateProctorPermissions(
  profileId: string,
  data: {
    can_create_exams?: boolean;
    can_create_materials?: boolean;
    status?: 'pending' | 'approved' | 'rejected';
    free_exam_quota?: number | null;
    free_material_quota?: number | null;
  }
): Promise<ApiResult<{ profile: any }>> {
  return apiSend<{ profile: any }>(
    `/api/commissions/admin/proctors/${encodeURIComponent(profileId)}/permissions`,
    data,
    'PUT'
  );
}

export interface FreeQuota {
  /** null = tanpa batas. */
  quota: number | null;
  used: number;
  remaining: number | null;
}

/** Akses membuat ujian/bahan ajar dan sisa kuota gratis pengguna yang login. */
export interface CreationLimits {
  unlimited: boolean;
  canCreateExams: boolean;
  canCreateMaterials: boolean;
  freeExam: FreeQuota;
  freeMaterial: FreeQuota;
}

export async function getMyCreationLimits(): Promise<ApiResult<CreationLimits>> {
  return apiGet<CreationLimits>('/api/commissions/proctor/limits');
}

export async function getProctorMySummary(): Promise<ApiResult<ProctorMySummaryResponse>> {
  return apiGet<ProctorMySummaryResponse>('/api/commissions/proctor/my');
}

export async function registerProctorProfile(data: {
  full_name: string;
  nik: string;
  whatsapp: string;
  email: string;
  bank1_name: string;
  bank1_account_name: string;
  bank1_account_number: string;
  bank2_name?: string;
  bank2_account_name?: string;
  bank2_account_number?: string;
}): Promise<ApiResult<{ profile: any }>> {
  return apiSend<{ profile: any }>('/api/commissions/proctor/register', data, 'POST');
}

// ── Pengajuan menjadi Proktor ──
export type ProctorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface ProctorApplication {
  id: string;
  user_id: string;
  full_name: string;
  nik: string;
  whatsapp: string;
  email: string;
  bank1_name: string;
  bank1_account_name: string;
  bank1_account_number: string;
  bank2_name?: string | null;
  bank2_account_name?: string | null;
  bank2_account_number?: string | null;
  status: ProctorApplicationStatus;
  expertise?: string | null;
  motivation?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  account_name?: string | null;
  account_email?: string | null;
  avatar_url?: string | null;
  reviewed_by_name?: string | null;
}

export interface ProctorApplicationInput {
  full_name: string;
  nik: string;
  whatsapp: string;
  expertise: string;
  motivation: string;
  bank1_name: string;
  bank1_account_name: string;
  bank1_account_number: string;
  bank2_name?: string;
  bank2_account_name?: string;
  bank2_account_number?: string;
}

export async function getMyProctorApplication(): Promise<
  ApiResult<{ application: ProctorApplication | null; is_proctor: boolean; email: string }>
> {
  return apiGet('/api/commissions/proctor/application');
}

export async function applyAsProctor(
  data: ProctorApplicationInput,
): Promise<ApiResult<{ application: { id: string; status: ProctorApplicationStatus } }>> {
  return apiSend('/api/commissions/proctor/apply', data, 'POST');
}

export async function listProctorApplications(
  status: ProctorApplicationStatus | 'all' = 'pending',
): Promise<ApiResult<{ applications: ProctorApplication[]; counts: Record<ProctorApplicationStatus, number> }>> {
  return apiGet(`/api/commissions/admin/applications?status=${encodeURIComponent(status)}`);
}

export async function approveProctorApplication(id: string): Promise<ApiResult<{ application: ProctorApplication }>> {
  return apiSend(`/api/commissions/admin/applications/${encodeURIComponent(id)}/approve`, {}, 'POST');
}

export async function rejectProctorApplication(id: string, reason: string): Promise<ApiResult<{ application: ProctorApplication }>> {
  return apiSend(`/api/commissions/admin/applications/${encodeURIComponent(id)}/reject`, { reason }, 'POST');
}
