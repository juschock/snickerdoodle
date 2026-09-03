\set ON_ERROR_STOP on

-- Disposable acceptance for the final migration chain. Uses only reserved
-- synthetic identifiers and rolls every fixture back.

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'Rejected Checkout setup assertion failed: %', p_label;
  end if;
end;
$$;

begin;
set local role service_role;

select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.release_rejected_stripe_checkout_setup(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'public',
    'public.release_rejected_stripe_checkout_setup(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.release_rejected_stripe_checkout_setup(uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.release_rejected_stripe_checkout_setup(uuid)',
    'execute'
  ),
  'only service_role can execute the rejected-setup release'
);

insert into public.checkout_intents (
  id, brief_json, delivery_email, amount_cents, currency, terms_version, status
) values (
  '69000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'organizationType', 'Nonprofit / Community organization',
    'campaignFamily', 'Cause / Nonprofit campaign',
    'primaryAction', 'Register',
    'organizationName', 'Synthetic Rejected Setup Organization',
    'campaignName', 'Synthetic Rejected Setup Campaign',
    'campaignType', 'Fundraiser',
    'campaignTypeOther', '',
    'dateTime', '2099-01-01T12:00:00Z',
    'locationOrLink', 'https://rejected-setup.example.invalid',
    'audience', 'Synthetic audience',
    'mainGoal', 'Exercise rejected Checkout setup recovery',
    'offerAsk', 'Register',
    'keyDetails', 'Synthetic facts only',
    'tone', 'Professional',
    'toneOther', '',
    'channels', jsonb_build_array('Email'),
    'websiteSocial', '',
    'phrasesInclude', '',
    'phrasesAvoid', '',
    'deliveryEmail', 'rejected-setup@acceptance.example.invalid',
    'additionalNotes', 'No customer data'
  ),
  'rejected-setup@acceptance.example.invalid',
  9900,
  'usd',
  '2026-08-30',
  'pending'
);

select reservation_status
from public.reserve_stripe_checkout_capacity(
  '69000000-0000-4000-8000-000000000001',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
) \gset initial_

select public.compensate_stripe_checkout_setup(
  '69000000-0000-4000-8000-000000000001',
  null,
  false,
  'stripe_session_create_failed'
) as resolution \gset ambiguous_

select public.release_rejected_stripe_checkout_setup(
  '69000000-0000-4000-8000-000000000001'
) as resolution \gset released_

reset role;

select pg_temp.assert_true(
  :'initial_reservation_status' = 'reserved'
  and :'ambiguous_resolution' = 'reconciliation_required'
  and :'released_resolution' = 'released'
  and (select status from public.checkout_intents
       where id = '69000000-0000-4000-8000-000000000001') = 'pending'
  and (select reservation_state from public.stripe_checkout_reservations
       where intent_id = '69000000-0000-4000-8000-000000000001') = 'released'
  and (select released_reason from public.stripe_checkout_reservations
       where intent_id = '69000000-0000-4000-8000-000000000001') =
      'stripe_session_create_rejected'
  and not exists (
    select 1
    from private.payment_reconciliation_alerts
    where checkout_intent_id = '69000000-0000-4000-8000-000000000001'
      and event_type = 'checkout.session.setup'
      and alert_state = 'open'
  ),
  'the exact unbound reservation is released and its setup alert is closed'
);

set local role service_role;

select reservation_status, stripe_session_expires_at
from public.reserve_stripe_checkout_capacity(
  '69000000-0000-4000-8000-000000000001',
  clock_timestamp() + interval '60 minutes',
  clock_timestamp() + interval '65 minutes'
) \gset retry_

select public.bind_stripe_checkout_capacity(
  '69000000-0000-4000-8000-000000000001',
  'cs_test_rejected_setup_acceptance',
  :'retry_stripe_session_expires_at'::timestamptz
);

do $$
begin
  perform public.release_rejected_stripe_checkout_setup(
    '69000000-0000-4000-8000-000000000001'
  );
  raise exception 'Bound Checkout setup was unexpectedly releasable';
exception
  when sqlstate '22023' then null;
end;
$$;

reset role;

select pg_temp.assert_true(
  :'retry_reservation_status' = 'reserved'
  and (select status from public.checkout_intents
       where id = '69000000-0000-4000-8000-000000000001') = 'checkout_created'
  and (select reservation_state from public.stripe_checkout_reservations
       where intent_id = '69000000-0000-4000-8000-000000000001') = 'reserved'
  and (select checkout_session_id from public.stripe_checkout_reservations
       where intent_id = '69000000-0000-4000-8000-000000000001') =
      'cs_test_rejected_setup_acceptance',
  'the repaired retry binds normally and can no longer be released as rejected'
);

rollback;

select 'REJECTED_CHECKOUT_SETUP_ACCEPTANCE_PASS' as result;
