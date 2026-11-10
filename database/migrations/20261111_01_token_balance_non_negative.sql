-- =============================================================================
-- Migrasi: Saldo token siswa tidak boleh minus
-- File  : database/migrations/20261111_01_token_balance_non_negative.sql
--
-- Satu file berisi tiga langkah: (1) cek data, (2) pasang constraint,
-- (3) verifikasi. Semuanya dalam SATU transaksi: jika ada langkah yang gagal,
-- tidak ada perubahan yang tersimpan.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261111_01_token_balance_non_negative.sql
--   node tools/apply-migrations.js --files=20261111_01_token_balance_non_negative.sql --confirm
--   cd apps/api && npx prisma db execute --file ../../database/migrations/20261111_01_token_balance_non_negative.sql --schema prisma/schema.prisma
--
-- JANGAN memakai `prisma migrate dev/deploy` (proyek ini tidak memakai riwayat
-- Prisma Migrate; `migrate dev` bisa menawarkan reset database).
--
-- Aman dijalankan ulang. Jalankan di luar jam ujian: ALTER TABLE mengunci
-- tabel cbt_profiles sesaat. Tidak perlu `prisma generate` atau restart API.
-- =============================================================================

BEGIN;

-- 1. Cek data: tolak migrasi bila sudah ada saldo minus --------------------------
DO $$
DECLARE
  negative_count integer;
BEGIN
  SELECT COUNT(*) INTO negative_count
  FROM public.cbt_profiles
  WHERE token_balance < 0;

  IF negative_count > 0 THEN
    RAISE EXCEPTION
      'Migrasi dibatalkan: % akun memiliki saldo token minus. Periksa dengan: SELECT id, full_name, token_balance FROM public.cbt_profiles WHERE token_balance < 0;',
      negative_count;
  END IF;

  RAISE NOTICE '[1/3] Cek data OK: tidak ada saldo token minus.';
END $$;

-- 2. Pasang constraint (dilewati bila sudah ada) --------------------------------
-- Pagar terakhir untuk jalur di luar aplikasi: SQL manual, dashboard database,
-- skrip perbaikan data, atau kode baru. Kode aplikasi sendiri sudah memotong
-- saldo secara atomik (`... WHERE token_balance >= biaya`).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cbt_profiles_token_balance_non_negative'
      AND conrelid = 'public.cbt_profiles'::regclass
  ) THEN
    RAISE NOTICE '[2/3] Constraint sudah ada, dilewati.';
  ELSE
    ALTER TABLE public.cbt_profiles
      ADD CONSTRAINT cbt_profiles_token_balance_non_negative CHECK (token_balance >= 0);
    RAISE NOTICE '[2/3] Constraint cbt_profiles_token_balance_non_negative dipasang.';
  END IF;
END $$;

-- 3. Verifikasi ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cbt_profiles_token_balance_non_negative'
      AND conrelid = 'public.cbt_profiles'::regclass
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Verifikasi gagal: constraint tidak ditemukan atau belum tervalidasi.';
  END IF;

  RAISE NOTICE '[3/3] Verifikasi OK: saldo token kini dijaga database agar tidak pernah minus.';
END $$;

COMMIT;

-- Ringkasan hasil (ditampilkan oleh psql / SQL editor)
SELECT conname AS constraint_name,
       pg_get_constraintdef(oid) AS definisi,
       convalidated AS tervalidasi
FROM pg_constraint
WHERE conname = 'cbt_profiles_token_balance_non_negative';
