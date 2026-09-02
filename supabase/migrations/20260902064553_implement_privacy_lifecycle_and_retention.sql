-- SN Sprint 05: deterministic customer privacy lifecycle and retention.
--
-- This migration intentionally does not invent legal retention durations.
-- Approval-dependent policies are represented as inactive symbolic rows. The
-- only immediately enforceable expiry is the explicit per-export expiry that
-- an authorized owner supplies when generating a privacy export.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.accounts, public.contacts, public.campaigns, public.orders,
  public.briefs, public.internal_notes, public.activity_events,
  public.pending_intakes, public.checkout_intents,
  public.engagement_work_items in share row exclusive mode;

alter table public.accounts
  add column privacy_anonymized_at timestamptz;
alter table public.contacts
  add column processing_restricted_at timestamptz,
  add column privacy_anonymized_at timestamptz;
alter table public.campaigns
  add column privacy_anonymized_at timestamptz;
alter table public.briefs
  add column privacy_anonymized_at timestamptz;
alter table public.pending_intakes
  add column privacy_anonymized_at timestamptz;
alter table public.checkout_intents
  add column privacy_anonymized_at timestamptz;

create index idx_contacts_privacy_normalized_email
  on public.contacts ((lower(btrim(email))))
  where privacy_anonymized_at is null;
create index idx_pending_intakes_privacy_normalized_email
  on public.pending_intakes ((lower(btrim(delivery_email))))
  where privacy_anonymized_at is null;
create index idx_checkout_intents_privacy_normalized_email
  on public.checkout_intents ((lower(btrim(delivery_email))))
  where privacy_anonymized_at is null;

create or replace function private.normalize_privacy_email(p_email text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if char_length(v_email) not between 3 and 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    raise exception 'Invalid privacy subject email' using errcode = '22023';
  end if;
  return v_email;
end;
$$;

create or replace function private.intake_payload_is_allowed(
  p_payload jsonb,
  p_allow_synthetic boolean default false
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_payload is not null
    and jsonb_typeof(p_payload) = 'object'
    and pg_column_size(p_payload) <= 65536
    and not exists (
      select 1
      from jsonb_object_keys(p_payload) as k(key_name)
      where k.key_name <> all (array[
        'organizationType', 'campaignFamily', 'primaryAction',
        'organizationName', 'campaignName', 'campaignType',
        'campaignTypeOther', 'dateTime', 'locationOrLink', 'audience',
        'mainGoal', 'offerAsk', 'keyDetails', 'tone', 'toneOther',
        'channels', 'websiteSocial', 'phrasesInclude', 'phrasesAvoid',
        'deliveryEmail', 'additionalNotes', 'contactName'
      ]::text[])
      and not (
        p_allow_synthetic
        and k.key_name = any (array['fixture', 'customerData']::text[])
      )
    )
    and not exists (
      select 1
      from jsonb_each(p_payload) as e(key_name, field_value)
      where (
        e.key_name = 'channels'
        and (
          jsonb_typeof(e.field_value) <> 'array'
          or exists (
            select 1 from jsonb_array_elements(e.field_value) as channel(value)
            where jsonb_typeof(channel.value) <> 'string'
          )
        )
      ) or (
        e.key_name <> 'channels'
        and e.key_name <> 'customerData'
        and jsonb_typeof(e.field_value) <> 'string'
      ) or (
        e.key_name = 'customerData'
        and jsonb_typeof(e.field_value) <> 'boolean'
      )
    )
    and lower(p_payload::text) !~ '(^|[^a-z0-9])(sk|rk)_(live|test)_[a-z0-9]+'
    and lower(p_payload::text) !~ '(^|[^a-z0-9])whsec_[a-z0-9]+'
    and lower(p_payload::text) !~ '-----begin [^-]*(private|secret) key-----'
    and lower(p_payload::text) !~ '(password|passwd|api[_ -]?key|secret|token)[[:space:]]*[:=][[:space:]]*[^,}[:space:]]+'
    and p_payload::text !~ '([0-9][ -]?){12,18}[0-9]';
$$;

create or replace function private.enforce_customer_intake_governance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_allow_synthetic boolean := false;
  v_anonymized_at timestamptz;
begin
  if tg_table_name = 'briefs' then
    v_payload := new.raw_submission_json;
    v_anonymized_at := new.privacy_anonymized_at;
    select a.source = 'synthetic_fixture' into v_allow_synthetic
    from public.orders o
    join public.accounts a on a.id = o.account_id
    where o.id = new.order_id;
  else
    v_payload := new.brief_json;
    v_anonymized_at := new.privacy_anonymized_at;
  end if;

  if v_anonymized_at is not null and v_payload = '{}'::jsonb then
    return new;
  end if;
  if not private.intake_payload_is_allowed(v_payload, coalesce(v_allow_synthetic, false)) then
    raise exception 'Intake payload violates the accepted privacy schema'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

do $existing_intake_preflight$
begin
  if exists (
    select 1 from public.pending_intakes p
    where not private.intake_payload_is_allowed(p.brief_json, false)
  ) or exists (
    select 1 from public.checkout_intents c
    where not private.intake_payload_is_allowed(c.brief_json, false)
  ) or exists (
    select 1
    from public.briefs b
    join public.orders o on o.id = b.order_id
    join public.accounts a on a.id = o.account_id
    where not private.intake_payload_is_allowed(
      b.raw_submission_json,
      a.source = 'synthetic_fixture'
    )
  ) then
    raise exception 'Existing intake payload violates the accepted privacy schema'
      using errcode = '23514';
  end if;
end;
$existing_intake_preflight$;

create trigger enforce_pending_intake_privacy_schema
before insert or update of brief_json, privacy_anonymized_at
on public.pending_intakes for each row
execute function private.enforce_customer_intake_governance();
create trigger enforce_checkout_intent_privacy_schema
before insert or update of brief_json, privacy_anonymized_at
on public.checkout_intents for each row
execute function private.enforce_customer_intake_governance();
create trigger enforce_brief_privacy_schema
before insert or update of raw_submission_json, privacy_anonymized_at
on public.briefs for each row
execute function private.enforce_customer_intake_governance();

create or replace function private.reject_restricted_subject_intake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.contacts c
    where c.privacy_anonymized_at is null
      and c.processing_restricted_at is not null
      and lower(btrim(c.email)) = private.normalize_privacy_email(new.delivery_email)
  ) then
    raise exception 'Verified subject processing is restricted'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reject_restricted_pending_intake
before insert or update of delivery_email on public.pending_intakes
for each row execute function private.reject_restricted_subject_intake();
create trigger reject_restricted_checkout_intent
before insert or update of delivery_email on public.checkout_intents
for each row execute function private.reject_restricted_subject_intake();

create table private.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in (
    'access_export', 'correction', 'restriction', 'deletion_anonymization'
  )),
  request_state text not null check (request_state in (
    'requested', 'identity_verified', 'processing', 'completed',
    'needs_review', 'rejected'
  )),
  subject_contact_id uuid references public.contacts (id) on delete set null,
  subject_account_id uuid references public.accounts (id) on delete set null,
  candidate_contact_count integer not null default 0
    check (candidate_contact_count >= 0),
  review_reason_code text,
  requested_at timestamptz not null default clock_timestamp(),
  identity_verified_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  verified_by_profile_id uuid references public.profiles (id) on delete set null,
  completed_by_profile_id uuid references public.profiles (id) on delete set null,
  check (review_reason_code is null or review_reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  check (request_state <> 'completed' or completed_at is not null),
  check (request_state <> 'rejected' or rejected_at is not null)
);

