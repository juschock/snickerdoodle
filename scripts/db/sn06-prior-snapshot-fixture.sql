\set ON_ERROR_STOP on

-- State intentionally captured before the privacy-lifecycle migration. A
-- separately durable synthetic tombstone is replayed after forward migration.
insert into public.accounts (id, name, account_type, status, source)
values ('67100000-0000-4000-8000-000000000001', 'Synthetic Prior Account',
  'synthetic_nonprofit', 'active', 'synthetic_fixture');
insert into public.contacts (id, account_id, name, email, is_primary)
values ('67200000-0000-4000-8000-000000000001',
  '67100000-0000-4000-8000-000000000001', 'Synthetic Resurrected Subject',
  'resurrected@sn06.example.invalid', true);
insert into public.campaigns (id, account_id, name, campaign_family, status)
values ('67300000-0000-4000-8000-000000000001',
  '67100000-0000-4000-8000-000000000001', 'Synthetic Prior Campaign',
  'fictional', 'active');
insert into public.orders (
  id, campaign_id, account_id, primary_contact_id, package_type,
  price_cents, status, payment_status, currency
) values (
  '67400000-0000-4000-8000-000000000001',
  '67300000-0000-4000-8000-000000000001',
  '67100000-0000-4000-8000-000000000001',
  '67200000-0000-4000-8000-000000000001', 'standard_99',
  9900, 'new_intake', 'unpaid', 'usd'
);
insert into public.briefs (
  id, order_id, raw_submission_json, organization_name, campaign_name,
  key_details, delivery_email
) values (
  '67500000-0000-4000-8000-000000000001',
  '67400000-0000-4000-8000-000000000001',
  '{"organizationName":"Synthetic Prior Account","campaignName":"Synthetic Prior Campaign","keyDetails":"must not remain after tombstone replay","deliveryEmail":"resurrected@sn06.example.invalid"}',
  'Synthetic Prior Account', 'Synthetic Prior Campaign',
  'must not remain after tombstone replay', 'resurrected@sn06.example.invalid'
);
