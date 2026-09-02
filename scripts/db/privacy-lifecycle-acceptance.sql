\set ON_ERROR_STOP on

-- SN Sprint 05 disposable-local privacy lifecycle corpus. Every identity and
-- address is synthetic and uses the reserved .invalid TLD.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_value is distinct from true then
    raise exception 'SN05 assertion failed: %', p_label;
  end if;
end;
$$;

create or replace function pg_temp.set_claims(
  p_user_id uuid,
  p_session_id uuid,
  p_aal text default 'aal2'
)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'session_id', p_session_id::text,
      'exp', floor(extract(epoch from clock_timestamp()))::bigint + 3600,
      'role', 'authenticated',
      'aal', p_aal
    )::text,
    false
  );
end;
$$;

begin;

create temporary table pg_temp.sn05_ids (
  label text primary key,
  id uuid not null
) on commit drop;

insert into auth.sessions (id, user_id, refreshed_at, not_after)
values (
  '65000000-0000-4000-8000-100000000001',
  '65000000-0000-4000-8000-000000000001',
  clock_timestamp(), clock_timestamp() + interval '1 day'
);
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '65000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'privacy-operator@sn05.example.invalid', '{}'::jsonb,
  '{"full_name":"Synthetic Privacy Operator"}'::jsonb,
  clock_timestamp(), clock_timestamp(), false, false
);
update public.profiles set active = true, role = 'operator', updated_at = clock_timestamp()
where id = '65000000-0000-4000-8000-000000000002';
insert into auth.sessions (id, user_id, refreshed_at, not_after)
values (
  '65000000-0000-4000-8000-100000000002',
  '65000000-0000-4000-8000-000000000002',
  clock_timestamp(), clock_timestamp() + interval '1 day'
);

-- Customer A has two orders and shares one account with a second contact.
-- Customer B is a separate isolation control.
insert into public.accounts (
  id, name, account_type, website, location, status, source, notes
) values
  ('65100000-0000-4000-8000-000000000001', 'Synthetic Shared Account A',
    'synthetic_nonprofit', 'https://a.sn05.example.invalid', 'Synthetic',
    'active', 'synthetic_fixture', 'Synthetic shared-account note A'),
  ('65100000-0000-4000-8000-000000000002', 'Synthetic Account B',
    'synthetic_nonprofit', 'https://b.sn05.example.invalid', 'Synthetic',
    'active', 'synthetic_fixture', 'Synthetic isolation note B');

insert into public.contacts (
  id, account_id, name, email, role, phone, is_primary, notes
) values
  ('65200000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000001', 'Synthetic Subject A',
    'subject-a@sn05.example.invalid', 'requester', '+1 555 0100', true, 'A PII'),
  ('65200000-0000-4000-8000-000000000002',
    '65100000-0000-4000-8000-000000000001', 'Synthetic Other Contact',
    'other-a@sn05.example.invalid', 'other', '+1 555 0101', false, 'Must remain'),
  ('65200000-0000-4000-8000-000000000003',
    '65100000-0000-4000-8000-000000000002', 'Synthetic Subject B',
    'subject-b@sn05.example.invalid', 'requester', '+1 555 0200', true, 'B PII');

insert into public.campaigns (
  id, account_id, name, campaign_family, primary_action, status, notes
) values
  ('65300000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000001', 'Synthetic Campaign A1',
    'fictional', 'Synthetic action A1', 'active', 'A1 content'),
  ('65300000-0000-4000-8000-000000000002',
    '65100000-0000-4000-8000-000000000001', 'Synthetic Campaign A2',
    'fictional', 'Synthetic action A2', 'active', 'A2 content'),
  ('65300000-0000-4000-8000-000000000003',
    '65100000-0000-4000-8000-000000000002', 'Synthetic Campaign B',
    'fictional', 'Synthetic action B', 'active', 'B content');

