-- Folder dan PDF informasi publik Unelma. Berkas disimpan di bucket R2 `unelma`;
-- tabel ini hanya menyimpan metadata dan object key. Aman dijalankan ulang.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cbt_information_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cbt_information_folders_name_unique
  ON public.cbt_information_folders (lower(name));

CREATE TABLE IF NOT EXISTS public.cbt_information_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.cbt_information_folders(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  file_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cbt_information_documents_folder_order_idx
  ON public.cbt_information_documents (folder_id, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS cbt_information_documents_public_idx
  ON public.cbt_information_documents (published, created_at DESC) WHERE published = true;

COMMIT;
