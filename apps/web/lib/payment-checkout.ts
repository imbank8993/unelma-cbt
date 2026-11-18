import type { PaymentCreateResult } from './api/tokens';

/** A checkout must stay on the official Midtrans host for its environment. */
export function midtransCheckoutUrl(payment: Pick<PaymentCreateResult, 'redirect_url' | 'is_production'>): string | null {
  try {
    const url = new URL(payment.redirect_url || '');
    const host = payment.is_production ? 'app.midtrans.com' : 'app.sandbox.midtrans.com';
    return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password && !url.port && url.pathname.startsWith('/snap/') ? url.href : null;
  } catch { return null; }
}
