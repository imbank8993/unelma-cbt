-- =============================================================================
-- Migrasi: Tujuan belajar siswa (Sekolah, UTBK, CPNS, PPPK, Kedinasan, ...)
-- File  : database/migrations/20261112_01_learning_goals.sql
--
-- Satu baris per pengguna: program yang dituju, target bebas, dan tanggal
-- ujian/seleksi. Dipakai beranda siswa dan Ruang Belajar agar tujuan ikut
-- terbawa saat siswa berganti perangkat.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261112_01_learning_goals.sql
--   node tools/apply-migrations.js --files=20261112_01_learning_goals.sql --confirm
--
-- Aman dijalankan ulang.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cbt_learning_goals (
    user_id UUID PRIMARY KEY,
    programs TEXT[] NOT NULL DEFAULT '{}',
    target TEXT NOT NULL DEFAULT '',
    target_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cbt_learning_goals_programs_valid CHECK (
        programs <@ ARRAY['sekolah', 'utbk', 'cpns', 'pppk', 'kedinasan', 'bahasa', 'umum']::TEXT[]
        AND cardinality(programs) BETWEEN 1 AND 7
    ),
    CONSTRAINT cbt_learning_goals_target_length CHECK (char_length(target) <= 120)
);

COMMIT;
