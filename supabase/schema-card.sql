-- Viarela | Card payments (card -> onramp -> XMR to our subaddress, credited by bridge/provider)
-- Customer pays by card; provider delivers XMR to the invoice's fresh subaddress.

alter table xmr_invoices add column if not exists channel text not null default 'xmr' check (channel in ('xmr','card'));

create table if not exists card_orders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid unique not null references xmr_invoices(id) on delete cascade,
  provider text not null default 'changenow',
  provider_order_id text,
  payment_url text,
  fiat_amount numeric(12,2) not null,
  payout_address text not null,
  status text not null default 'pending' check (status in ('new','waiting','confirming','exchanging','sending','finished','failed','refunded','verifying','pending')),
  last_provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table card_orders enable row level security;

drop policy if exists admins_select_card_orders on card_orders;
create policy admins_select_card_orders on card_orders
  for select to authenticated using (true);

drop policy if exists admins_update_card_orders on card_orders;
create policy admins_update_card_orders on card_orders
  for update to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.card_orders;
exception when duplicate_object then null;
end $$;