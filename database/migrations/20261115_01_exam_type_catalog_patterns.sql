-- =============================================================================
-- Migrasi: Jenis ujian tambahan berpola Ujian Biasa, Folder Ujian, atau Tugas
-- File  : database/migrations/20261115_01_exam_type_catalog_patterns.sql
--
-- 1. cbt_exams.exam_type sebelumnya dibatasi CHECK ke kode bawaan
--    (daily, pas, pat, pts, pkn, am, lainnya, assignment, tryout, quiz), padahal
--    jenis tambahan berpola Ujian Biasa (mis. skd_cpns) menyimpan kodenya sendiri
--    di kolom ini. Batasan diganti dengan pola kode yang sama dengan validasi API
--    (huruf kecil/angka/garis bawah, 2–40 karakter, diawali huruf).
--    Jenis tambahan berpola Tugas tetap disimpan sebagai 'assignment' dan
--    berpola Folder sebagai 'pas'; nama dan aturannya ada di metadata ujian.
--
-- 2. cbt_pas_periods.catalog_type (baru, boleh kosong): kode jenis tambahan
--    berpola Folder Ujian yang dipakai sebuah folder. Kosong = folder ASAS/ASAT
--    atau AM seperti sebelumnya.
--
-- Aman dijalankan ulang. Tidak mengubah data yang ada.
--
-- Cara menjalankan:
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261115_01_exam_type_catalog_patterns.sql
-- =============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  existing record;
BEGIN
  FOR existing IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cbt_exams'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mexam_type\M'
  LOOP
    EXECUTE format('ALTER TABLE public.cbt_exams DROP CONSTRAINT %I', existing.conname);
  END LOOP;
END $$;

ALTER TABLE public.cbt_exams
  ADD CONSTRAINT cbt_exams_exam_type_check CHECK (exam_type ~ '^[a-z][a-z0-9_]{1,39}$');

ALTER TABLE public.cbt_pas_periods
  ADD COLUMN IF NOT EXISTS catalog_type text
  CHECK (catalog_type IS NULL OR catalog_type ~ '^[a-z][a-z0-9_]{1,39}$');

COMMIT;
