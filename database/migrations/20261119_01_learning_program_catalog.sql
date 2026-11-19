-- =============================================================================
-- Migrasi: Daftar program belajar diatur Admin (Pengaturan → Pengaturan Daftar)
-- File  : database/migrations/20261119_01_learning_program_catalog.sql
--
-- Program belajar (Sekolah, UTBK, CPNS, ...) sekarang disimpan di
-- acca_settings key `learning_program_catalog` dan dapat ditambah Admin.
-- Constraint lama di cbt_learning_goals hanya menerima delapan kode bawaan,
-- jadi diganti dengan pemeriksaan format kode (sama dengan
-- LEARNING_PROGRAM_CODE_PATTERN di API) dan batas 40 program.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261119_01_learning_program_catalog.sql
--   node tools/apply-migrations.js --files=20261119_01_learning_program_catalog.sql --confirm
--
-- Aman dijalankan ulang. Satu transaksi.
-- =============================================================================

BEGIN;

ALTER TABLE public.cbt_learning_goals DROP CONSTRAINT IF EXISTS cbt_learning_goals_programs_valid;
ALTER TABLE public.cbt_learning_goals ADD CONSTRAINT cbt_learning_goals_programs_valid CHECK (
    cardinality(programs) BETWEEN 1 AND 40
    AND array_to_string(programs, ',') ~ '^[a-z][a-z0-9_]{1,31}(,[a-z][a-z0-9_]{1,31})*$'
);

COMMIT;
