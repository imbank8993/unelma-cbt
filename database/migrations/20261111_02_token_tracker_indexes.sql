-- =============================================================================
-- Migrasi: Index untuk halaman Tracker Transaksi & Pemakaian Token
-- File  : database/migrations/20261111_02_token_tracker_indexes.sql
--
-- Halaman /dashboard/admin/transactions mengurutkan berdasarkan waktu terbaru
-- dengan paginasi, dan kolom "Tipe Item" mencocokkan pemakaian token dengan
-- unlocked_items. Index di bawah menjaga query itu tetap cepat saat data tumbuh.
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261111_02_token_tracker_indexes.sql
--   node tools/apply-migrations.js --files=20261111_02_token_tracker_indexes.sql --confirm
--
-- Aman dijalankan ulang. Opsional: fitur tetap berjalan tanpa migrasi ini.
-- Tidak perlu `prisma generate` atau restart API.
-- =============================================================================

BEGIN;

-- Daftar pembelian terbaru (ORDER BY created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS payment_transactions_created_at_idx
  ON public.payment_transactions (created_at DESC, id DESC);

-- Daftar pemakaian token terbaru (hanya baris pengurangan saldo)
CREATE INDEX IF NOT EXISTS token_transactions_usage_created_at_idx
  ON public.token_transactions (created_at DESC, id DESC)
  WHERE amount < 0;

-- Riwayat token per siswa (halaman "Token Saya") dan pencocokan per pengguna
CREATE INDEX IF NOT EXISTS token_transactions_user_created_at_idx
  ON public.token_transactions (user_id, created_at DESC);

-- Pencocokan pemakaian token -> jenis item (unique (user_id, item_type, item_id)
-- tidak bisa dipakai karena item_type tidak diketahui saat pencocokan)
CREATE INDEX IF NOT EXISTS unlocked_items_user_item_idx
  ON public.unlocked_items (user_id, item_id);

DO $$
BEGIN
  RAISE NOTICE 'Index tracker token siap.';
END $$;

COMMIT;

SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'payment_transactions_created_at_idx',
    'token_transactions_usage_created_at_idx',
    'token_transactions_user_created_at_idx',
    'unlocked_items_user_item_idx'
  )
ORDER BY tablename, indexname;