insert into public.orders (
  id, campaign_id, account_id, primary_contact_id, package_type, price_cents,
  status, delivered_at, stripe_checkout_session_id,
  stripe_payment_intent_id, stripe_customer_id, stripe_charge_id,
  payment_status, paid_at, currency
) values
  ('65400000-0000-4000-8000-000000000001',
    '65300000-0000-4000-8000-000000000001',
    '65100000-0000-4000-8000-000000000001',
    '65200000-0000-4000-8000-000000000001', 'standard_99', 9900,
    'delivered', clock_timestamp(), 'cs_sn05_a1', 'pi_sn05_a1',
    'cus_sn05_a1', 'ch_sn05_a1', 'disputed', clock_timestamp(), 'usd'),
  ('65400000-0000-4000-8000-000000000002',
    '65300000-0000-4000-8000-000000000002',
    '65100000-0000-4000-8000-000000000001',
    '65200000-0000-4000-8000-000000000001', 'standard_99', 9900,
    'closed', clock_timestamp(), 'cs_sn05_a2', 'pi_sn05_a2',
    'cus_sn05_a2', 'ch_sn05_a2', 'refunded', clock_timestamp(), 'usd'),
  ('65400000-0000-4000-8000-000000000003',
    '65300000-0000-4000-8000-000000000003',
    '65100000-0000-4000-8000-000000000002',
    '65200000-0000-4000-8000-000000000003', 'standard_99', 9900,
    'new_intake', null, 'cs_sn05_b', 'pi_sn05_b',
    'cus_sn05_b', 'ch_sn05_b', 'paid', clock_timestamp(), 'usd');

insert into public.briefs (
  id, order_id, raw_submission_json, organization_name, campaign_name,
  campaign_type, key_details, delivery_email
) values
  ('65500000-0000-4000-8000-000000000001',
    '65400000-0000-4000-8000-000000000001',
    '{"organizationName":"Synthetic Shared Account A","campaignName":"Synthetic Campaign A1","keyDetails":"A private details","deliveryEmail":"subject-a@sn05.example.invalid"}',
    'Synthetic Shared Account A', 'Synthetic Campaign A1', 'Fundraiser',
    'A private details', 'subject-a@sn05.example.invalid'),
  ('65500000-0000-4000-8000-000000000002',
    '65400000-0000-4000-8000-000000000002',
    '{"organizationName":"Synthetic Shared Account A","campaignName":"Synthetic Campaign A2","keyDetails":"A second private detail","deliveryEmail":"subject-a@sn05.example.invalid"}',
    'Synthetic Shared Account A', 'Synthetic Campaign A2', 'Fundraiser',
    'A second private detail', 'subject-a@sn05.example.invalid'),
  ('65500000-0000-4000-8000-000000000003',
    '65400000-0000-4000-8000-000000000003',
    '{"organizationName":"Synthetic Account B","campaignName":"Synthetic Campaign B","keyDetails":"B private details","deliveryEmail":"subject-b@sn05.example.invalid"}',
    'Synthetic Account B', 'Synthetic Campaign B', 'Fundraiser',
    'B private details', 'subject-b@sn05.example.invalid');

insert into public.pending_intakes (id, brief_json, delivery_email, status)
values
  ('65600000-0000-4000-8000-000000000001',
    '{"organizationName":"Synthetic Shared Account A","campaignName":"A pending","deliveryEmail":"subject-a@sn05.example.invalid"}',
    'subject-a@sn05.example.invalid', 'pending'),
  ('65600000-0000-4000-8000-000000000002',
    '{"organizationName":"Synthetic Account B","campaignName":"B pending","deliveryEmail":"subject-b@sn05.example.invalid"}',
    'subject-b@sn05.example.invalid', 'pending');

insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency,
  stripe_checkout_session_id, terms_version, status, order_id
) values
  ('65700000-0000-4000-8000-000000000001',
    '{"organizationName":"Synthetic Shared Account A","campaignName":"Synthetic Campaign A1","deliveryEmail":"subject-a@sn05.example.invalid"}',
    'subject-a@sn05.example.invalid', 9900, 'usd', 'cs_sn05_a1',
    '2026-08-30', 'paid', '65400000-0000-4000-8000-000000000001'),
  ('65700000-0000-4000-8000-000000000002',
    '{"organizationName":"Synthetic Account B","campaignName":"Synthetic Campaign B","deliveryEmail":"subject-b@sn05.example.invalid"}',
    'subject-b@sn05.example.invalid', 9900, 'usd', 'cs_sn05_b',
    '2026-08-30', 'paid', '65400000-0000-4000-8000-000000000003');

