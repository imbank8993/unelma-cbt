-- =============================================================================
-- Migrasi: Tambah program SNPDB/SPMB pada tujuan belajar siswa
-- File  : database/migrations/20261113_01_learning_goals_snpdb.sql
--
-- Program "snpdb" (seleksi masuk SMP/SMA) dipakai bersama oleh tujuan belajar,
-- bahan ajar, dan program ujian (metadata.program). Constraint lama hanya
-- mengenal tujuh program, jadi diganti agar menerima delapan.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261113_01_learning_goals_snpdb.sql
--   node tools/apply-migrations.js --files=20261113_01_learning_goals_snpdb.sql --confirm
--
-- Aman dijalankan ulang. Satu transaksi.
-- =============================================================================

BEGIN;

ALTER TABLE public.cbt_learning_goals DROP CONSTRAINT IF EXISTS cbt_learning_goals_programs_valid;
ALTER TABLE public.cbt_learning_goals ADD CONSTRAINT cbt_learning_goals_programs_valid CHECK (
    programs <@ ARRAY['sekolah', 'snpdb', 'utbk', 'cpns', 'pppk', 'kedinasan', 'bahasa', 'umum']::TEXT[]
    AND cardinality(programs) BETWEEN 1 AND 8
);

COMMIT;