comment on table private.privacy_requests is
  'Privacy request lifecycle metadata and graph references only; never stores the submitted email, export payload, or duplicated customer content.';

create table private.privacy_request_scopes (
  request_id uuid not null references private.privacy_requests (id) on delete cascade,
  resource_type text not null check (resource_type in (
    'contact', 'pending_intake', 'checkout_intent'
  )),
  resource_id uuid not null,
  primary key (request_id, resource_type, resource_id)
);

create table private.privacy_request_actions (
  idempotency_key uuid primary key,
  request_id uuid not null references private.privacy_requests (id) on delete cascade,
  action_code text not null check (action_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  outcome_code text not null check (outcome_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (request_id, action_code)
);

create table private.privacy_export_artifacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references private.privacy_requests (id) on delete cascade,
  subject_contact_id uuid references public.contacts (id) on delete set null,
  schema_version text not null default 'snickerdoodle-privacy-export-v1'
    check (schema_version = 'snickerdoodle-privacy-export-v1'),
  payload jsonb,
  payload_octets integer not null check (payload_octets between 2 and 1048576),
  generated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  last_retrieved_at timestamptz,
  purged_at timestamptz,
  check (expires_at > generated_at),
  check ((purged_at is null and payload is not null)
    or (purged_at is not null and payload is null))
);

create table private.privacy_audit_receipts (
  receipt_id bigint generated always as identity primary key,
  request_id uuid references private.privacy_requests (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action_code text not null check (action_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  decision text not null check (decision in ('allowed', 'denied', 'noop')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  resource_counts jsonb not null default '{}'::jsonb,
  changed_fields text[] not null default '{}'::text[],
  occurred_at timestamptz not null default clock_timestamp(),
  check (pg_column_size(resource_counts) <= 4096),
  check (array_length(changed_fields, 1) is null
    or array_length(changed_fields, 1) <= 32)
);

comment on table private.privacy_audit_receipts is
  'Metadata-only privacy decision receipts. Customer content, submitted email, export data, provider payloads, tokens, and secrets are prohibited.';

create table private.retention_policies (
  policy_key text primary key check (policy_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  data_class text not null,
  action_code text not null check (action_code in ('hard_delete', 'anonymize', 'retain_required')),
  retention_interval interval,
  approval_state text not null default 'unapproved'
    check (approval_state in ('unapproved', 'approved', 'retired')),
  active boolean not null default false,
  basis_code text not null,
  updated_at timestamptz not null default clock_timestamp(),
  check (not active or (approval_state = 'approved' and retention_interval is not null))
);

insert into private.retention_policies (
  policy_key, data_class, action_code, basis_code
) values
  ('pending_intake_content', 'raw_intake', 'anonymize', 'legal_approval_required'),
  ('abandoned_checkout_content', 'raw_intake', 'anonymize', 'legal_approval_required'),
  ('customer_content', 'campaign_and_fulfillment', 'anonymize', 'legal_approval_required'),
  ('payment_accounting', 'payment_and_accounting', 'retain_required', 'legal_approval_required'),
  ('security_audit', 'security_and_audit', 'retain_required', 'legal_approval_required');

alter table private.privacy_requests enable row level security;
alter table private.privacy_requests force row level security;
alter table private.privacy_request_scopes enable row level security;
alter table private.privacy_request_scopes force row level security;
alter table private.privacy_request_actions enable row level security;
alter table private.privacy_request_actions force row level security;
alter table private.privacy_export_artifacts enable row level security;
alter table private.privacy_export_artifacts force row level security;
alter table private.privacy_audit_receipts enable row level security;
alter table private.privacy_audit_receipts force row level security;
alter table private.retention_policies enable row level security;
alter table private.retention_policies force row level security;

create index idx_privacy_requests_subject_contact
  on private.privacy_requests (subject_contact_id, requested_at desc);
create index idx_privacy_requests_subject_account
  on private.privacy_requests (subject_account_id, requested_at desc);
create index idx_privacy_requests_verified_by
  on private.privacy_requests (verified_by_profile_id)
  where verified_by_profile_id is not null;
create index idx_privacy_requests_completed_by
  on private.privacy_requests (completed_by_profile_id)
  where completed_by_profile_id is not null;
create index idx_privacy_requests_state_requested
  on private.privacy_requests (request_state, requested_at);
create index idx_privacy_request_scopes_resource
  on private.privacy_request_scopes (resource_type, resource_id);
create index idx_privacy_export_artifacts_expiry
  on private.privacy_export_artifacts (expires_at)
  where purged_at is null;
create index idx_privacy_export_artifacts_subject_contact
  on private.privacy_export_artifacts (subject_contact_id)
  where subject_contact_id is not null;
create index idx_privacy_request_actions_actor
  on private.privacy_request_actions (actor_profile_id)
  where actor_profile_id is not null;
create index idx_privacy_audit_receipts_request
  on private.privacy_audit_receipts (request_id, occurred_at)
  where request_id is not null;
create index idx_privacy_audit_receipts_actor
  on private.privacy_audit_receipts (actor_profile_id, occurred_at)
  where actor_profile_id is not null;

revoke all privileges on table private.privacy_requests,
  private.privacy_request_scopes, private.privacy_request_actions,
  private.privacy_export_artifacts, private.privacy_audit_receipts,
  private.retention_policies from public, anon, authenticated, service_role;
revoke all privileges on sequence private.privacy_audit_receipts_receipt_id_seq
  from public, anon, authenticated, service_role;

create or replace function private.is_privacy_owner_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_owner_aal2())
    and (select private.has_live_auth_session());
$$;

create or replace function private.write_privacy_audit(
  p_request_id uuid,
  p_action_code text,
  p_decision text,
  p_reason_code text,
  p_resource_counts jsonb default '{}'::jsonb,
  p_changed_fields text[] default '{}'::text[]
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt_id bigint;
begin
  insert into private.privacy_audit_receipts (
    request_id, actor_profile_id, action_code, decision, reason_code,
    resource_counts, changed_fields
  ) values (
    p_request_id, (select auth.uid()), p_action_code, p_decision,
    p_reason_code, coalesce(p_resource_counts, '{}'::jsonb),
    coalesce(p_changed_fields, '{}'::text[])
  ) returning receipt_id into v_receipt_id;
  return v_receipt_id;
end;
$$;

create or replace function public.create_privacy_request(
  p_request_type text,
  p_subject_email text
)
returns table (
  request_id uuid,
  request_state text,
  candidate_contact_count integer,
  matched_resource_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_request_id uuid;
  v_contact_count integer;
  v_raw_count integer;
  v_state text;
  v_contact_id uuid;
  v_account_id uuid;
begin
  if p_request_type not in (
    'access_export', 'correction', 'restriction', 'deletion_anonymization'
  ) then
    raise exception 'Unsupported privacy request type' using errcode = '22023';
  end if;
  v_email := private.normalize_privacy_email(p_subject_email);

  select count(*),
    (array_agg(c.id order by c.id))[1],
    (array_agg(c.account_id order by c.id))[1]
  into v_contact_count, v_contact_id, v_account_id
  from public.contacts c
  where c.privacy_anonymized_at is null
    and lower(btrim(c.email)) = v_email;

  select
    (select count(*) from public.pending_intakes p
      where p.privacy_anonymized_at is null
        and lower(btrim(p.delivery_email)) = v_email)
    +
    (select count(*) from public.checkout_intents c
      where c.privacy_anonymized_at is null
        and lower(btrim(c.delivery_email)) = v_email)
  into v_raw_count;

  v_state := case
    when v_contact_count > 1 then 'needs_review'
    when v_contact_count = 0 and v_raw_count = 0 then 'rejected'
    else 'requested'
  end;

  insert into private.privacy_requests (
    request_type, request_state, subject_contact_id, subject_account_id,
    candidate_contact_count, review_reason_code, rejected_at
  ) values (
    p_request_type, v_state,
    case when v_contact_count = 1 then v_contact_id else null end,
    case when v_contact_count = 1 then v_account_id else null end,
    v_contact_count,
    case
      when v_contact_count > 1 then 'ambiguous_exact_contact_matches'
      when v_contact_count = 0 and v_raw_count = 0 then 'no_exact_subject_match'
      when v_contact_count = 0 then 'raw_intake_only_identity_review'
      else null
    end,
    case when v_state = 'rejected' then clock_timestamp() else null end
  ) returning id into v_request_id;

  insert into private.privacy_request_scopes (request_id, resource_type, resource_id)
  select v_request_id, 'contact', c.id
  from public.contacts c
  where c.privacy_anonymized_at is null
    and lower(btrim(c.email)) = v_email;

  if v_contact_count <= 1 then
    insert into private.privacy_request_scopes (request_id, resource_type, resource_id)
    select v_request_id, 'pending_intake', p.id
    from public.pending_intakes p
    where p.privacy_anonymized_at is null
      and lower(btrim(p.delivery_email)) = v_email;
    insert into private.privacy_request_scopes (request_id, resource_type, resource_id)
    select v_request_id, 'checkout_intent', c.id
    from public.checkout_intents c
    where c.privacy_anonymized_at is null
      and lower(btrim(c.delivery_email)) = v_email;
  end if;

  return query select v_request_id, v_state, v_contact_count,
    (select count(*)::integer from private.privacy_request_scopes s
      where s.request_id = v_request_id);
end;
$$;

create or replace function public.verify_privacy_request(
  p_request_id uuid,
  p_subject_contact_id uuid,
  p_idempotency_key uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_requests%rowtype;
  v_actor uuid := (select auth.uid());
begin
  if not (select private.is_privacy_owner_aal2()) then
    perform private.write_privacy_audit(
      p_request_id, 'identity_verification', 'denied', 'owner_aal2_live_session_required'
    );
    return 'authorization_denied';
  end if;
  if p_idempotency_key is null then
    raise exception 'Privacy idempotency key is required' using errcode = '22023';
  end if;

  select * into v_request from private.privacy_requests
  where id = p_request_id for update;
  if not found then
    raise exception 'Privacy request not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from private.privacy_request_actions a
    where a.idempotency_key = p_idempotency_key
      and a.request_id = p_request_id
      and a.action_code = 'identity_verified'
  ) then
    return v_request.request_state;
  end if;
  if v_request.request_state = 'identity_verified' then
    return 'identity_verified';
  end if;
  if v_request.request_state not in ('requested', 'needs_review') then
    raise exception 'Privacy request cannot be verified from current state'
      using errcode = '22023';
  end if;

  if v_request.candidate_contact_count > 1 then
    if p_subject_contact_id is null or not exists (
      select 1 from private.privacy_request_scopes s
      where s.request_id = p_request_id and s.resource_type = 'contact'
        and s.resource_id = p_subject_contact_id
    ) then
      raise exception 'An exact candidate contact selection is required'
        using errcode = '22023';
    end if;
    delete from private.privacy_request_scopes
    where request_id = p_request_id and resource_type = 'contact'
      and resource_id <> p_subject_contact_id;
    select c.account_id into v_request.subject_account_id
    from public.contacts c where c.id = p_subject_contact_id;
    v_request.subject_contact_id := p_subject_contact_id;
  elsif v_request.subject_contact_id is distinct from p_subject_contact_id then
    if not (v_request.subject_contact_id is null and p_subject_contact_id is null) then
      raise exception 'Privacy subject contact binding mismatch'
        using errcode = '22023';
    end if;
  end if;

  update private.privacy_requests
  set request_state = 'identity_verified',
      subject_contact_id = v_request.subject_contact_id,
      subject_account_id = v_request.subject_account_id,
      identity_verified_at = clock_timestamp(),
      verified_by_profile_id = v_actor,
      review_reason_code = null
  where id = p_request_id;

  insert into private.privacy_request_actions (
    idempotency_key, request_id, action_code, outcome_code, actor_profile_id
  ) values (
    p_idempotency_key, p_request_id, 'identity_verified', 'verified', v_actor
  );
  perform private.write_privacy_audit(
    p_request_id, 'identity_verification', 'allowed', 'exact_subject_verified',
    jsonb_build_object('candidate_contact_count', v_request.candidate_contact_count)
  );
  return 'identity_verified';
end;
$$;

create or replace function private.build_privacy_export(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_requests%rowtype;
  v_payload jsonb;
begin
  select * into v_request from private.privacy_requests where id = p_request_id;
  if not found or v_request.request_state not in ('identity_verified', 'processing', 'completed') then
    raise exception 'Verified privacy request is required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'schemaVersion', 'snickerdoodle-privacy-export-v1',
    'requestId', v_request.id,
    'subjectContact', coalesce((
      select jsonb_build_object(
        'id', c.id, 'accountId', c.account_id, 'name', c.name,
        'email', c.email, 'role', c.role, 'phone', c.phone,
        'isPrimary', c.is_primary, 'createdAt', c.created_at,
        'processingRestrictedAt', c.processing_restricted_at
      ) from public.contacts c where c.id = v_request.subject_contact_id
    ), 'null'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'accountType', a.account_type,
        'website', a.website, 'location', a.location, 'status', a.status,
        'createdAt', a.created_at, 'updatedAt', a.updated_at
      ) order by a.id)
      from public.accounts a
      where a.id in (
        select distinct o.account_id from public.orders o
        where o.primary_contact_id = v_request.subject_contact_id
      )
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'accountId', c.account_id, 'name', c.name,
        'campaignFamily', c.campaign_family, 'primaryAction', c.primary_action,
        'status', c.status, 'createdAt', c.created_at, 'updatedAt', c.updated_at
      ) order by c.id)
      from public.campaigns c
      where c.id in (
        select distinct o.campaign_id from public.orders o
        where o.primary_contact_id = v_request.subject_contact_id
      )
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'accountId', o.account_id, 'campaignId', o.campaign_id,
        'packageType', o.package_type, 'priceCents', o.price_cents,
        'currency', o.currency, 'status', o.status,
        'paymentStatus', o.payment_status, 'paidAt', o.paid_at,
        'dueAt', o.due_at, 'deliveredAt', o.delivered_at,
        'createdAt', o.created_at, 'updatedAt', o.updated_at
      ) order by o.id)
      from public.orders o where o.primary_contact_id = v_request.subject_contact_id
    ), '[]'::jsonb),
    'briefs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'orderId', b.order_id,
        'rawSubmission', b.raw_submission_json,
        'organizationName', b.organization_name,
        'campaignName', b.campaign_name, 'campaignType', b.campaign_type,
        'dateTime', b.date_time, 'locationOrLink', b.location_or_link,
        'targetAudience', b.target_audience, 'mainGoal', b.main_goal,
        'offerOrAsk', b.offer_or_ask, 'keyDetails', b.key_details,
        'tone', b.tone, 'channelsNeeded', b.channels_needed,
        'websiteSocialLinks', b.website_social_links,
        'phrasesToInclude', b.phrases_to_include,
        'phrasesToAvoid', b.phrases_to_avoid,
        'additionalNotes', b.additional_notes,
        'deliveryEmail', b.delivery_email, 'createdAt', b.created_at
      ) order by b.order_id)
      from public.briefs b join public.orders o on o.id = b.order_id
      where o.primary_contact_id = v_request.subject_contact_id
    ), '[]'::jsonb),
    'pendingIntakes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'brief', p.brief_json, 'deliveryEmail', p.delivery_email,
        'status', p.status, 'createdAt', p.created_at, 'updatedAt', p.updated_at
      ) order by p.id)
      from public.pending_intakes p
      join private.privacy_request_scopes s
        on s.request_id = v_request.id and s.resource_type = 'pending_intake'
       and s.resource_id = p.id
    ), '[]'::jsonb),
    'checkoutIntakes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'brief', c.brief_json, 'deliveryEmail', c.delivery_email,
        'amountCents', c.amount_cents, 'currency', c.currency,
        'termsVersion', c.terms_version, 'status', c.status,
        'orderId', c.order_id, 'createdAt', c.created_at, 'updatedAt', c.updated_at
      ) order by c.id)
      from public.checkout_intents c
      where c.order_id in (
        select o.id from public.orders o
        where o.primary_contact_id = v_request.subject_contact_id
      ) or exists (
        select 1 from private.privacy_request_scopes s
        where s.request_id = v_request.id and s.resource_type = 'checkout_intent'
          and s.resource_id = c.id
      )
    ), '[]'::jsonb),
    'customerVisibleActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'orderId', e.order_id, 'eventType', e.event_type,
        'occurredAt', e.created_at
      ) order by e.created_at, e.id)
      from public.activity_events e
      where e.order_id in (
        select o.id from public.orders o
        where o.primary_contact_id = v_request.subject_contact_id
      ) and e.event_type in (
        'payment_received', 'fulfillment_started', 'fulfillment_retry_requested',
        'fulfillment_completed', 'order_closed'
      )
    ), '[]'::jsonb)
  ) into v_payload;
  return v_payload;