insert into public.stripe_checkout_reservations (
  intent_id, checkout_session_id, stripe_session_expires_at,
  reservation_expires_at, reservation_state, order_id,
  reserved_at, activated_at, updated_at
) values (
  '65700000-0000-4000-8000-000000000001', 'cs_sn05_a1',
  clock_timestamp() + interval '1 hour', clock_timestamp() + interval '66 minutes',
  'active', '65400000-0000-4000-8000-000000000001',
  clock_timestamp(), clock_timestamp(), clock_timestamp()
);
insert into public.stripe_events (event_id, event_type, checkout_session_id, order_id)
values
  ('evt_sn05_paid_a1', 'checkout.session.completed', 'cs_sn05_a1',
    '65400000-0000-4000-8000-000000000001'),
  ('evt_sn05_refund_a2', 'charge.refunded', 'cs_sn05_a2',
    '65400000-0000-4000-8000-000000000002');
insert into private.payment_reconciliation_alerts (
  event_id, event_type, alert_code, checkout_intent_id, checkout_session_id,
  payment_intent_id, charge_id, dispute_id, order_id
) values (
  'evt_sn05_dispute_a1', 'charge.dispute.created',
  'dispute_opened_attention_required',
  '65700000-0000-4000-8000-000000000001', 'cs_sn05_a1',
  'pi_sn05_a1', 'ch_sn05_a1', 'dp_sn05_a1',
  '65400000-0000-4000-8000-000000000001'
);
update public.orders set payment_status = 'dispute_lost'
where id = '65400000-0000-4000-8000-000000000001';

insert into public.engagement_assignments (
  id, order_id, assignee_profile_id, assignment_role, expires_at,
  assigned_by_profile_id
) values (
  '65800000-0000-4000-8000-000000000001',
  '65400000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001', 'service_lead',
  clock_timestamp() + interval '1 day',
  '65000000-0000-4000-8000-000000000001'
);
insert into public.engagement_work_items (
  id, order_id, item_type, content_json,
  created_by_profile_id, updated_by_profile_id
) values (
  '65900000-0000-4000-8000-000000000001',
  '65400000-0000-4000-8000-000000000001', 'draft',
  '{"content":"Synthetic customer work product A"}',
  '65000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001'
);
insert into public.internal_notes (
  id, account_id, campaign_id, order_id, author_id, body
) values (
  '65a00000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000001',
  '65300000-0000-4000-8000-000000000001',
  '65400000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001', 'Synthetic private note A'
);
insert into public.activity_events (
  id, account_id, order_id, event_type, message, metadata_json
) values (
  '65b00000-0000-4000-8000-000000000001',
  '65100000-0000-4000-8000-000000000001',
  '65400000-0000-4000-8000-000000000001', 'payment_received',
  'Synthetic Subject A paid',
  '{"amount_cents":9900,"currency":"usd","customer_email":"subject-a@sn05.example.invalid"}'
);

-- Raw intake enforcement: unknown keys, credentials, and card-like values
-- fail before storage. Accepted schemas continue to admit bounded fixtures.
do $raw_governance$
begin
  begin
    insert into public.pending_intakes (id, brief_json, delivery_email)
    values ('65c00000-0000-4000-8000-000000000001',
      '{"unknownPermanentField":"value"}', 'invalid-one@sn05.example.invalid');
    raise exception 'unknown intake key unexpectedly stored';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.pending_intakes (id, brief_json, delivery_email)
    values ('65c00000-0000-4000-8000-000000000002',
      jsonb_build_object('keyDetails', 'pass' || 'word=' || repeat('x', 20)),
      'invalid-two@sn05.example.invalid');
    raise exception 'credential-like intake unexpectedly stored';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.pending_intakes (id, brief_json, delivery_email)
    values ('65c00000-0000-4000-8000-000000000003',
      '{"keyDetails":"4111 1111 1111 1111"}', 'invalid-three@sn05.example.invalid');
    raise exception 'card-like intake unexpectedly stored';
  exception when sqlstate '22023' then null;
  end;
