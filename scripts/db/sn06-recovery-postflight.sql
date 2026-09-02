\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(p_value boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_value is distinct from true then
    raise exception 'SN06 postflight failed: %', p_label;
  end if;
end;
$$;

select concat_ws('|',
  (select count(*) from public.accounts where id::text like '65100000-%'),
  (select count(*) from public.orders where id::text like '65400000-%'),
  (select count(*) from public.briefs where id::text like '65500000-%')
) as sn06_graph_counts;

select pg_temp.assert_true(
  (select count(*) >= 2 from public.accounts where id::text like '65100000-%')
  and (select count(*) >= 3 from public.orders where id::text like '65400000-%')
  and (select count(*) >= 3 from public.briefs where id::text like '65500000-%')
  and exists (select 1 from public.accounts where id = '65100000-0000-4000-8000-000000000001')
  and exists (select 1 from public.accounts where id = '65100000-0000-4000-8000-000000000002'),
  'restored multi-account order and brief graph'
);

select pg_temp.assert_true(
  (select email like 'deleted+%@privacy.invalid' and privacy_anonymized_at is not null
   from public.contacts where id = '65200000-0000-4000-8000-000000000001')
  and (select email = 'other-a@sn05.example.invalid'
   from public.contacts where id = '65200000-0000-4000-8000-000000000002')
  and (select email = 'subject-b@sn05.example.invalid'
   from public.contacts where id = '65200000-0000-4000-8000-000000000003'),
  'privacy anonymization and same-account/cross-account isolation survived'
);

select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(raw_submission_json = '{}'::jsonb)
   from public.briefs where order_id in (
     '65400000-0000-4000-8000-000000000001',
     '65400000-0000-4000-8000-000000000002'))
  and (select raw_submission_json->>'keyDetails' = 'B private details'
   from public.briefs where id = '65500000-0000-4000-8000-000000000003'),
  'eligible A content stayed erased while B content survived'
);

select pg_temp.assert_true(
  (select payment_status = 'dispute_lost'
      and stripe_payment_intent_id = 'pi_sn05_a1'
      and stripe_charge_id = 'ch_sn05_a1'
   from public.orders where id = '65400000-0000-4000-8000-000000000001')
  and (select payment_status = 'refunded'
      and stripe_payment_intent_id = 'pi_sn05_a2'
   from public.orders where id = '65400000-0000-4000-8000-000000000002')
  and exists (select 1 from public.stripe_events where event_id = 'evt_sn05_paid_a1')
  and exists (select 1 from private.payment_reconciliation_alerts
    where event_id = 'evt_sn05_dispute_a1' and dispute_id = 'dp_sn05_a1'),
  'payment refund dispute and reconciliation evidence survived'
);

select pg_temp.assert_true(
  exists (select 1 from public.engagement_assignments
    where id = '65800000-0000-4000-8000-000000000001')
  and exists (select 1 from public.engagement_work_items
    where id = '65900000-0000-4000-8000-000000000001'
      and content_json = '{"privacyState":"anonymized"}'::jsonb)
  and exists (select 1 from private.intake_manager_queue
    where order_id = '65400000-0000-4000-8000-000000000001'),
  'assignment fulfillment and queue evidence survived'
);

select pg_temp.assert_true(
  (select request_state = 'completed' from private.privacy_requests
   where request_type = 'restriction' order by requested_at limit 1)
  and exists (select 1 from private.privacy_export_artifacts
    where payload is null and purged_at is not null)
  and not exists (select 1 from private.retention_policies
    where active or retention_interval is not null),
  'restriction export expiry and unapproved retention policy survived'
);

select pg_temp.assert_true(
  not exists (
    select stripe_checkout_session_id from public.orders
    where stripe_checkout_session_id is not null
    group by stripe_checkout_session_id having count(*) > 1
  ) and not exists (
    select stripe_payment_intent_id from public.orders
    where stripe_payment_intent_id is not null
    group by stripe_payment_intent_id having count(*) > 1
  ) and not exists (
    select event_id from public.stripe_events group by event_id having count(*) > 1
  ),
  'provider and event uniqueness survived'
);

select pg_temp.assert_true(
  not exists (select 1 from pg_constraint where contype = 'f' and not convalidated)
  and not exists (
    select 1 from public.orders o
    left join public.accounts a on a.id = o.account_id
    left join public.campaigns c on c.id = o.campaign_id and c.account_id = o.account_id
    left join public.contacts ct on ct.id = o.primary_contact_id and ct.account_id = o.account_id
    where a.id is null or c.id is null
      or (o.primary_contact_id is not null and ct.id is null)
  ),
  'validated foreign keys and graph integrity survived'
);

select 'SNICK_SN06_RECOVERY_POSTFLIGHT_PASS' as result;
