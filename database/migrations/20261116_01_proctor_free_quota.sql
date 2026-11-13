-- =============================================================================
-- Migrasi: Kuota ujian & bahan ajar gratis per Proktor
-- File  : database/migrations/20261116_01_proctor_free_quota.sql
--
-- Admin menetapkan berapa ujian gratis dan bahan ajar gratis (terbit) yang
-- boleh dibuat seorang Proktor. NULL = tanpa batas (perilaku sebelumnya).
-- Bila kuota habis, ujian/bahan ajar berikutnya wajib berbayar.
--
-- Kolom can_create_exams / can_create_materials yang sudah ada kini berarti
-- "boleh membuat ujian / menerbitkan bahan ajar" (sebelumnya hanya izin menjual).
--
-- Aman dijalankan ulang. Tidak mengubah data yang ada.
--
-- Cara menjalankan:
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261116_01_proctor_free_quota.sql
-- =============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.proctor_profiles
  ADD COLUMN IF NOT EXISTS free_exam_quota integer CHECK (free_exam_quota IS NULL OR free_exam_quota >= 0),
  ADD COLUMN IF NOT EXISTS free_material_quota integer CHECK (free_material_quota IS NULL OR free_material_quota >= 0);

COMMIT;
