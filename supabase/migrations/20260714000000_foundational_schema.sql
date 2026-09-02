-- Public-safe foundational schema reconstructed from the live database.
-- `if not exists` keeps this prehistory migration safe for a project where the
-- original tables predated the recorded Supabase migration ledger.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'operator'
    check (role in ('owner', 'operator', 'reviewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text,
  website text,
  location text,
  status text not null default 'active'
    check (status in ('active', 'prospect', 'paused', 'churned')),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  email text not null,
  role text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null,
  campaign_family text,
  primary_action text,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  primary_contact_id uuid references public.contacts (id) on delete set null,
  package_type text not null default 'standard_99',
  price_cents integer not null default 9900,
  status text not null default 'new_intake',
  due_at timestamptz,
  delivered_at timestamptz,
  assigned_reviewer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  raw_submission_json jsonb not null default '{}'::jsonb,
  organization_name text,
  campaign_name text,
  campaign_type text,
  date_time text,
  location_or_link text,
  target_audience text,
  main_goal text,
  offer_or_ask text,
  key_details text,
  tone text,
  channels_needed text,
  website_social_links text,
  phrases_to_include text,
  phrases_to_avoid text,
  additional_notes text,
  delivery_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  message text not null,
  metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.orders enable row level security;
alter table public.briefs enable row level security;
alter table public.internal_notes enable row level security;
alter table public.activity_events enable row level security;

-- These six indexes predated the remote migration ledger and are present in
-- the live schema. Include them here so a clean replay matches production and
-- does not regress foreign-key cascade or common order-filter performance.
create index if not exists idx_contacts_account on public.contacts (account_id);
create index if not exists idx_campaigns_account on public.campaigns (account_id);
create index if not exists idx_orders_account on public.orders (account_id);
create index if not exists idx_orders_campaign on public.orders (campaign_id);
create index if not exists idx_activity_order on public.activity_events (order_id, created_at desc);
create index if not exists idx_orders_status on public.orders (status);
