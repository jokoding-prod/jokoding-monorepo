-- Tabel feedback client dari jokoding.id/feedback.
-- Jalankan sekali di Supabase SQL Editor.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 5),
  layanan text,
  bagus text,
  kurang text,
  nama text,
  izin_testimoni boolean not null default false
);

-- RLS aktif tanpa policy: anon key tidak bisa baca/tulis.
-- Insert hanya lewat api/feedback.js dengan service role key.
alter table public.feedback enable row level security;