end;
$raw_governance$;
select pg_temp.assert_true(
  not exists (select 1 from public.pending_intakes where id::text like '65c00000-%'),
  'rejected raw payloads leave no rows'
);

-- Resolver uses normalized exact matching and scopes all A raw intake while
-- leaving B and the second same-account contact outside the request.
insert into pg_temp.sn05_ids
select 'a_export', request_id from public.create_privacy_request(
  'access_export', '  SUBJECT-A@SN05.EXAMPLE.INVALID '
);
select pg_temp.assert_true(
  (select r.request_state = 'requested' and r.candidate_contact_count = 1
   from private.privacy_requests r join pg_temp.sn05_ids i on i.id = r.id
   where i.label = 'a_export'),
  'case-normalized exact resolver finds one contact'
);
select pg_temp.assert_true(
  (select count(*) = 3 from private.privacy_request_scopes s
   join pg_temp.sn05_ids i on i.id = s.request_id where i.label = 'a_export'),
  'resolver scopes contact plus matching pending and checkout intake'
);

-- Ordinary staff and owner AAL1 fail; live owner AAL2 verifies and executes.
select pg_temp.set_claims(
  '65000000-0000-4000-8000-000000000002',
  '65000000-0000-4000-8000-100000000002', 'aal2'
);
select pg_temp.assert_true(
  public.verify_privacy_request(
    (select id from pg_temp.sn05_ids where label = 'a_export'),
    '65200000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001'
  ) = 'authorization_denied',
  'ordinary active staff cannot verify privacy identity'
);
select pg_temp.set_claims(
  '65000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-100000000001', 'aal1'
);
select pg_temp.assert_true(
  public.verify_privacy_request(
    (select id from pg_temp.sn05_ids where label = 'a_export'),
    '65200000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000002'
  ) = 'authorization_denied',
  'AAL1 owner cannot verify privacy identity'
);
select pg_temp.set_claims(
  '65000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-100000000001', 'aal2'
);
select pg_temp.assert_true(
  public.verify_privacy_request(
    (select id from pg_temp.sn05_ids where label = 'a_export'),
    '65200000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000003'
  ) = 'identity_verified',
  'live AAL2 owner verifies exact subject'
);

insert into pg_temp.sn05_ids
select 'a_export_artifact', export_artifact_id
from public.execute_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'a_export'),
  '66000000-0000-4000-8000-000000000004', null,
  clock_timestamp() + interval '1 hour'
);
select pg_temp.assert_true(
  (select jsonb_array_length(payload->'orders') = 2
      and jsonb_array_length(payload->'briefs') = 2
      and jsonb_array_length(payload->'pendingIntakes') = 1
      and jsonb_array_length(payload->'checkoutIntakes') = 1
      and payload::text like '%subject-a@sn05.example.invalid%'
      and payload::text not like '%subject-b@sn05.example.invalid%'
      and payload::text not like '%other-a@sn05.example.invalid%'
      and payload::text not like '%cs_sn05_%'
      and payload::text not like '%pi_sn05_%'
      and payload::text not like '%Synthetic private note A%'
   from private.privacy_export_artifacts e
   join pg_temp.sn05_ids i on i.id = e.id where i.label = 'a_export_artifact'),
  'deterministic multi-order export includes A and excludes B, staff, and provider internals'
);
select pg_temp.assert_true(
  (select outcome_code = 'already_completed'
   from public.execute_privacy_request(
     (select id from pg_temp.sn05_ids where label = 'a_export'),
     '66000000-0000-4000-8000-000000000005', null,
     clock_timestamp() + interval '2 hours')),
  'export retry is source-idempotent'
);
select pg_temp.assert_true(
  (select count(*) = 1 from private.privacy_export_artifacts e
   join pg_temp.sn05_ids i on i.id = e.request_id where i.label = 'a_export'),
  'export retry creates one bounded artifact'
);

-- A separate sole-contact, single-campaign graph exercises correction.
insert into public.accounts (id, name, status, source)
values ('65100000-0000-4000-8000-000000000003', 'Synthetic Correctable Account',
  'active', 'synthetic_fixture');
