-- Media Sosial: kredensial hanya dibaca melalui service Admin dan dienkripsi aplikasi.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.cbt_social_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  credentials_cipher text NOT NULL,
  organization_id text NOT NULL DEFAULT '',
  graph_version text NOT NULL DEFAULT 'v26.0',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cbt_social_channels (
  id text PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok')),
  organization_id text NOT NULL,
  name text NOT NULL,
  external_account_id text NOT NULL,
  connected boolean NOT NULL DEFAULT true,
  credentials_cipher text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.cbt_social_posts (
  id uuid PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok')),
  channel_id text REFERENCES public.cbt_social_channels(id) ON DELETE RESTRICT,
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 2200),
  media_type text NOT NULL DEFAULT 'text' CHECK (media_type IN ('text', 'image', 'video')),
  media_url text,
  ai_generated boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'processing', 'published', 'failed', 'uncertain')),
  buffer_post_id text UNIQUE,
  external_post_id text,
  external_url text,
  error text,
  metrics jsonb NOT NULL DEFAULT '{}',
  metrics_at timestamptz,
  metrics_error text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS cbt_social_posts_created_idx ON public.cbt_social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS cbt_social_posts_channel_idx ON public.cbt_social_posts(channel_id, status);

COMMIT;
