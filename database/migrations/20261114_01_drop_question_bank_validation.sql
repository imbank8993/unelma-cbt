-- =============================================================================
-- Migrasi: Hapus fitur Validasi Soal
-- File  : database/migrations/20261114_01_drop_question_bank_validation.sql
--
-- Halaman Validasi Soal (sesi validasi bank soal, penugasan validator, catatan
-- per butir, status kelayakan per butir, dan folder sesi) dihapus dari aplikasi.
-- Tabel-tabel berikut tidak lagi dibaca atau ditulis kode mana pun:
--
--   cbt_question_validation_items   (20261102_02_validation_review_rounds.sql)
--   cbt_question_validation_notes   (20261008_02_question_bank_validation.sql)
--   cbt_question_bank_validators    (20261008_02_question_bank_validation.sql)
--   cbt_question_bank_validations   (20261008_02_question_bank_validation.sql)
--   cbt_validation_folders          (20261102_04_validation_folders.sql)
--
-- Tidak ada tabel lain yang merujuk ke tabel-tabel ini lewat foreign key, view,
-- atau fungsi. Kolom cbt_bank_questions.revision TIDAK ikut dihapus karena
-- tetap dipakai untuk penguncian optimistis saat menyunting soal.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261114_01_drop_question_bank_validation.sql
--   node tools/apply-migrations.js --files=20261114_01_drop_question_bank_validation.sql --confirm
--
-- Aman dijalankan ulang. Satu transaksi. Data di tabel-tabel ini ikut hilang.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public.cbt_question_validation_items;
DROP TABLE IF EXISTS public.cbt_question_validation_notes;
DROP TABLE IF EXISTS public.cbt_question_bank_validators;
DROP TABLE IF EXISTS public.cbt_question_bank_validations;
DROP TABLE IF EXISTS public.cbt_validation_folders;

COMMIT;
