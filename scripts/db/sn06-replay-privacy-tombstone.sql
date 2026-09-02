\set ON_ERROR_STOP on

-- Represents a deletion decision held in a durable, access-controlled ledger
-- newer than the restored snapshot. This fixture is synthetic; production
-- ledger custody and provider restore proof remain launch gates.
begin;
insert into auth.sessions (id, user_id, refreshed_at, not_after)
values (
  '67000000-0000-4000-8000-100000000001',
  '65000000-0000-4000-8000-000000000001',
  clock_timestamp(), clock_timestamp() + interval '1 day'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"65000000-0000-4000-8000-000000000001","session_id":"67000000-0000-4000-8000-100000000001","exp":1999999999,"role":"authenticated","aal":"aal2"}',
  false
);
set local role service_role;
select request_id as tombstone_request_id
from public.create_privacy_request(
  'deletion_anonymization', 'resurrected@sn06.example.invalid'
) \gset
reset role;
set local role authenticated;
select public.verify_privacy_request(
  :'tombstone_request_id'::uuid,
  '67200000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-200000000001'
);
select * from public.execute_privacy_request(
  :'tombstone_request_id'::uuid,
  '67000000-0000-4000-8000-300000000001', null, null
);
reset role;
commit;

do $$
begin
  if not exists (
    select 1 from public.contacts
    where id = '67200000-0000-4000-8000-000000000001'
      and email like 'deleted+%@privacy.invalid'
      and privacy_anonymized_at is not null
  ) or not exists (
    select 1 from public.briefs
    where id = '67500000-0000-4000-8000-000000000001'
      and raw_submission_json = '{}'::jsonb
      and privacy_anonymized_at is not null
  ) then
    raise exception 'SN06 privacy tombstone replay failed';
  end if;
end;
$$;

select 'SNICK_SN06_PRIVACY_TOMBSTONE_REPLAY_PASS' as result;
