\set ON_ERROR_STOP on

-- The manager queue is a derived, metadata-only read model. Reconcile it from
-- its authoritative intake, checkout, order, and payment-alert sources while
-- holding the source tables stable. Existing receipt IDs remain stable; a
-- missing receipt receives a new opaque ID.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.pending_intakes,
  public.checkout_intents,
  public.orders,
  private.payment_reconciliation_alerts,
  private.intake_manager_queue
  in share row exclusive mode;

create index if not exists intake_manager_queue_state_created_idx
  on private.intake_manager_queue (queue_state, created_at);

delete from private.intake_manager_queue q
where (q.intake_kind = 'non_payment' and not exists (
    select 1 from public.pending_intakes p where p.id = q.intake_id
  ))
  or (q.intake_kind = 'checkout' and not exists (
    select 1 from public.checkout_intents i where i.id = q.intake_id
  ));

insert into private.intake_manager_queue (
  intake_kind, intake_id, queue_state, payment_state, order_id
)
select 'non_payment', p.id, 'received', 'not_applicable', null
from public.pending_intakes p
on conflict (intake_kind, intake_id) do update
set queue_state = excluded.queue_state,
    payment_state = excluded.payment_state,
    order_id = excluded.order_id,
    updated_at = clock_timestamp();

select private.sync_checkout_manager_queue(i.id)
from public.checkout_intents i
order by i.id;

commit;