end;
$$;

create or replace function public.execute_privacy_request(
  p_request_id uuid,
  p_idempotency_key uuid,
  p_correction jsonb default null,
  p_export_expires_at timestamptz default null
)
returns table (
  request_state text,
  outcome_code text,
  export_artifact_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request private.privacy_requests%rowtype;
  v_actor uuid := (select auth.uid());
  v_artifact_id uuid;
  v_payload jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_counts jsonb := '{}'::jsonb;
  v_contact public.contacts%rowtype;
  v_new_email text;
  v_count integer;
begin
  if not (select private.is_privacy_owner_aal2()) then
    perform private.write_privacy_audit(
      p_request_id, 'privacy_execution', 'denied', 'owner_aal2_live_session_required'
    );
    return query select 'identity_required', 'authorization_denied', null::uuid;
    return;
  end if;
  if p_idempotency_key is null then
    raise exception 'Privacy idempotency key is required' using errcode = '22023';
  end if;

  select * into v_request from private.privacy_requests
  where id = p_request_id for update;
  if not found then
    raise exception 'Privacy request not found' using errcode = 'P0002';
  end if;
  if v_request.request_state = 'completed' then
    select id into v_artifact_id from private.privacy_export_artifacts
    where request_id = p_request_id;
    return query select 'completed', 'already_completed', v_artifact_id;
    return;
  end if;
  if exists (
    select 1 from private.privacy_request_actions a
    where a.idempotency_key = p_idempotency_key and a.request_id = p_request_id
      and a.action_code = 'request_completed'
  ) then
    select id into v_artifact_id from private.privacy_export_artifacts
    where request_id = p_request_id;
    return query select v_request.request_state, 'idempotent_replay', v_artifact_id;
    return;
  end if;
  if v_request.request_state <> 'identity_verified' then
    raise exception 'Verified privacy request is required' using errcode = '42501';
  end if;

  update private.privacy_requests set request_state = 'processing',
    processing_started_at = clock_timestamp() where id = p_request_id;

  if v_request.request_type = 'access_export' then
    if p_export_expires_at is null or p_export_expires_at <= clock_timestamp() then
      raise exception 'A future export expiry is required' using errcode = '22023';
    end if;
    v_payload := private.build_privacy_export(p_request_id);
    insert into private.privacy_export_artifacts (
      request_id, subject_contact_id, payload, payload_octets, expires_at
    ) values (
      p_request_id, v_request.subject_contact_id, v_payload,
      pg_column_size(v_payload), p_export_expires_at
    ) returning id into v_artifact_id;
    v_counts := jsonb_build_object(
      'orders', jsonb_array_length(v_payload->'orders'),
      'briefs', jsonb_array_length(v_payload->'briefs'),
      'pending_intakes', jsonb_array_length(v_payload->'pendingIntakes'),
      'checkout_intakes', jsonb_array_length(v_payload->'checkoutIntakes')
    );

  elsif v_request.request_type = 'correction' then
    if v_request.subject_contact_id is null or p_correction is null
      or jsonb_typeof(p_correction) <> 'object'
      or not exists (select 1 from jsonb_object_keys(p_correction))
      or exists (
        select 1 from jsonb_object_keys(p_correction) k
        where k <> all (array[
          'contactName', 'email', 'phone', 'accountName', 'campaignName'
        ]::text[])
      )
    then
      raise exception 'A supported nonempty correction object is required'
        using errcode = '22023';
    end if;
    select * into v_contact from public.contacts
    where id = v_request.subject_contact_id for update;
    if not found or v_contact.privacy_anonymized_at is not null then
      raise exception 'Correctable contact is unavailable' using errcode = 'P0002';
    end if;

    if p_correction ? 'email' then
      v_new_email := private.normalize_privacy_email(p_correction->>'email');
      if exists (
        select 1 from public.contacts c where c.id <> v_contact.id
          and c.privacy_anonymized_at is null
          and lower(btrim(c.email)) = v_new_email
      ) then
        raise exception 'Corrected email would conflate another contact'
          using errcode = '23505';
      end if;
      v_changed_fields := array_append(v_changed_fields, 'contact.email');
    end if;
    if p_correction ? 'contactName' then
      if char_length(btrim(p_correction->>'contactName')) not between 1 and 200 then
        raise exception 'Invalid corrected contact name' using errcode = '22023';
      end if;
      v_changed_fields := array_append(v_changed_fields, 'contact.name');
    end if;
    if p_correction ? 'phone' then
      if char_length(p_correction->>'phone') > 100 then
        raise exception 'Invalid corrected phone' using errcode = '22023';
      end if;
      v_changed_fields := array_append(v_changed_fields, 'contact.phone');
    end if;
    if p_correction ? 'accountName' then
      if char_length(btrim(p_correction->>'accountName')) not between 1 and 200
        or exists (
          select 1 from public.contacts c where c.account_id = v_contact.account_id
            and c.id <> v_contact.id and c.privacy_anonymized_at is null
        )
      then
        raise exception 'Shared or invalid account name is not correctable by this request'
          using errcode = '22023';
      end if;
      update public.accounts set name = btrim(p_correction->>'accountName'),
        updated_at = clock_timestamp() where id = v_contact.account_id;
      v_changed_fields := array_append(v_changed_fields, 'account.name');
    end if;
    if p_correction ? 'campaignName' then
      select count(distinct o.campaign_id) into v_count from public.orders o
      where o.primary_contact_id = v_contact.id;
      if v_count <> 1 or char_length(btrim(p_correction->>'campaignName')) not between 1 and 200 then
        raise exception 'A single valid subject campaign is required for campaign correction'
          using errcode = '22023';
      end if;
      update public.campaigns c set name = btrim(p_correction->>'campaignName'),
        updated_at = clock_timestamp()
      where c.id = (select (array_agg(o.campaign_id order by o.campaign_id))[1]
        from public.orders o where o.primary_contact_id = v_contact.id);
      v_changed_fields := array_append(v_changed_fields, 'campaign.name');
    end if;

    update public.contacts
    set name = case when p_correction ? 'contactName'
          then btrim(p_correction->>'contactName') else name end,
        email = coalesce(v_new_email, email),
        phone = case when p_correction ? 'phone'
          then nullif(btrim(p_correction->>'phone'), '') else phone end
    where id = v_contact.id;
    if v_new_email is not null then
      update public.briefs b set delivery_email = v_new_email,
        raw_submission_json = case when b.raw_submission_json ? 'deliveryEmail'
          then jsonb_set(b.raw_submission_json, '{deliveryEmail}', to_jsonb(v_new_email))
          else b.raw_submission_json end
      where b.order_id in (select o.id from public.orders o
        where o.primary_contact_id = v_contact.id)
        and b.privacy_anonymized_at is null;
      update public.checkout_intents c set delivery_email = v_new_email,
        brief_json = case when c.brief_json ? 'deliveryEmail'
          then jsonb_set(c.brief_json, '{deliveryEmail}', to_jsonb(v_new_email))
          else c.brief_json end,
        updated_at = clock_timestamp()
      where c.privacy_anonymized_at is null and (
        c.order_id in (select o.id from public.orders o
          where o.primary_contact_id = v_contact.id)
        or exists (select 1 from private.privacy_request_scopes s
          where s.request_id = p_request_id and s.resource_type = 'checkout_intent'
            and s.resource_id = c.id)
      );
      update public.pending_intakes p set delivery_email = v_new_email,
        brief_json = case when p.brief_json ? 'deliveryEmail'
          then jsonb_set(p.brief_json, '{deliveryEmail}', to_jsonb(v_new_email))
          else p.brief_json end,
        updated_at = clock_timestamp()
      where p.privacy_anonymized_at is null and exists (
        select 1 from private.privacy_request_scopes s
        where s.request_id = p_request_id and s.resource_type = 'pending_intake'
          and s.resource_id = p.id
      );
    end if;
    v_counts := jsonb_build_object('changed_fields', cardinality(v_changed_fields));

  elsif v_request.request_type = 'restriction' then
    if v_request.subject_contact_id is null then
      raise exception 'Contact-bound restriction requires review' using errcode = '22023';
    end if;
    update public.contacts set processing_restricted_at = clock_timestamp()
    where id = v_request.subject_contact_id and privacy_anonymized_at is null;
    if not found then
      raise exception 'Restrictable contact is unavailable' using errcode = 'P0002';
    end if;
    v_changed_fields := array['contact.processing_restricted_at'];
    v_counts := jsonb_build_object('contacts', 1);

  elsif v_request.request_type = 'deletion_anonymization' then
    if v_request.subject_contact_id is null and not exists (
      select 1 from private.privacy_request_scopes s where s.request_id = p_request_id
        and s.resource_type in ('pending_intake', 'checkout_intent')
    ) then
      raise exception 'No verified deletable subject scope' using errcode = '22023';
    end if;

    delete from public.internal_notes n
    where n.order_id in (select o.id from public.orders o
      where o.primary_contact_id = v_request.subject_contact_id);
    get diagnostics v_count = row_count;
    v_counts := jsonb_build_object('internal_notes_deleted', v_count);

    update public.engagement_work_items w
    set content_json = '{"privacyState":"anonymized"}'::jsonb,
        lock_version = lock_version + 1,
        updated_at = clock_timestamp()
    where w.order_id in (select o.id from public.orders o
      where o.primary_contact_id = v_request.subject_contact_id);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('work_items_anonymized', v_count);

    update public.briefs b
    set raw_submission_json = '{}'::jsonb,
        organization_name = null, campaign_name = null, campaign_type = null,
        date_time = null, location_or_link = null, target_audience = null,
        main_goal = null, offer_or_ask = null, key_details = null, tone = null,
        channels_needed = null, website_social_links = null,
        phrases_to_include = null, phrases_to_avoid = null,
        additional_notes = null,
        delivery_email = 'deleted+' || replace(b.id::text, '-', '') || '@privacy.invalid',
        privacy_anonymized_at = clock_timestamp()
    where b.order_id in (select o.id from public.orders o
      where o.primary_contact_id = v_request.subject_contact_id)
      and b.privacy_anonymized_at is null;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('briefs_anonymized', v_count);

    update public.checkout_intents c
    set brief_json = '{}'::jsonb,
        delivery_email = 'deleted+' || replace(c.id::text, '-', '') || '@privacy.invalid',
        status = case when c.order_id is null then 'expired' else c.status end,
        privacy_anonymized_at = clock_timestamp(), updated_at = clock_timestamp()
    where c.privacy_anonymized_at is null and (
      c.order_id in (select o.id from public.orders o
        where o.primary_contact_id = v_request.subject_contact_id)
      or exists (select 1 from private.privacy_request_scopes s
        where s.request_id = p_request_id and s.resource_type = 'checkout_intent'
          and s.resource_id = c.id)
    );
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('checkout_intakes_anonymized', v_count);

    update public.stripe_checkout_reservations r
    set reservation_state = 'released', released_at = clock_timestamp(),
        released_reason = 'privacy_subject_deleted', updated_at = clock_timestamp()
    where r.order_id is null and r.reservation_state = 'reserved'
      and exists (select 1 from private.privacy_request_scopes s
        where s.request_id = p_request_id and s.resource_type = 'checkout_intent'
          and s.resource_id = r.intent_id);

    update public.pending_intakes p
    set brief_json = '{}'::jsonb,
        delivery_email = 'deleted+' || replace(p.id::text, '-', '') || '@privacy.invalid',
        status = 'expired', privacy_anonymized_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where p.privacy_anonymized_at is null and exists (
      select 1 from private.privacy_request_scopes s
      where s.request_id = p_request_id and s.resource_type = 'pending_intake'
        and s.resource_id = p.id
    );
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('pending_intakes_anonymized', v_count);

    update public.activity_events e
    set message = 'Customer-identifying detail removed under verified privacy request.',
        metadata_json = jsonb_strip_nulls(jsonb_build_object(
          'amount_cents', e.metadata_json->'amount_cents',
          'currency', e.metadata_json->'currency',
          'from_status', e.metadata_json->'from_status',
          'to_status', e.metadata_json->'to_status',
          'privacy_redacted', true
        ))
    where e.order_id in (select o.id from public.orders o
      where o.primary_contact_id = v_request.subject_contact_id);
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('activity_events_redacted', v_count);

    update public.campaigns c
    set name = 'Anonymized campaign ' || left(replace(c.id::text, '-', ''), 12),
        primary_action = null, notes = null,
        privacy_anonymized_at = clock_timestamp(), updated_at = clock_timestamp()
    where c.privacy_anonymized_at is null
      and exists (select 1 from public.orders o
        where o.campaign_id = c.id and o.primary_contact_id = v_request.subject_contact_id)
      and not exists (select 1 from public.orders o
        where o.campaign_id = c.id
          and o.primary_contact_id is distinct from v_request.subject_contact_id);

    update public.contacts
    set name = 'Deleted customer',
        email = 'deleted+' || replace(id::text, '-', '') || '@privacy.invalid',
        role = null, phone = null, notes = null, is_primary = false,
        processing_restricted_at = coalesce(processing_restricted_at, clock_timestamp()),
        privacy_anonymized_at = clock_timestamp()
    where id = v_request.subject_contact_id and privacy_anonymized_at is null;
    get diagnostics v_count = row_count;
    v_counts := v_counts || jsonb_build_object('contacts_anonymized', v_count);

    update public.accounts a
    set name = 'Anonymized account ' || left(replace(a.id::text, '-', ''), 12),
        website = null, location = null, notes = null,
        privacy_anonymized_at = clock_timestamp(), updated_at = clock_timestamp()
    where a.id = v_request.subject_account_id and a.privacy_anonymized_at is null
      and not exists (select 1 from public.contacts c
        where c.account_id = a.id and c.privacy_anonymized_at is null);
    v_changed_fields := array[
      'contact.identifiers', 'brief.customer_content', 'checkout_intake.customer_content',
      'pending_intake.customer_content', 'work_item.customer_content',
      'activity.customer_identifiers'
    ];
  else
    raise exception 'Unsupported privacy request type' using errcode = '22023';
  end if;

  update private.privacy_requests
  set request_state = 'completed', completed_at = clock_timestamp(),
      completed_by_profile_id = v_actor where id = p_request_id;
  insert into private.privacy_request_actions (
    idempotency_key, request_id, action_code, outcome_code, actor_profile_id
  ) values (
    p_idempotency_key, p_request_id, 'request_completed',
    v_request.request_type || '_completed', v_actor
  );
  perform private.write_privacy_audit(
    p_request_id, 'privacy_execution', 'allowed',
    v_request.request_type || '_completed', v_counts, v_changed_fields
  );
  return query select 'completed', v_request.request_type || '_completed', v_artifact_id;
end;
$$;

create or replace function public.read_privacy_export(p_request_id uuid)
returns table (payload jsonb, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_artifact private.privacy_export_artifacts%rowtype;
begin
  if not (select private.is_privacy_owner_aal2()) then
    perform private.write_privacy_audit(
      p_request_id, 'export_retrieval', 'denied', 'owner_aal2_live_session_required'
    );
    return;
  end if;
  select * into v_artifact from private.privacy_export_artifacts
  where request_id = p_request_id for update;
  if not found or v_artifact.purged_at is not null
    or v_artifact.expires_at <= clock_timestamp()
  then
    perform private.write_privacy_audit(
      p_request_id, 'export_retrieval', 'denied', 'artifact_missing_or_expired'
    );
    return;
  end if;
  update private.privacy_export_artifacts set last_retrieved_at = clock_timestamp()
  where id = v_artifact.id;
  perform private.write_privacy_audit(
    p_request_id, 'export_retrieval', 'allowed', 'artifact_retrieved'
  );
  return query select v_artifact.payload, v_artifact.expires_at;
end;
$$;

create or replace function private.find_retention_candidates(
  p_as_of timestamptz
)
returns table (
  candidate_type text,
  resource_id uuid,
  action_code text,
  policy_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'export_artifact', e.id, 'hard_delete', 'explicit_export_expiry'
  from private.privacy_export_artifacts e
  where e.purged_at is null and e.expires_at <= p_as_of
  union all
  select 'pending_intake', p.id, rp.action_code, rp.policy_key
  from private.retention_policies rp
  join public.pending_intakes p
    on rp.policy_key = 'pending_intake_content'
   and rp.active and rp.approval_state = 'approved'
   and rp.retention_interval is not null
   and p.status in ('declined', 'expired')
   and p.privacy_anonymized_at is null
   and p.updated_at <= p_as_of - rp.retention_interval
  union all
  select 'checkout_intent', c.id, rp.action_code, rp.policy_key
  from private.retention_policies rp
  join public.checkout_intents c
    on rp.policy_key = 'abandoned_checkout_content'
   and rp.active and rp.approval_state = 'approved'
   and rp.retention_interval is not null
   and c.status = 'expired' and c.order_id is null
   and c.privacy_anonymized_at is null
   and c.updated_at <= p_as_of - rp.retention_interval
  order by 1, 2;
$$;

create or replace function private.apply_retention_action(
  p_candidate_type text,
  p_resource_id uuid,
  p_as_of timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_as_of is null or p_resource_id is null then
    raise exception 'Retention candidate and test clock are required'
      using errcode = '22023';
  end if;
  if p_candidate_type = 'export_artifact' then
    update private.privacy_export_artifacts
    set payload = null, purged_at = clock_timestamp()
    where id = p_resource_id and purged_at is null and expires_at <= p_as_of;
    return case when found then 'purged' else 'not_eligible' end;
  elsif p_candidate_type = 'pending_intake' and exists (
    select 1 from private.find_retention_candidates(p_as_of) c
    where c.candidate_type = p_candidate_type and c.resource_id = p_resource_id
  ) then
    update public.pending_intakes
    set brief_json = '{}'::jsonb,
        delivery_email = 'deleted+' || replace(id::text, '-', '') || '@privacy.invalid',
        status = 'expired', privacy_anonymized_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_resource_id and privacy_anonymized_at is null;
    return case when found then 'anonymized' else 'not_eligible' end;
  elsif p_candidate_type = 'checkout_intent' and exists (
    select 1 from private.find_retention_candidates(p_as_of) c
    where c.candidate_type = p_candidate_type and c.resource_id = p_resource_id
  ) then
    update public.checkout_intents
    set brief_json = '{}'::jsonb,
        delivery_email = 'deleted+' || replace(id::text, '-', '') || '@privacy.invalid',
        status = 'expired', privacy_anonymized_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_resource_id and privacy_anonymized_at is null and order_id is null;
    return case when found then 'anonymized' else 'not_eligible' end;
  end if;
  return 'not_eligible';
end;
$$;

comment on function private.find_retention_candidates(timestamptz) is
  'Deterministic test-clock candidate discovery. Approval-dependent policies are inert until separately approved and configured.';
comment on function private.apply_retention_action(text, uuid, timestamptz) is
  'Rechecks candidate eligibility at action time; export expiry is explicit and legal-duration policies remain inactive by default.';

revoke all on function private.normalize_privacy_email(text),
  private.intake_payload_is_allowed(jsonb, boolean),
  private.enforce_customer_intake_governance(),
  private.reject_restricted_subject_intake(),
  private.is_privacy_owner_aal2(),
  private.write_privacy_audit(uuid, text, text, text, jsonb, text[]),
  private.build_privacy_export(uuid),
  private.find_retention_candidates(timestamptz),
  private.apply_retention_action(text, uuid, timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.create_privacy_request(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_privacy_request(text, text) to service_role;
revoke all on function public.verify_privacy_request(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.verify_privacy_request(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.execute_privacy_request(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.execute_privacy_request(uuid, uuid, jsonb, timestamptz)
  to authenticated;
revoke all on function public.read_privacy_export(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_privacy_export(uuid) to authenticated;

commit;
