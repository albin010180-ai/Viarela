-- Viarela | Monero (XMR) payment schema (Path A: direct XMR, view-only bridge)
-- RLS: anonymous has NO access; only authenticated admins read; bridge uses service_role to write.

-- 1. Address pool: pre-generated subaddresses that checkout pops synchronously
create table if not exists xmr_address_pool (
  id bigint generated always as identity primary key,
  address text unique not null,
  subaddress_index int unique not null,
  status text not null default 'unused' check (status in ('unused','assigned')),
  invoice_id uuid,
  created_at timestamptz not null default now()
);

-- 2. Invoices: one per checkout (package+stage -> XMR amount)
create table if not exists xmr_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique not null,
  address text unique not null,
  subaddress_index int not null,
  amount_eur numeric(12,2) not null,
  amount_xmr numeric(14,8) not null,
  fx_rate numeric(12,6) not null,
  safety_pct numeric(6,2) not null default 3.00,
  package_id text not null,
  stage text not null default 'retainer' check (stage in ('retainer','remainder','full')),
  status text not null default 'pending' check (status in ('pending','partial','credited','expired','void')),
  confirmations int not null default 0,
  received_amount_xmr numeric(14,8),
  tx_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Payments: immutable audit ledger rows (one per detected incoming transfer)
create table if not exists xmr_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references xmr_invoices(id) on delete cascade,
  tx_hash text not null,
  amount_xmr numeric(14,8) not null,
  confirmations int not null default 0,
  detected_at timestamptz not null default now(),
  unique (invoice_id, tx_hash)
);

-- RLS: enable + configure
alter table xmr_address_pool enable row level security;
alter table xmr_invoices enable row level security;
alter table xmr_payments enable row level security;

drop policy if exists admins_select_address_pool on xmr_address_pool;
create policy admins_select_address_pool on xmr_address_pool
  for select to authenticated using (true);

drop policy if exists admins_select_xmr_invoices on xmr_invoices;
create policy admins_select_xmr_invoices on xmr_invoices
  for select to authenticated using (true);

drop policy if exists admins_update_xmr_invoices on xmr_invoices;
create policy admins_update_xmr_invoices on xmr_invoices
  for update to authenticated using (true);

drop policy if exists admins_select_xmr_payments on xmr_payments;
create policy admins_select_xmr_payments on xmr_payments
  for select to authenticated using (true);

-- Realtime for admin panel notifications (idempotent; keeps existing tables)
do $$
begin
  alter publication supabase_realtime add table public.xmr_invoices;
  alter publication supabase_realtime add table public.xmr_payments;
exception when duplicate_object then null;
end $$;

-- Atomic "pop one unused address" for checkout; fails cleanly when pool is empty
create or replace function pop_xmr_address()
returns table (address text, subaddress_index int)
language plpgsql security definer
as $$
declare
  v xmr_address_pool%rowtype;
begin
  select * into v
    from xmr_address_pool
   where status = 'unused'
   order by id
   limit 1
   for update skip locked;
  if v.id is null then
    raise exception 'NO_ADDRESS_AVAILABLE';
  end if;
  update xmr_address_pool set status = 'assigned' where id = v.id;
  return query select v.address, v.subaddress_index;
end $$;

revoke all on function pop_xmr_address() from public;
grant execute on function pop_xmr_address() to service_role, authenticated;