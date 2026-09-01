-- Schema for public.educational_videos table

create table if not exists public.educational_videos (
  id uuid not null default gen_random_uuid (),
  platform text not null default 'youtube'::text,
  content_type text not null,
  external_id text not null,
  title text not null,
  description text null,
  thumbnail_url text not null,
  video_url text not null,
  duration text null,
  views_count bigint null default 0,
  published_at timestamp with time zone not null default now(),
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint educational_videos_pkey primary key (id),
  constraint unique_platform_external_id unique (platform, external_id),
  constraint educational_videos_content_type_check check (
    (
      content_type = any (array['video'::text, 'short'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_educational_videos_published_at on public.educational_videos using btree (published_at desc) TABLESPACE pg_default;
create index IF not exists idx_educational_videos_content_type on public.educational_videos using btree (content_type) TABLESPACE pg_default;
create index IF not exists idx_educational_videos_is_active on public.educational_videos using btree (is_active) TABLESPACE pg_default;

-- RLS Policy
alter table public.educational_videos enable row level security;

create policy "Allow read access to educational_videos" on public.educational_videos
  for select using (true);
