-- Enforce account coherence across each non-payment engagement graph.
--
-- The foundational schema used independent foreign keys for an order's
-- account, campaign, and primary contact. That allowed a structurally valid
-- row to combine records from different accounts. This successor migration
-- adds composite foreign keys and repeats the account predicates in the
-- service-lead projection as defense in depth.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Freeze every relation that can change the graph while the preflight and
-- constraint validation run. A busy database fails closed instead of waiting
-- indefinitely or validating a moving target.
lock table public.accounts, public.contacts, public.campaigns, public.orders
  in share row exclusive mode;

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    where con.conname = 'orders_campaign_id_fkey'
      and con.conrelid = 'public.orders'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.orders'::regclass
           and attname = 'campaign_id' and not attisdropped)
      ]::smallint[]
      and con.confrelid = 'public.campaigns'::regclass
      and con.confkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.campaigns'::regclass
           and attname = 'id' and not attisdropped)
      ]::smallint[]
      and con.convalidated
      and not con.condeferrable
      and not con.condeferred
      and con.confdeltype = 'c'
      and con.confupdtype = 'a'
      and con.confmatchtype = 's'
  ) then
    raise exception 'Expected predecessor campaign foreign key is missing or changed'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_constraint con
    where con.conname = 'orders_primary_contact_id_fkey'
      and con.conrelid = 'public.orders'::regclass
      and con.contype = 'f'
      and con.conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.orders'::regclass
           and attname = 'primary_contact_id' and not attisdropped)
      ]::smallint[]
      and con.confrelid = 'public.contacts'::regclass
      and con.confkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.contacts'::regclass
           and attname = 'id' and not attisdropped)
      ]::smallint[]
      and con.convalidated
      and not con.condeferrable
      and not con.condeferred
      and con.confdeltype = 'n'
      and con.confupdtype = 'a'
      and con.confmatchtype = 's'
  ) then
    raise exception 'Expected predecessor contact foreign key is missing or changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
    where c.account_id <> o.account_id
  ) then
    raise exception 'Cannot enforce engagement graph: cross-account campaign reference exists'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.orders o
    join public.contacts ct on ct.id = o.primary_contact_id
    where ct.account_id <> o.account_id
  ) then
    raise exception 'Cannot enforce engagement graph: cross-account contact reference exists'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.campaigns
  add constraint campaigns_id_account_id_key unique (id, account_id);

alter table public.contacts
  add constraint contacts_id_account_id_key unique (id, account_id);

-- Replace the two single-column constraints inside the same locked
-- transaction. Their indexes remain, while the composite constraints below
-- become the single source of referential and delete-action truth.
alter table public.orders
  drop constraint orders_campaign_id_fkey;

alter table public.orders
  drop constraint orders_primary_contact_id_fkey;

alter table public.orders
  add constraint orders_campaign_account_fkey
  foreign key (campaign_id, account_id)
  references public.campaigns (id, account_id)
  on delete cascade
  not valid;

alter table public.orders
  add constraint orders_primary_contact_account_fkey
  foreign key (primary_contact_id, account_id)
  references public.contacts (id, account_id)
  on delete set null (primary_contact_id)
  not valid;

alter table public.orders
  validate constraint orders_campaign_account_fkey;

alter table public.orders
  validate constraint orders_primary_contact_account_fkey;

