-- Marketplace Management V1 database design
-- Design only. Do not run against the existing gameboost-management-db.
-- Before production, convert this design into a versioned Supabase migration.

create extension if not exists pgcrypto;

create table public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null,
  display_name text not null,
  external_account_id text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'error', 'disabled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketplace_accounts_marketplace_idx
  on public.marketplace_accounts (marketplace);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game text not null,
  category text,
  product_type text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_game_active_idx
  on public.products (game, active);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  external_listing_id text not null,
  title text,
  status text not null default 'unknown',
  price numeric(20,8),
  currency text,
  stock integer not null default 0 check (stock >= 0),
  external_data jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, external_listing_id)
);

create index listings_product_idx on public.listings (product_id);
create index listings_marketplace_status_idx
  on public.listings (marketplace_account_id, status);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  available integer not null default 0 check (available >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  external_order_id text not null,
  buyer_reference text,
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(20,8),
  currency text,
  status text not null default 'pending',
  delivery_status text not null default 'pending',
  external_data jsonb not null default '{}'::jsonb,
  ordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, external_order_id)
);

create index orders_status_created_idx
  on public.orders (status, created_at desc);
create index orders_marketplace_created_idx
  on public.orders (marketplace_account_id, created_at desc);

create table public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null,
  status text not null,
  message text,
  response jsonb,
  created_at timestamptz not null default now()
);

create index delivery_logs_order_created_idx
  on public.delivery_logs (order_id, created_at desc);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  operation text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index sync_logs_marketplace_created_idx
  on public.sync_logs (marketplace_account_id, created_at desc);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  rule_type text not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index automation_rules_product_enabled_idx
  on public.automation_rules (product_id, enabled);

-- Security baseline for Supabase exposed tables.
-- Policies will be added once the authentication/ownership model is finalized.
alter table public.marketplace_accounts enable row level security;
alter table public.products enable row level security;
alter table public.listings enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.delivery_logs enable row level security;
alter table public.sync_logs enable row level security;
alter table public.automation_rules enable row level security;
