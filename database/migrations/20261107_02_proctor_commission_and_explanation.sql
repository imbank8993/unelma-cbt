-- =============================================================================
-- Migrasi: Sistem Komisi Proktor, Profil Bank Proktor, dan Pembahasan Soal
-- =============================================================================

BEGIN;

-- 1. Tambah kolom pembahasan soal ke cbt_bank_questions
ALTER TABLE public.cbt_bank_questions
  ADD COLUMN IF NOT EXISTS explanation_video_url text,
  ADD COLUMN IF NOT EXISTS explanation_pdf_url text,
  ADD COLUMN IF NOT EXISTS explanation_html text;

-- 2. Tabel profil data proktor, rekening, & izin pembuatan konten
CREATE TABLE IF NOT EXISTS public.proctor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name character varying NOT NULL,
  nik character varying(20) NOT NULL,
  whatsapp character varying(25) NOT NULL,
  email character varying(255) NOT NULL,
  -- Rekening 1
  bank1_name character varying(100) NOT NULL,
  bank1_account_name character varying(150) NOT NULL,
  bank1_account_number character varying(50) NOT NULL,
  -- Rekening 2 (opsional)
  bank2_name character varying(100),
  bank2_account_name character varying(150),
  bank2_account_number character varying(50),
  -- Hak pembuatan konten (diatur Admin)
  can_create_exams boolean NOT NULL DEFAULT true,
  can_create_materials boolean NOT NULL DEFAULT true,
  status character varying(20) NOT NULL DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proctor_profiles_user_id ON public.proctor_profiles(user_id);

-- 3. Tabel pencairan komisi proktor bulanan & bukti transfer
CREATE TABLE IF NOT EXISTS public.proctor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proctor_id uuid NOT NULL,
  period_month character varying(7) NOT NULL, -- format 'YYYY-MM'
  total_tokens integer NOT NULL DEFAULT 0,
  proctor_share_pct integer NOT NULL DEFAULT 60,
  proctor_tokens integer NOT NULL DEFAULT 0,
  rate_per_token_idr numeric NOT NULL DEFAULT 5000,
  total_idr numeric NOT NULL DEFAULT 0,
  status character varying(25) NOT NULL DEFAULT 'accumulating', -- 'accumulating' (< threshold), 'eligible' (>= threshold), 'paid'
  transfer_proof_url text,
  notes text,
  paid_at timestamp with time zone,
  processed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (proctor_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_proctor_payouts_proctor ON public.proctor_payouts(proctor_id);
CREATE INDEX IF NOT EXISTS idx_proctor_payouts_period ON public.proctor_payouts(period_month);

-- 4. Pengaturan komisi & batas harga minimal di acca_settings
INSERT INTO public.acca_settings (key, value, updated_at)
VALUES (
  'commission_config',
  '{
    "admin_share_pct": 40,
    "proctor_share_pct": 60,
    "token_idr_rate": 5000,
    "min_withdrawal_tokens": 200,
    "min_exam_token_price": 1,
    "min_material_token_price": 1
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
