import { apiGet, apiSend, type ApiResult } from './client';

export interface TokenPackage {
  id: string;
  name: string;
  token_amount: number;
  price_idr: number;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  user_id?: string;
  email: string;
  customer_name?: string;
  package_name?: string;
  token_amount: number;
  amount: number;
  status: 'pending' | 'success' | 'failed' | (string & {});
  payment_type?: string;
  paid_at?: string;
  created_at: string;
  user_name?: string;
}

export interface TokenTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'topup' | 'usage' | 'refund';
  description: string;
  reference_id?: string;
  item_type?: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export interface ItemAccessStatus {
  hasAccess: boolean;
  isFree?: boolean;
  isUnlocked?: boolean;
  title: string;
  tokenPrice: number;
  balance?: number;
}

// ── 1. Paket Token ──
export async function getPublicTokenPackages(): Promise<ApiResult<{ packages: TokenPackage[] }>> {
  return apiGet<{ packages: TokenPackage[] }>('/api/tokens/packages');
}

export async function getAdminTokenPackages(): Promise<ApiResult<{ packages: TokenPackage[] }>> {
  return apiGet<{ packages: TokenPackage[] }>('/api/tokens/admin/packages');
}

export async function createTokenPackage(data: {
  name: string;
  token_amount: number;
  price_idr: number;
  description?: string;
  is_active?: boolean;
}): Promise<ApiResult<{ package: TokenPackage }>> {
  return apiSend<{ package: TokenPackage }>('/api/tokens/admin/packages', data, 'POST');
}

export async function updateTokenPackage(
  id: string,
  data: Partial<TokenPackage>,
): Promise<ApiResult<{ package: TokenPackage }>> {
  return apiSend<{ package: TokenPackage }>(`/api/tokens/admin/packages/${encodeURIComponent(id)}`, data, 'PUT');
}

export async function deleteTokenPackage(id: string): Promise<ApiResult<{ message: string }>> {
  return apiSend<{ message: string }>(`/api/tokens/admin/packages/${encodeURIComponent(id)}`, undefined, 'DELETE');
}

// ── 2. Midtrans Config ──
export async function getMidtransConfig(): Promise<
  ApiResult<{
    is_production: boolean;
    sandbox_client_key?: string;
    sandbox_server_key?: string;
    production_client_key?: string;
    production_server_key?: string;
    client_key?: string;
  }>
> {
  return apiGet('/api/tokens/admin/midtrans-config');
}

export async function saveMidtransConfig(data: {
  is_production: boolean;
  sandbox_client_key?: string;
  sandbox_server_key?: string;
  production_client_key?: string;
  production_server_key?: string;
  clear_sandbox_server_key?: boolean;
  clear_production_server_key?: boolean;
}): Promise<ApiResult<{ message: string }>> {
  return apiSend('/api/tokens/admin/midtrans-config', data, 'POST');
}

// ── 3. Pembayaran & Checkout ──
export interface CorePaymentDetails {
  payment_method: string;
  payment_type: string;
  qr_url?: string | null;
  qr_string?: string | null;
  va_number?: string | null;
  bank?: string | null;
  biller_code?: string | null;
  bill_key?: string | null;
  expiry_time?: string | null;
}

export interface PaymentCreateResult {
  order_id: string;
  snap_token?: string;
  redirect_url?: string;
  client_key?: string;
  is_production: boolean;
  payment_method?: string;
  payment_type?: string;
  amount?: number;
  token_amount?: number;
  package_name?: string;
  payment_details?: CorePaymentDetails;
}

export async function createPayment(data: {
  package_id: string;
  payment_method?: string;
}): Promise<ApiResult<PaymentCreateResult>> {
  return apiSend<PaymentCreateResult>('/api/payments/create', data, 'POST');
}

export async function checkPaymentStatus(orderId: string): Promise<
  ApiResult<{
    status: 'pending' | 'success' | 'failed';
    token_amount?: number;
    balance?: number;
    payment_type?: string;
    payment_details?: CorePaymentDetails;
    message?: string;
  }>
> {
  return apiSend('/api/payments/check-status', { order_id: orderId }, 'POST');
}

// ── 4. Saldo & Riwayat Siswa ──
export async function getUserTokenBalance(): Promise<ApiResult<{ token_balance: number }>> {
  return apiGet<{ token_balance: number }>('/api/tokens/balance');
}

export async function getUserTokenTransactions(): Promise<ApiResult<{ transactions: TokenTransaction[] }>> {
  return apiGet<{ transactions: TokenTransaction[] }>('/api/tokens/my-transactions');
}

// ── 5. Buka Akses Item (Ujian & Bahan Ajar) ──
export async function checkItemAccess(
  type: 'exam' | 'material',
  id: string,
): Promise<ApiResult<ItemAccessStatus>> {
  return apiGet<ItemAccessStatus>(`/api/tokens/check-access?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
}

export async function unlockItemWithTokens(
  itemType: 'exam' | 'material',
  itemId: string,
  /** Harga yang ditampilkan ke siswa; server menolak bila harganya sudah berubah. */
  expectedPrice?: number,
): Promise<ApiResult<{ message: string; remainingBalance: number }>> {
  return apiSend('/api/tokens/unlock', { itemType, itemId, expectedPrice }, 'POST');
}

// ── 6. Admin Trackers ──
export interface TrackerQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TrackerPage {
  total: number;
  page: number;
  page_size: number;
  /** true bila hasil (dan statistiknya) dibatasi kata kunci pencarian. */
  filtered: boolean;
}

function trackerParams({ search = '', page = 1, pageSize = 50 }: TrackerQuery) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (search.trim()) params.set('search', search.trim());
  return params.toString();
}

export async function getAdminPurchasesTracker(
  query: TrackerQuery = {},
): Promise<
  ApiResult<TrackerPage & {
    transactions: PaymentTransaction[];
    stats: {
      total_orders: number;
      success_orders: number;
      total_revenue: number;
      total_tokens_sold: number;
    };
  }>
> {
  return apiGet(`/api/tokens/admin/tracker/purchases?${trackerParams(query)}`);
}

export async function getAdminUsagesTracker(
  query: TrackerQuery = {},
): Promise<
  ApiResult<TrackerPage & {
    usages: TokenTransaction[];
    stats: {
      total_unlocks: number;
      total_tokens_spent: number;
      active_students: number;
    };
  }>
> {
  return apiGet(`/api/tokens/admin/tracker/usages?${trackerParams(query)}`);
}
