create table if not exists public.login_logs (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('citizen', 'staff')),
  subject       text not null,
  display_name  text,
  role          text,
  method        text not null check (method in ('nik', 'password', 'face_verify', 'face_enroll')),
  success       boolean not null,
  reason        text,
  ip            text,
  region        text,
  country       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists login_logs_kind_created_idx on public.login_logs (kind, created_at desc);
create index if not exists login_logs_subject_idx on public.login_logs (subject, created_at desc);

alter table public.login_logs enable row level security;
