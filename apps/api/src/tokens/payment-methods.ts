/**
 * Metode pembayaran Midtrans yang didukung checkout token (Core API).
 * Admin memilih satu atau lebih metode ini untuk tiap paket token.
 */
export const PAYMENT_METHOD_IDS = [
  'qris',
  'bca_va',
  'bni_va',
  'bri_va',
  'permata_va',
  'cimb_va',
  'mandiri_bill',
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

/** Kode `enabled_payments` Snap untuk tiap metode (dipakai bila checkout jatuh ke Snap). */
export const SNAP_PAYMENT_CODES: Record<PaymentMethodId, string> = {
  qris: 'other_qris',
  bca_va: 'bca_va',
  bni_va: 'bni_va',
  bri_va: 'bri_va',
  permata_va: 'permata_va',
  cimb_va: 'cimb_va',
  mandiri_bill: 'echannel',
};

/**
 * Metode yang diizinkan untuk sebuah paket. Kolom kosong/NULL (data lama)
 * berarti semua metode boleh dipakai, sama seperti perilaku sebelumnya.
 */
export function allowedPaymentMethods(pkg: { payment_methods?: unknown }): PaymentMethodId[] {
  const raw = Array.isArray(pkg?.payment_methods) ? pkg.payment_methods : [];
  const valid = PAYMENT_METHOD_IDS.filter((id) => raw.includes(id));
  return valid.length ? valid : [...PAYMENT_METHOD_IDS];
}

/** Rapikan daftar dari admin: buang duplikat, urutkan sesuai daftar resmi. */
export function normalizePaymentMethods(list: readonly string[]): PaymentMethodId[] {
  return PAYMENT_METHOD_IDS.filter((id) => list.includes(id));
}