insert into public.contacts (id, account_id, name, email, is_primary)
values ('65200000-0000-4000-8000-000000000004',
  '65100000-0000-4000-8000-000000000003', 'Synthetic Correctable Contact',
  'correct-me@sn05.example.invalid', true);
insert into public.campaigns (id, account_id, name, status)
values ('65300000-0000-4000-8000-000000000004',
  '65100000-0000-4000-8000-000000000003', 'Synthetic Correctable Campaign', 'active');
insert into public.orders (id, campaign_id, account_id, primary_contact_id, price_cents)
values ('65400000-0000-4000-8000-000000000004',
  '65300000-0000-4000-8000-000000000004',
  '65100000-0000-4000-8000-000000000003',
  '65200000-0000-4000-8000-000000000004', 0);
insert into public.briefs (id, order_id, raw_submission_json, delivery_email)
values ('65500000-0000-4000-8000-000000000004',
  '65400000-0000-4000-8000-000000000004',
  '{"campaignName":"Synthetic Correctable Campaign","deliveryEmail":"correct-me@sn05.example.invalid"}',
  'correct-me@sn05.example.invalid');
insert into pg_temp.sn05_ids
select 'correction', request_id from public.create_privacy_request(
  'correction', 'correct-me@sn05.example.invalid'
);
select public.verify_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'correction'),
  '65200000-0000-4000-8000-000000000004',
  '66000000-0000-4000-8000-000000000006'
);
select * from public.execute_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'correction'),
  '66000000-0000-4000-8000-000000000007',
  '{"contactName":"Corrected Synthetic Contact","email":"corrected@sn05.example.invalid","phone":"+1 555 0300","accountName":"Corrected Synthetic Account","campaignName":"Corrected Synthetic Campaign"}',
  null
);
select pg_temp.assert_true(
  (select c.name = 'Corrected Synthetic Contact'
      and c.email = 'corrected@sn05.example.invalid'
      and c.phone = '+1 555 0300'
      and a.name = 'Corrected Synthetic Account'
      and p.name = 'Corrected Synthetic Campaign'
      and b.delivery_email = 'corrected@sn05.example.invalid'
      and b.raw_submission_json->>'deliveryEmail' = 'corrected@sn05.example.invalid'
   from public.contacts c join public.accounts a on a.id = c.account_id
   join public.orders o on o.primary_contact_id = c.id
   join public.campaigns p on p.id = o.campaign_id
   join public.briefs b on b.order_id = o.id
   where c.id = '65200000-0000-4000-8000-000000000004'),
  'correction updates current contact and exclusive account/campaign fields'
);
select pg_temp.assert_true(
  (select outcome_code = 'already_completed'
   from public.execute_privacy_request(
     (select id from pg_temp.sn05_ids where label = 'correction'),
     '66000000-0000-4000-8000-000000000008', '{}'::jsonb, null)),
  'correction retry is singular'
);

-- Restriction blocks new ordinary intake but does not damage existing payment
-- or mandatory operational state.
insert into public.accounts (id, name, status, source)
values ('65100000-0000-4000-8000-000000000004', 'Synthetic Restricted Account',
  'active', 'synthetic_fixture');
insert into public.contacts (id, account_id, name, email, is_primary)
values ('65200000-0000-4000-8000-000000000005',
  '65100000-0000-4000-8000-000000000004', 'Synthetic Restricted Contact',
  'restricted@sn05.example.invalid', true);
insert into pg_temp.sn05_ids
select 'restriction', request_id from public.create_privacy_request(
  'restriction', 'restricted@sn05.example.invalid'
);
select public.verify_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'restriction'),
  '65200000-0000-4000-8000-000000000005',
  '66000000-0000-4000-8000-000000000009'
);
select * from public.execute_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'restriction'),
  '66000000-0000-4000-8000-000000000010', null, null
);
do $restriction$
begin
  begin
    insert into public.pending_intakes (id, brief_json, delivery_email)
    values ('65600000-0000-4000-8000-000000000099',
      '{"campaignName":"Blocked"}', 'restricted@sn05.example.invalid');
    raise exception 'restricted new intake unexpectedly stored';
  exception when insufficient_privilege then null;
  end;
