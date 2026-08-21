-- Viarela | Supabase schema (v2: admin panel + realtime notifications)
-- Run in Supabase Dashboard > SQL Editor (safe to re-run, idempotent)

create table if not exists public.case_assessments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  phone text,
  gender_identity text,
  relationship_status text,
  nationality text not null,
  partner_nationality text,
  destination text not null,
  package text,
  fee numeric,
  service text,
  previous_refusal text,
  message text not null,
  lang text default 'en',
  status text not null default 'new',
  admin_notes text
);

-- Upgrade existing installations
alter table public.case_assessments add column if not exists status text not null default 'new';
alter table public.case_assessments add column if not exists admin_notes text;

create index if not exists case_assessments_created_idx on public.case_assessments (created_at desc);
create index if not exists case_assessments_status_idx on public.case_assessments (status);

alter table public.case_assessments enable row level security;

-- Anonymous visitors can NEVER read or write directly.
-- Inserts happen only through /api/cases (service role key on Vercel).
-- The admin panel authenticates via Supabase Auth; logged-in admins get access:

drop policy if exists "admins_select_cases" on public.case_assessments;
create policy "admins_select_cases"
  on public.case_assessments for select
  to authenticated
  using (true);

drop policy if exists "admins_update_cases" on public.case_assessments;
create policy "admins_update_cases"
  on public.case_assessments for update
  to authenticated
  using (true);

-- Realtime: pushes new submissions to the open admin panel instantly.
do $$
begin
  alter publication supabase_realtime add table public.case_assessments;
exception when duplicate_object then null;
end $$;