create or replace function public.read_service_lead_engagement(p_order_id uuid)
returns table (
  authorized boolean,
  reason_code text,
  receipt_id bigint,
  engagement_json jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_assignment public.engagement_assignments%rowtype;
  v_receipt_id bigint;
  v_payload jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'read_committed_required',
      v_actor_id, v_actor_id, p_order_id, null, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'read_committed_required', v_receipt_id, null::jsonb;
    return;
  end if;

  if not (select private.has_live_auth_session()) then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'live_session_required',
      v_actor_id, v_actor_id, p_order_id, null, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'live_session_required', v_receipt_id, null::jsonb;
    return;
  end if;

  select a.* into v_assignment
  from public.engagement_assignments a
  join public.profiles p on p.id = a.assignee_profile_id and p.active = true
  where a.order_id = p_order_id
    and a.assignee_profile_id = v_actor_id
    and a.assignment_role = 'service_lead'
    and a.lifecycle_status = 'active'
    and a.starts_at <= statement_timestamp()
    and a.expires_at > statement_timestamp()
  for share of a, p;

  if not found then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'service_lead_assignment_required',
      v_actor_id, v_actor_id, p_order_id, null, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'service_lead_assignment_required', v_receipt_id, null::jsonb;
    return;
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'dueAt', o.due_at,
      'deliveredAt', o.delivered_at,
      'createdAt', o.created_at,
      'updatedAt', o.updated_at
    ),
    'account', jsonb_build_object(
      'id', ac.id,
      'name', ac.name,
      'accountType', ac.account_type,
      'website', ac.website,
      'location', ac.location,
      'status', ac.status
    ),
    'campaign', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'campaignFamily', c.campaign_family,
      'primaryAction', c.primary_action,
      'status', c.status,
      'notes', c.notes
    ),
    'primaryContact', case
      when ct.id is null then null
      else jsonb_build_object(
        'id', ct.id,
        'name', ct.name,
        'email', ct.email,
        'role', ct.role,
        'phone', ct.phone
      )
    end,
    'brief', case
      when b.id is null then null
      else jsonb_build_object(
        'id', b.id,
        'rawSubmission', b.raw_submission_json,
        'organizationName', b.organization_name,
        'campaignName', b.campaign_name,
        'campaignType', b.campaign_type,
        'dateTime', b.date_time,
        'locationOrLink', b.location_or_link,
        'targetAudience', b.target_audience,
        'mainGoal', b.main_goal,
        'offerOrAsk', b.offer_or_ask,
        'keyDetails', b.key_details,
        'tone', b.tone,
        'channelsNeeded', b.channels_needed,
        'websiteSocialLinks', b.website_social_links,
        'phrasesToInclude', b.phrases_to_include,
        'phrasesToAvoid', b.phrases_to_avoid,
        'additionalNotes', b.additional_notes,
        'deliveryEmail', b.delivery_email
      )
    end
  ) into v_payload
  from public.orders o
  join public.accounts ac on ac.id = o.account_id
  join public.campaigns c
    on c.id = o.campaign_id
   and c.account_id = o.account_id
  left join public.contacts ct
    on ct.id = o.primary_contact_id
   and ct.account_id = o.account_id
  left join public.briefs b on b.order_id = o.id
  where o.id = p_order_id;

  if v_payload is null then
    v_receipt_id := private.write_engagement_access_audit(
      'engagement_access_denied', 'denied', 'order_not_found', v_actor_id,
      v_actor_id, p_order_id, v_assignment.id, null, 'service_lead',
      'service_lead_engagement', null, 'read_service_lead_engagement', null
    );
    return query select false, 'order_not_found', v_receipt_id, null::jsonb;
    return;
  end if;

  v_receipt_id := private.write_engagement_access_audit(
    'engagement_access_allowed', 'allowed', 'active_service_lead_assignment',
    v_actor_id, v_actor_id, p_order_id, v_assignment.id, null, 'service_lead',
    'service_lead_engagement', p_order_id, 'read_service_lead_engagement', null
  );
  return query select true, 'active_service_lead_assignment', v_receipt_id, v_payload;
end;
$$;

revoke all on function public.read_service_lead_engagement(uuid)
  from public, anon, service_role;
grant execute on function public.read_service_lead_engagement(uuid)
  to authenticated;

comment on constraint orders_campaign_account_fkey on public.orders is
  'Prevents an order from referencing a campaign owned by another account.';

comment on constraint orders_primary_contact_account_fkey on public.orders is
  'Prevents an order from referencing a primary contact owned by another account.';

commit;