end;
$restriction$;
update public.orders set updated_at = clock_timestamp()
where id = '65400000-0000-4000-8000-000000000003';
select pg_temp.assert_true(
  not exists (select 1 from public.pending_intakes
    where id = '65600000-0000-4000-8000-000000000099')
  and (select payment_status = 'paid' from public.orders
    where id = '65400000-0000-4000-8000-000000000003'),
  'restriction blocks ordinary processing but preserves mandatory payment operations'
);

-- Exact duplicate emails are explicitly ambiguous. Selecting a non-candidate
-- is rejected; an exact candidate can then be verified without conflation.
insert into public.accounts (id, name, status, source) values
  ('65100000-0000-4000-8000-000000000005', 'Synthetic Duplicate One', 'active', 'synthetic_fixture'),
  ('65100000-0000-4000-8000-000000000006', 'Synthetic Duplicate Two', 'active', 'synthetic_fixture');
insert into public.contacts (id, account_id, name, email, is_primary) values
  ('65200000-0000-4000-8000-000000000006',
    '65100000-0000-4000-8000-000000000005', 'Synthetic Duplicate One',
    'duplicate@sn05.example.invalid', true),
  ('65200000-0000-4000-8000-000000000007',
    '65100000-0000-4000-8000-000000000006', 'Synthetic Duplicate Two',
    'DUPLICATE@SN05.EXAMPLE.INVALID', true);
insert into pg_temp.sn05_ids
select 'ambiguous', request_id from public.create_privacy_request(
  'access_export', 'duplicate@sn05.example.invalid'
);
select pg_temp.assert_true(
  (select request_state = 'needs_review' and candidate_contact_count = 2
   from private.privacy_requests r join pg_temp.sn05_ids i on i.id = r.id
   where i.label = 'ambiguous'),
  'duplicate normalized email requires explicit review'
);
do $forged_candidate$
begin
  begin
    perform public.verify_privacy_request(
      (select id from pg_temp.sn05_ids where label = 'ambiguous'),
      '65200000-0000-4000-8000-000000000003',
      '66000000-0000-4000-8000-000000000011'
    );
    raise exception 'forged candidate unexpectedly verified';
  exception when sqlstate '22023' then null;
  end;
end;
$forged_candidate$;
select pg_temp.assert_true(
  public.verify_privacy_request(
    (select id from pg_temp.sn05_ids where label = 'ambiguous'),
    '65200000-0000-4000-8000-000000000006',
    '66000000-0000-4000-8000-000000000012'
  ) = 'identity_verified',
  'review resolves exactly one duplicate-email contact'
);
select pg_temp.assert_true(
  (select count(*) = 1 from private.privacy_request_scopes s
   join pg_temp.sn05_ids i on i.id = s.request_id
   where i.label = 'ambiguous' and s.resource_type = 'contact'),
  'review prunes the unselected same-email contact'
);

-- An interrupted erasure is rolled back completely, then the exact request
-- safely completes and a second call is a no-op.
insert into pg_temp.sn05_ids
select 'a_delete', request_id from public.create_privacy_request(
  'deletion_anonymization', 'subject-a@sn05.example.invalid'
);
select public.verify_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'a_delete'),
  '65200000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000013'
);
do $rollback_test$
begin
  begin
    perform * from public.execute_privacy_request(
      (select id from pg_temp.sn05_ids where label = 'a_delete'),
      '66000000-0000-4000-8000-000000000014', null, null
    );
    raise exception 'synthetic interruption' using errcode = '40001';
  exception when serialization_failure then null;
  end;
