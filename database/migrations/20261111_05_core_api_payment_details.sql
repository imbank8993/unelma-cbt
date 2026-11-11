-- Tambah kolom payment_details pada payment_transactions untuk menyimpan info pembayaran Core API
-- (QRIS URL, QR string, VA Number, Bank, Biller Code, Bill Key, Expiry Time).
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payment_details jsonb;
