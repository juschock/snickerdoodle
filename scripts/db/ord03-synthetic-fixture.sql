\set ON_ERROR_STOP on

-- Deterministic disposable-only identities and engagement records for ORD-03.
-- Every address uses the reserved .invalid TLD. This file must never be run
-- against a linked, hosted, production, or customer-bearing database.

begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'owner-one@ord03.example.invalid', '{}'::jsonb,
    '{"full_name":"Synthetic Owner One"}'::jsonb, now(), now(), false, false),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'owner-two@ord03.example.invalid', '{}'::jsonb,
    '{"full_name":"Synthetic Owner Two"}'::jsonb, now(), now(), false, false),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'lead-a@ord03.example.invalid', '{}'::jsonb,
    '{"full_name":"Synthetic Lead A"}'::jsonb, now(), now(), false, false),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
    'lead-b@ord03.example.invalid', '{}'::jsonb,
    '{"full_name":"Synthetic Lead B"}'::jsonb, now(), now(), false, false),
  ('00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated',
    'reviewer-a@ord03.example.invalid', '{}'::jsonb,
    '{"full_name":"Synthetic Reviewer A"}'::jsonb, now(), now(), false, false),
  ('00000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated',
    'unassigned@ord03.example.invalid', '{}'::jsonb,
    '{"full_name":"Synthetic Unassigned"}'::jsonb, now(), now(), false, false);

update public.profiles
set role = case
      when id in (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002'
      ) then 'owner'
      when id in (
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000006'
      ) then 'reviewer'
      else 'operator'
    end,
    active = true,
    updated_at = now()
where id between
  '00000000-0000-4000-8000-000000000001'::uuid
  and '00000000-0000-4000-8000-000000000006'::uuid;

insert into auth.sessions (
  id,
  user_id,
  created_at,
  updated_at,
  refreshed_at,
  not_after
)
select
  ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  now(),
  now(),
  now(),
  now() + interval '1 day'
from generate_series(1, 6) as fixture(n);

insert into public.accounts (
  id, name, account_type, website, location, status, source, notes
) values
  ('20000000-0000-4000-8000-000000000001', 'Fictional Community A',
    'synthetic_nonprofit', 'https://a.ord03.example.invalid', 'Synthetic',
    'active', 'synthetic_fixture', 'No real organization or customer'),
  ('20000000-0000-4000-8000-000000000002', 'Fictional Community B',
    'synthetic_nonprofit', 'https://b.ord03.example.invalid', 'Synthetic',
    'active', 'synthetic_fixture', 'No real organization or customer');

insert into public.contacts (
  id, account_id, name, email, role, is_primary, notes
) values
  ('21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001', 'Synthetic Contact A',
    'contact-a@ord03.example.invalid', 'fictional', true, 'Synthetic only'),
  ('21000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002', 'Synthetic Contact B',
    'contact-b@ord03.example.invalid', 'fictional', true, 'Synthetic only');

insert into public.campaigns (
  id, account_id, name, campaign_family, primary_action, status, notes
) values
  ('22000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001', 'Synthetic Campaign A',
    'fictional', 'synthetic_action', 'active', 'No external use'),
  ('22000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002', 'Synthetic Campaign B',
    'fictional', 'synthetic_action', 'active', 'No external use');

insert into public.orders (
  id, campaign_id, account_id, primary_contact_id, package_type,
  price_cents, status, assigned_reviewer_id
) values
  ('23000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    'payment_disabled_synthetic', 0, 'synthetic_ready', null),
  ('23000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    'payment_disabled_synthetic', 0, 'synthetic_ready',
    '00000000-0000-4000-8000-000000000006');

insert into public.briefs (
  id, order_id, raw_submission_json, organization_name, campaign_name,
  main_goal, key_details, tone, delivery_email
) values
  ('24000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    '{"fixture":"synthetic","customerData":false}'::jsonb,
    'Fictional Community A', 'Synthetic Campaign A', 'Exercise ORD-03',
    'No real facts or recipients', 'plain', 'delivery-a@ord03.example.invalid'),
  ('24000000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000002',
    '{"fixture":"synthetic","customerData":false}'::jsonb,
    'Fictional Community B', 'Synthetic Campaign B', 'Exercise isolation',
    'No real facts or recipients', 'plain', 'delivery-b@ord03.example.invalid');

commit;