end;
$rollback_test$;
select pg_temp.assert_true(
  (select request_state = 'identity_verified' from private.privacy_requests r
   join pg_temp.sn05_ids i on i.id = r.id where i.label = 'a_delete')
  and (select raw_submission_json <> '{}'::jsonb from public.briefs
    where id = '65500000-0000-4000-8000-000000000001'),
  'interrupted anonymization rolls back request and customer-content mutations'
);
select * from public.execute_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'a_delete'),
  '66000000-0000-4000-8000-000000000015', null, null
);
select pg_temp.assert_true(
  (select privacy_anonymized_at is not null
      and email like 'deleted+%@privacy.invalid' and phone is null and notes is null
   from public.contacts where id = '65200000-0000-4000-8000-000000000001')
  and (select email = 'other-a@sn05.example.invalid' and notes = 'Must remain'
    from public.contacts where id = '65200000-0000-4000-8000-000000000002')
  and (select privacy_anonymized_at is null and name = 'Synthetic Shared Account A'
    from public.accounts where id = '65100000-0000-4000-8000-000000000001'),
  'deletion anonymizes A contact without conflating same-account second contact'
);
select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(raw_submission_json = '{}'::jsonb)
      and bool_and(privacy_anonymized_at is not null)
   from public.briefs where order_id in (
     '65400000-0000-4000-8000-000000000001',
     '65400000-0000-4000-8000-000000000002'))
  and not exists (select 1 from public.internal_notes
    where order_id = '65400000-0000-4000-8000-000000000001')
  and (select content_json = '{"privacyState":"anonymized"}'::jsonb
    from public.engagement_work_items
    where id = '65900000-0000-4000-8000-000000000001'),
  'eligible raw brief, work product, and notes are removed or anonymized'
);
select pg_temp.assert_true(
  (select stripe_payment_intent_id = 'pi_sn05_a1'
      and stripe_charge_id = 'ch_sn05_a1'
      and payment_status = 'dispute_lost' and status = 'delivered'
   from public.orders where id = '65400000-0000-4000-8000-000000000001')
  and exists (select 1 from public.stripe_events where event_id = 'evt_sn05_paid_a1')
  and exists (select 1 from private.payment_reconciliation_alerts
    where event_id = 'evt_sn05_dispute_a1' and dispute_id = 'dp_sn05_a1')
  and exists (select 1 from public.engagement_assignments
    where id = '65800000-0000-4000-8000-000000000001')
  and exists (select 1 from private.intake_manager_queue
    where order_id = '65400000-0000-4000-8000-000000000001'),
  'payment, dispute, fulfillment, assignment, and manager evidence survives coherently'
);
select pg_temp.assert_true(
  (select name = 'Synthetic Subject B' and email = 'subject-b@sn05.example.invalid'
   from public.contacts where id = '65200000-0000-4000-8000-000000000003')
  and (select raw_submission_json->>'keyDetails' = 'B private details'
   from public.briefs where id = '65500000-0000-4000-8000-000000000003')
  and (select payment_status = 'paid' from public.orders
   where id = '65400000-0000-4000-8000-000000000003'),
  'A deletion changes zero B customer or payment state'
);
select pg_temp.assert_true(
  (select outcome_code = 'already_completed'
   from public.execute_privacy_request(
     (select id from pg_temp.sn05_ids where label = 'a_delete'),
     '66000000-0000-4000-8000-000000000016', null, null)),
  'duplicate deletion is safe with a new retry key'
);

-- Raw-intake-only subjects remain discoverable and deletable without a live
-- contact or frontend account.
insert into public.pending_intakes (id, brief_json, delivery_email, status)
values ('65600000-0000-4000-8000-000000000003',
  '{"campaignName":"Raw only","deliveryEmail":"raw-only@sn05.example.invalid"}',
  'raw-only@sn05.example.invalid', 'pending');
insert into pg_temp.sn05_ids
select 'raw_only', request_id from public.create_privacy_request(
  'deletion_anonymization', 'raw-only@sn05.example.invalid'
);
select public.verify_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'raw_only'), null,
  '66000000-0000-4000-8000-000000000017'
);
select * from public.execute_privacy_request(
  (select id from pg_temp.sn05_ids where label = 'raw_only'),
  '66000000-0000-4000-8000-000000000018', null, null
);
select pg_temp.assert_true(
  (select brief_json = '{}'::jsonb and privacy_anonymized_at is not null
   from public.pending_intakes where id = '65600000-0000-4000-8000-000000000003'),
  'raw-only record is governed without a frontend contact'
);

