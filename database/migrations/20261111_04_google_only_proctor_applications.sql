-- =============================================================================
-- Migrasi: Google-only, peran Guru dilebur ke Proktor, aturan komisi per tanggal,
--          dan pengajuan menjadi Proktor
-- File  : database/migrations/20261111_04_google_only_proctor_applications.sql
--
-- 1. Peran Guru dihapus: setiap pemegang peran Guru diberi peran Proktor, lalu
--    peran Guru dicabut dan baris perannya dihapus.
-- 2. Riwayat aturan komisi (commission_rule_history): transaksi memakai aturan
--    yang berlaku pada TANGGAL transaksinya. Aturan saat ini dicatat sebagai
--    aturan "sejak awal".
-- 3. Kolom pengajuan Proktor pada proctor_profiles (keahlian, alasan, waktu kirim,
--    peninjau, alasan penolakan).
--
-- Cara menjalankan (pilih salah satu):
--   psql "$DATABASE_URL_HOST" -f database/migrations/20261111_04_google_only_proctor_applications.sql
--   node tools/apply-migrations.js --files=20261111_04_google_only_proctor_applications.sql --confirm
--
-- Aman dijalankan ulang. Satu transaksi: bila satu langkah gagal, tidak ada yang berubah.
-- =============================================================================

BEGIN;

-- ── 1. Peran Guru → Proktor ─────────────────────────────────────────────────
DO $$
DECLARE
  guru_ids uuid[];
  proktor_id uuid;
  moved integer := 0;
BEGIN
  SELECT array_agg(id) INTO guru_ids FROM public.cbt_roles WHERE lower(name) = 'guru';
  SELECT id INTO proktor_id FROM public.cbt_roles WHERE lower(name) = 'proktor' LIMIT 1;

  IF guru_ids IS NULL THEN
    RAISE NOTICE '[1/3] Peran Guru sudah tidak ada, dilewati.';
  ELSIF proktor_id IS NULL THEN
    RAISE EXCEPTION 'Peran Proktor tidak ditemukan di cbt_roles; migrasi dibatalkan.';
  ELSE
    INSERT INTO public.cbt_member_roles (organization_member_id, role_id)
    SELECT DISTINCT mr.organization_member_id, proktor_id
    FROM public.cbt_member_roles mr
    WHERE mr.role_id = ANY (guru_ids)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS moved = ROW_COUNT;

    DELETE FROM public.cbt_member_roles WHERE role_id = ANY (guru_ids);

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'cbt_profiles' AND column_name = 'role') THEN
      UPDATE public.cbt_profiles SET role = 'Proktor' WHERE lower(role) = 'guru';
    END IF;

    BEGIN
      DELETE FROM public.cbt_roles WHERE id = ANY (guru_ids);
      RAISE NOTICE '[1/3] % anggota baru menerima peran Proktor; peran Guru dihapus.', moved;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE '[1/3] % anggota baru menerima peran Proktor; baris peran Guru dipertahankan karena masih dirujuk tabel lain, tetapi tidak lagi dimiliki siapa pun.', moved;
    END;
  END IF;
END $$;

-- ── 2. Riwayat aturan komisi ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_share_pct integer NOT NULL CHECK (admin_share_pct BETWEEN 0 AND 100),
  proctor_share_pct integer NOT NULL CHECK (proctor_share_pct BETWEEN 0 AND 100),
  token_idr_rate numeric NOT NULL,
  min_withdrawal_tokens integer,
  min_exam_token_price integer,
  min_material_token_price integer,
  -- Berlaku untuk transaksi sejak saat ini ('-infinity' = sejak awal).
  effective_from timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_rule_history_effective_idx
  ON public.commission_rule_history (effective_from DESC, created_at DESC);

INSERT INTO public.commission_rule_history (
  admin_share_pct, proctor_share_pct, token_idr_rate,
  min_withdrawal_tokens, min_exam_token_price, min_material_token_price, effective_from
)
SELECT
  COALESCE((s.value ->> 'admin_share_pct')::int, 40),
  COALESCE((s.value ->> 'proctor_share_pct')::int, 60),
  COALESCE((s.value ->> 'token_idr_rate')::numeric, 5000),
  COALESCE((s.value ->> 'min_withdrawal_tokens')::int, 200),
  COALESCE((s.value ->> 'min_exam_token_price')::int, 1),
  COALESCE((s.value ->> 'min_material_token_price')::int, 1),
  '-infinity'::timestamptz
FROM (SELECT 1) one
LEFT JOIN public.acca_settings s ON s.key = 'commission_config'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_rule_history);

-- ── 3. Pengajuan Proktor ────────────────────────────────────────────────────
ALTER TABLE public.proctor_profiles
  ADD COLUMN IF NOT EXISTS expertise text,
  ADD COLUMN IF NOT EXISTS motivation text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS proctor_profiles_application_idx
  ON public.proctor_profiles (status, submitted_at DESC)
  WHERE submitted_at IS NOT NULL;

DO $$ BEGIN RAISE NOTICE '[2/3] Riwayat aturan komisi siap. [3/3] Kolom pengajuan Proktor siap.'; END $$;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM public.cbt_roles WHERE lower(name) = 'guru') AS peran_guru_tersisa,
  (SELECT COUNT(*) FROM public.commission_rule_history) AS aturan_komisi_tercatat;
