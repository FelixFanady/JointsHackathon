-- SiagaKu schema. Run once in Supabase Dashboard -> SQL Editor.
-- All tables have RLS enabled with NO policies: the anon key (and any browser) can read/write nothing.
-- The Next.js server and the mobile backend API access data with the service_role key only.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null check (username ~ '^[a-z0-9._-]{3,32}(@[a-z0-9-]+(\.[a-z0-9-]+)+)?$'),
  full_name   text not null,
  role        text not null check (role in ('admin', 'support')),
  unit        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.citizens (
  nik         text primary key check (nik ~ '^[0-9]{16}$'),
  full_name   text not null,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('sos', 'report')),
  nik            text references public.citizens(nik) on delete set null,
  reporter_name  text not null,
  category       text not null,
  description    text,
  photo_url      text,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  address        text,
  status         text not null default 'pending' check (status in ('pending', 'valid', 'false')),
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  ai_verdict     jsonb,
  ai_checked_at  timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists reports_created_idx on public.reports (created_at desc);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_reviewer_idx on public.reports (reviewed_by);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('emergency_threshold',      '15'::jsonb),   -- number of people pressing SOS nearby that auto-escalates
  ('emergency_window_minutes', '60'::jsonb),   -- time window for counting those presses
  ('cluster_radius_m',         '500'::jsonb)   -- distance that groups reports into one map point
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.citizens enable row level security;
alter table public.reports  enable row level security;
alter table public.settings enable row level security;
