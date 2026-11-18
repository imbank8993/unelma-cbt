'use client';

import type { PaymentCreateResult } from './api/tokens';

export interface MidtransSnapOptions {
  language: 'id';
  uiMode: 'qr' | 'auto';
  onSuccess: () => void;
  onPending: () => void;
  onError: () => void;
  onClose: () => void;
}
export interface MidtransSnap {
  pay: (token: string, options: MidtransSnapOptions) => void;
  hide: () => void;
}

type SnapWindow = Window & { snap?: MidtransSnap };
const SCRIPT_ID = 'unelma-midtrans-snap';
let ready: { config: string; snap: MidtransSnap } | null = null;
let pending: { config: string; promise: Promise<MidtransSnap> } | null = null;

/** Load the official SDK once per environment/client key. Server keys never enter this module. */
export function loadMidtransSnap(payment: Pick<PaymentCreateResult, 'is_production' | 'client_key'>): Promise<MidtransSnap> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Popup pembayaran hanya dapat dibuka di browser.'));
  const key = payment.client_key?.trim() || '';
  if (!key || key.length > 200 || /\s|server/i.test(key) || (payment.is_production && key.startsWith('SB-'))) {
    return Promise.reject(new Error('Client Key pembayaran belum sesuai. Periksa Pengaturan Midtrans pada mode yang aktif.'));
  }
  const config = `${payment.is_production ? 'production' : 'sandbox'}:${key}`;
  if (pending) return pending.config === config ? pending.promise : pending.promise.then(() => loadMidtransSnap(payment), () => loadMidtransSnap(payment));
  if (ready?.config === config) return Promise.resolve(ready.snap);

  const browser = window as SnapWindow;
  ready?.snap.hide();
  ready = null;
  delete browser.snap;
  document.getElementById(SCRIPT_ID)?.remove();
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = payment.is_production ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js';
  script.async = true;
  script.setAttribute('data-client-key', key);

  const promise = new Promise<MidtransSnap>((resolve, reject) => {
    let settled = false;
    const finish = (snap?: MidtransSnap) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = script.onerror = null;
      if (snap) { ready = { config, snap }; resolve(snap); }
      else { script.remove(); reject(new Error('Popup pembayaran belum dapat dimuat. Periksa koneksi lalu tampilkan pembayaran kembali.')); }
    };
    const timer = window.setTimeout(() => finish(), 15000);
    script.onload = () => finish(typeof browser.snap?.pay === 'function' && typeof browser.snap?.hide === 'function' ? browser.snap : undefined);
    script.onerror = () => finish();
    document.head.appendChild(script);
  });
  pending = { config, promise };
  void promise.then(() => { if (pending?.promise === promise) pending = null; }, () => { if (pending?.promise === promise) pending = null; });
  return promise;
}
