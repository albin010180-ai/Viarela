-- Viarela | Supabase schema
-- Run in Supabase Dashboard > SQL Editor

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
  lang text default 'en'
);

alter table public.case_assessments enable row level security;

-- No public policies: only the service role key (used by /api/cases on Vercel)
-- can insert or read rows. Do NOT create INSERT/SELECT policies for anon.
