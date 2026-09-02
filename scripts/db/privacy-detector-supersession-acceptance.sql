\set ON_ERROR_STOP on

-- SN08B.2 detector corpus. All values are synthetic test fixtures. The
-- provider payload and its numeric value are intentionally never copied here.

do $$
declare
  v_base jsonb := jsonb_build_object(
    'organizationType', 'Nonprofit / Community organization',
    'campaignFamily', 'Cause / Nonprofit campaign',
    'primaryAction', 'Register',
    'deliveryEmail', 'ordinary@example.invalid'
  );
  v_cases jsonb[];
  v_case jsonb;
begin
  if private.luhn_is_valid('4222222222222') is not true
    or private.luhn_is_valid('4242424242424242') is not true
    or private.luhn_is_valid('4000000000000000006') is not true
    or private.luhn_is_valid('1700000000000') is not false
  then
    raise exception 'Luhn fixture classification failed';
  end if;

  if not private.intake_payload_is_allowed(v_base, false)
    or not private.intake_payload_is_allowed(
      v_base || '{"deliveryEmail":"synthetic+1700000000000@example.invalid"}'::jsonb,
      false
    )
    or not private.intake_payload_is_allowed(
      v_base || '{"deliveryEmail":"synthetic-1700000000000@example.invalid"}'::jsonb,
      false
    )
  then
    raise exception 'Typed non-payment email false-positive fixture was rejected';
  end if;

  v_cases := array[
    v_base || '{"deliveryEmail":"synthetic+4222222222222@example.invalid"}'::jsonb,
    v_base || '{"deliveryEmail":"synthetic+4242424242424242@example.invalid"}'::jsonb,
    v_base || '{"deliveryEmail":"synthetic+4000000000000000006@example.invalid"}'::jsonb,
    v_base || '{"deliveryEmail":"synthetic+4242-4242-4242-4242@example.invalid"}'::jsonb,
    v_base || '{"additionalNotes":"Synthetic card-like 4242424242424242 text"}'::jsonb,
    v_base || '{"paymentCard":{"number":"4242424242424242"}}'::jsonb,
    v_base || '{"unexpectedField":"synthetic"}'::jsonb,
    v_base || '{"deliveryEmail":"malformed-address"}'::jsonb,
    v_base || '{"additionalNotes":"api_key=synthetic-secret-material"}'::jsonb,
    v_base || jsonb_build_object('additionalNotes', repeat('x', 70000)),
    v_base || '{"deliveryEmail":"4242424242424242@example.invalid"}'::jsonb
  ];

  foreach v_case in array v_cases loop
    if private.intake_payload_is_allowed(v_case, false) then
      raise exception 'Detector negative fixture did not fail closed';
    end if;
  end loop;

  if has_function_privilege('anon', 'private.luhn_is_valid(text)', 'execute')
    or has_function_privilege('authenticated', 'private.luhn_is_valid(text)', 'execute')
    or has_function_privilege('service_role', 'private.luhn_is_valid(text)', 'execute')
    or has_function_privilege(
      'authenticated', 'private.intake_delivery_email_is_allowed(text)', 'execute'
    )
  then
    raise exception 'Detector helper execution privilege is broader than intended';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('luhn_is_valid', 'intake_delivery_email_is_allowed')
      and not ('search_path=""' = any (p.proconfig))
  ) then
    raise exception 'Detector helper search_path is not pinned empty';
  end if;
end;
$$;

select 'SNICK_PRIVACY_DETECTOR_SUPERSESSION_ACCEPTANCE_PASS';
