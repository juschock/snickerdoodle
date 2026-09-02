-- SN Sprint 04: privileged RPC and direct-access hardening.
--
-- The existing implementations are retained byte-for-byte as private,
-- non-callable internals. Public wrappers add the missing AAL2/role boundary
-- without weakening their existing row locks, idempotency, assignment checks,
-- or payment state-machine behavior.

begin;

set local lock_timeout = '5s';

-- Data API clients use RPCs only. RLS remains enabled as defense in depth,
-- but no ordinary browser role receives a direct table or sequence capability.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all tables in schema private from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all sequences in schema private from anon, authenticated;

-- New routines must not inherit PostgreSQL's default PUBLIC EXECUTE grant.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- This predicate is an internal policy/RPC implementation detail, not a
-- caller-facing authorization oracle.
revoke all on function private.has_active_engagement_role(uuid, text[])
  from public, anon, authenticated, service_role;

-- Preserve the reviewed assignment mutation and its locking/idempotency body
-- as a private internal. The public boundary now requires live owner AAL2.
alter function public.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) set schema private;
alter function private.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) rename to manage_engagement_assignment_internal;
revoke all on function private.manage_engagement_assignment_internal(
  text, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated, service_role;

create function public.manage_engagement_assignment(
  p_action text,
  p_order_id uuid,
  p_assignee_profile_id uuid,
  p_assignment_role text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns table (
  out_decision text,
  out_reason_code text,
  out_assignment_id uuid,
  out_lifecycle_status text,
  out_receipt_id bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt_id bigint;
begin
  if not (select private.is_owner_aal2()) then
    v_receipt_id := private.write_engagement_access_audit(
      'assignment_change_denied', 'denied', 'aal2_owner_required',
      v_actor_id, p_assignee_profile_id, p_order_id, null, null,
      case when p_assignment_role in ('service_lead', 'assigned_reviewer')
        then p_assignment_role else null end,
      'assignment', null, 'manage_assignment', null
    );
    return query select 'denied', 'aal2_owner_required', null::uuid,
      null::text, v_receipt_id;
    return;
  end if;

  return query
  select * from private.manage_engagement_assignment_internal(
    p_action, p_order_id, p_assignee_profile_id, p_assignment_role,
    p_expires_at, p_idempotency_key
  );
end;
$$;

comment on function public.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) is
  'AAL2-owner-only assignment administration wrapper over the reviewed order-scoped, idempotent, race-safe internal mutation.';

revoke all on function public.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public.manage_engagement_assignment(
  text, uuid, uuid, text, timestamptz, text
) to authenticated;

-- Preserve SN03 fulfillment atomicity internally. Owners need AAL2; a live,
-- active service-lead assignment remains the only non-owner path. A denied
-- call returns a non-state reason code so its metadata-only audit receipt can
-- commit; it never locks or mutates the requested order.
alter function public.transition_order_fulfillment(uuid, text, text, uuid)
  set schema private;
alter function private.transition_order_fulfillment(uuid, text, text, uuid)
  rename to transition_order_fulfillment_internal;
revoke all on function private.transition_order_fulfillment_internal(
  uuid, text, text, uuid
) from public, anon, authenticated, service_role;

create function public.transition_order_fulfillment(
  p_order_id uuid,
  p_event_type text,
  p_expected_status text,
  p_idempotency_key uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt_id bigint;
begin
  if not (
    (select private.is_owner_aal2())
    or (select private.has_active_engagement_role(
      p_order_id, array['service_lead']::text[]
    ))
  ) then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied',
      'order_scoped_fulfillment_authorization_required',
      v_actor_id, v_actor_id, p_order_id, null, null, null,
      'order_fulfillment', p_order_id, 'transition_fulfillment', null
    );
    return 'authorization_denied';
  end if;

  return private.transition_order_fulfillment_internal(
    p_order_id, p_event_type, p_expected_status, p_idempotency_key
  );
end;
$$;

comment on function public.transition_order_fulfillment(uuid, text, text, uuid) is
  'AAL2 owner or live order-assigned service lead fulfillment boundary; denial is audited without mutating order state, and allowed calls retain SN03 atomicity/idempotency.';

revoke all on function public.transition_order_fulfillment(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_order_fulfillment(uuid, text, text, uuid)
  to authenticated;

-- Aggregate payment operations reveal no customer content, but remain an
-- owner/admin capability rather than a global staff capability.
alter function public.payment_operations_health() set schema private;
alter function private.payment_operations_health()
  rename to payment_operations_health_internal;
revoke all on function private.payment_operations_health_internal()
  from public, anon, authenticated, service_role;

create function public.payment_operations_health()
returns table (
  generated_at timestamptz,
  is_healthy boolean,
  latest_webhook_received_at timestamptz,
  latest_webhook_completed_at timestamptz,
  webhook_receipts_24h bigint,
  failed_webhook_receipts_24h bigint,
  stuck_webhook_receipts bigint,
  stale_unpaid_checkout_intents bigint,
  paid_checkout_intents_without_order bigint,
  paid_stripe_orders_without_intent bigint,
  paid_stripe_orders_without_event bigint,
  processed_stripe_events_without_paid_order bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_owner_aal2()) then
    raise exception 'AAL2 owner authorization with a live session is required'
      using errcode = '42501';
  end if;

  return query select * from private.payment_operations_health_internal();
end;
$$;

comment on function public.payment_operations_health() is
  'AAL2-owner-only aggregate payment/reconciliation health. No customer content or provider payload is returned.';

revoke all on function public.payment_operations_health()
  from public, anon, authenticated, service_role;
grant execute on function public.payment_operations_health() to authenticated;

-- Different Stripe event IDs for the same Checkout intent previously entered
-- the SN03 body concurrently. A terminal event could start with a pre-payment
-- statement snapshot, wait on the paid transaction, and then classify the
-- exact paid intent as still unpaid. Serialize only events that name the same
-- local intent before entering the unchanged atomic state-machine body. The
-- next statement then receives a fresh READ COMMITTED snapshot. Events for
-- other customers/intents remain fully concurrent.
alter function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) set schema private;
alter function private.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) rename to process_stripe_payment_event_internal;
revoke all on function private.process_stripe_payment_event_internal(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) from public, anon, authenticated, service_role;

create function public.process_stripe_payment_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_checkout_session_id text,
  p_checkout_intent_id uuid,
  p_payment_intent_id text,
  p_stripe_customer_id text,
  p_charge_id text,
  p_dispute_id text,
  p_amount_total integer,
  p_amount_refunded integer,
  p_currency text,
  p_customer_email text,
  p_provider_status text,
  p_occurred_at timestamptz,
  p_test_fail_after_business boolean default false
)
returns table (
  processing_status text,
  transition_code text,
  order_id uuid,
  attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_checkout_intent_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_checkout_intent_id::text, 4042026)
    );
  end if;

  return query
  select * from private.process_stripe_payment_event_internal(
    p_event_id,
    p_event_type,
    p_livemode,
    p_checkout_session_id,
    p_checkout_intent_id,
    p_payment_intent_id,
    p_stripe_customer_id,
    p_charge_id,
    p_dispute_id,
    p_amount_total,
    p_amount_refunded,
    p_currency,
    p_customer_email,
    p_provider_status,
    p_occurred_at,
    p_test_fail_after_business
  );
end;
$$;

comment on function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) is
  'Backend-only atomic Stripe event boundary with per-intent serialization, event idempotency, exact provider binding, and no cross-customer/global lock.';

revoke all on function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.process_stripe_payment_event(
  text, text, boolean, text, uuid, text, text, text, text,
  integer, integer, text, text, text, timestamptz, boolean
) to service_role;

commit;