-- Explicit export expiry is enforceable now. Approval-dependent policy rows
-- remain inert; a savepoint proves a synthetic configured policy and then
-- restores the unapproved final state.
select pg_temp.assert_true(
  exists (select 1 from private.find_retention_candidates(clock_timestamp() + interval '2 hours') c
    join pg_temp.sn05_ids i on i.id = c.resource_id
    where i.label = 'a_export_artifact' and c.candidate_type = 'export_artifact'),
  'explicit export expiry produces a deterministic retention candidate'
);
select pg_temp.assert_true(
  private.apply_retention_action(
    'export_artifact',
    (select id from pg_temp.sn05_ids where label = 'a_export_artifact'),
    clock_timestamp() + interval '2 hours'
  ) = 'purged',
  'expired export payload is purged'
);
select pg_temp.assert_true(
  (select payload is null and purged_at is not null
   from private.privacy_export_artifacts e join pg_temp.sn05_ids i on i.id = e.id
   where i.label = 'a_export_artifact'),
  'purged export retains lifecycle metadata but no duplicated PII'
);

savepoint synthetic_retention_policy;
insert into public.pending_intakes (
  id, brief_json, delivery_email, status, created_at, updated_at
) values (
  '65600000-0000-4000-8000-000000000004',
  '{"campaignName":"Synthetic old intake"}', 'old@sn05.example.invalid',
  'expired', clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'
);
update private.retention_policies
set approval_state = 'approved', active = true, retention_interval = interval '1 day',
    basis_code = 'synthetic_test_only', updated_at = clock_timestamp()
where policy_key = 'pending_intake_content';
select pg_temp.assert_true(
  exists (select 1 from private.find_retention_candidates(clock_timestamp())
    where candidate_type = 'pending_intake'
      and resource_id = '65600000-0000-4000-8000-000000000004'),
  'test-clock policy finds only configured eligible intake'
);
select pg_temp.assert_true(
  private.apply_retention_action(
    'pending_intake', '65600000-0000-4000-8000-000000000004', clock_timestamp()
  ) = 'anonymized',
  'configured synthetic retention action applies deterministically'
);
rollback to synthetic_retention_policy;
select pg_temp.assert_true(
  (select approval_state = 'unapproved' and active = false
      and retention_interval is null
   from private.retention_policies where policy_key = 'pending_intake_content'),
  'final retention policy remains unapproved and duration-free'
);

-- Catalog, privilege, RLS, audit minimization, and referential integrity.
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.create_privacy_request(text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_privacy_request(text,text)', 'execute')
  and has_function_privilege('service_role', 'public.create_privacy_request(text,text)', 'execute')
  and has_function_privilege('authenticated', 'public.verify_privacy_request(uuid,uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.execute_privacy_request(uuid,uuid,jsonb,timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.read_privacy_export(uuid)', 'execute'),
  'privacy RPC grants are exact'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname like 'privacy_%'
      and c.relkind in ('r', 'p')
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) and not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname like 'privacy_%'
      and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
        or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))
  ),
  'privacy tables force RLS and deny direct browser DML'
);
select pg_temp.assert_true(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name in (
      'privacy_requests', 'privacy_request_actions', 'privacy_audit_receipts'
    ) and column_name ~ '(email|name|phone|brief|content|payload|secret|token|stripe)'
  ) and not exists (
    select 1 from private.privacy_audit_receipts
    where resource_counts::text ~* '(subject-a@|cs_sn05|pi_sn05|secret)'
  ),
  'request and audit metadata contain no duplicated export PII or secrets'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_constraint
    where contype = 'f' and not convalidated
  ),
  'all foreign keys remain validated'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.orders o
    left join public.accounts a on a.id = o.account_id
    left join public.campaigns c on c.id = o.campaign_id and c.account_id = o.account_id
    left join public.contacts ct on ct.id = o.primary_contact_id and ct.account_id = o.account_id
    where a.id is null or c.id is null or (o.primary_contact_id is not null and ct.id is null)
  ),
  'privacy lifecycle leaves no order graph orphans'
);

commit;

select 'SNICK_PRIVACY_LIFECYCLE_ACCEPTANCE_PASS' as result;
