-- =============================================================================
-- Migrasi: Tabel dan Kolom Sistem Token & Pembayaran Midtrans
-- =============================================================================

BEGIN;

-- 1. Tambah kolom token_balance ke cbt_profiles
ALTER TABLE public.cbt_profiles 
  ADD COLUMN IF NOT EXISTS token_balance integer NOT NULL DEFAULT 0;

-- 2. Tambah kolom is_paid dan token_price ke cbt_learning_materials jika belum ada
ALTER TABLE public.cbt_learning_materials 
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS token_price integer NOT NULL DEFAULT 0;

-- 3. Tabel paket token
CREATE TABLE IF NOT EXISTS public.token_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  token_amount integer NOT NULL DEFAULT 1,
  price_idr numeric NOT NULL DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Tabel transaksi pembayaran (Midtrans)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id character varying NOT NULL UNIQUE,
  user_id uuid,
  email character varying NOT NULL,
  customer_name character varying,
  package_id uuid,
  package_name character varying,
  token_amount integer DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status character varying DEFAULT 'pending'::character varying,
  payment_type character varying,
  snap_token text,
  snap_redirect_url text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 5. Tabel transaksi / riwayat token siswa
CREATE TABLE IF NOT EXISTS public.token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  type character varying NOT NULL,
  description text NOT NULL,
  reference_id text,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Tabel item yang sudah dibuka aksesnya dengan token
CREATE TABLE IF NOT EXISTS public.unlocked_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_type character varying NOT NULL,
  item_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

-- 7. Seed paket default jika belum ada
INSERT INTO public.token_packages (name, token_amount, price_idr, description, is_active)
SELECT 'Paket Starter', 5, 25000, '5 Token untuk mencoba latihan ujian & bahan ajar favorit', true
WHERE NOT EXISTS (SELECT 1 FROM public.token_packages WHERE name = 'Paket Starter');

INSERT INTO public.token_packages (name, token_amount, price_idr, description, is_active)
SELECT 'Paket Standar', 12, 50000, '12 Token (Bonus 2 token) untuk persiapan belajar mingguan', true
WHERE NOT EXISTS (SELECT 1 FROM public.token_packages WHERE name = 'Paket Standar');

INSERT INTO public.token_packages (name, token_amount, price_idr, description, is_active)
SELECT 'Paket Premium', 30, 100000, '30 Token (Bonus 10 token) akses intensif semua modul & tryout', true
WHERE NOT EXISTS (SELECT 1 FROM public.token_packages WHERE name = 'Paket Premium');

COMMIT;
