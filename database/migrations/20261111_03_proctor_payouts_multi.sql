-- =============================================================================
-- Migrasi: Izinkan lebih dari satu pencairan komisi per proktor per bulan
-- File  : database/migrations/20261111_03_proctor_payouts_multi.sql
--
-- Sebelumnya UNIQUE (proctor_id, period_month) membuat pencairan kedua di bulan
-- yang sama MENIMPA baris pertama: total "sudah dicairkan" tidak bertambah,
-- saldo muncul lagi sebagai "Siap Dicairkan", dan bukti transfer pertama hilang.
-- Aplikasi kini selalu menyisipkan baris baru; constraint itu dilepas di sini.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261111_03_proctor_payouts_multi.sql
--   node tools/apply-migrations.js --files=20261111_03_proctor_payouts_multi.sql --confirm
--
-- Aman dijalankan ulang. Tanpa migrasi ini, pencairan kedua di bulan yang sama
-- ditolak dengan pesan yang jelas (tidak lagi menimpa data).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.proctor_payouts'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['period_month', 'proctor_id']
  LOOP
    EXECUTE format('ALTER TABLE public.proctor_payouts DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Constraint % dilepas.', constraint_name;
  END LOOP;
END $$;

-- Riwayat pencairan per proktor (halaman Komisi Saya & rekap Admin)
CREATE INDEX IF NOT EXISTS idx_proctor_payouts_proctor_period
  ON public.proctor_payouts (proctor_id, period_month DESC, created_at DESC);

-- Pendapatan pembuat konten dihitung dari token_transactions (reference_id = id item)
CREATE INDEX IF NOT EXISTS token_transactions_usage_reference_idx
  ON public.token_transactions (reference_id)
  WHERE type = 'usage' AND amount < 0;

COMMIT;

SELECT conname AS constraint_unik_tersisa
FROM pg_constraint
WHERE conrelid = 'public.proctor_payouts'::regclass AND contype = 'u';
