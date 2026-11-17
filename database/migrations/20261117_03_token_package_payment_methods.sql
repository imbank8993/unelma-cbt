-- =============================================================================
-- Migrasi: Metode pembayaran per paket token
-- File  : database/migrations/20261117_03_token_package_payment_methods.sql
--
-- Admin memilih satu atau lebih metode pembayaran Midtrans (QRIS, BRIVA, BCA VA,
-- dst.) untuk tiap paket token. Checkout siswa hanya menampilkan metode yang
-- dipilih, dan API menolak metode di luar daftar tersebut.
--
-- Paket yang sudah ada otomatis mendapat semua metode yang sebelumnya tampil
-- di checkout, sehingga perilaku lama tidak berubah.
--
-- Aman dijalankan ulang.
--
-- Cara menjalankan:
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261117_03_token_package_payment_methods.sql
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.token_packages
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL
    DEFAULT ARRAY['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'mandiri_bill']::text[];

ALTER TABLE public.token_packages
  DROP CONSTRAINT IF EXISTS token_packages_payment_methods_check;
ALTER TABLE public.token_packages
  ADD CONSTRAINT token_packages_payment_methods_check CHECK (
    cardinality(payment_methods) >= 1
    AND payment_methods <@ ARRAY['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'mandiri_bill']::text[]
  );

COMMIT;
