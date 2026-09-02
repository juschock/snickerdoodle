\set ON_ERROR_STOP on

-- Read-only, deterministic selected-scope inventory for disposable recovery
-- evidence. Auth schema definitions and managed/default ACLs are intentionally
-- outside this selected application scope; only the two synthetic Auth data
-- tables needed by the fixture are included in the content fingerprint.

create or replace function pg_temp.sorted_acl(p_acl aclitem[])
returns text
language sql
stable
as $$
  select case
    when p_acl is null then '<NULL>'
    else coalesce(
      (select string_agg(item::text, ',' order by item::text)
       from unnest(p_acl) item),
      '<EMPTY>'
    )
  end;
$$;

create or replace function pg_temp.table_content(
  p_schema text,
  p_table text,
  out row_count bigint,
  out content text
)
language plpgsql
stable
as $$
begin
  execute format(
    'select count(*), coalesce(string_agg(to_jsonb(t)::text, E''\\n'' order by to_jsonb(t)::text), '''') from %I.%I t',
    p_schema,
    p_table
  ) into row_count, content;
end;
$$;

create or replace function pg_temp.sequence_state(
  p_schema text,
  p_sequence text,
  out last_value bigint,
  out is_called boolean
)
language plpgsql
stable
as $$
begin
  execute format(
    'select last_value::bigint, is_called from %I.%I',
    p_schema,
    p_sequence
  ) into last_value, is_called;
end;
$$;

with object_inventory as (
  select 'schema'::text as object_type,
    n.nspname as object_name,
    concat_ws('|', pg_get_userbyid(n.nspowner), pg_temp.sorted_acl(n.nspacl)) as definition
  from pg_namespace n
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'relation',
    format('%I.%I', n.nspname, c.relname),
    concat_ws('|', c.relkind, c.relpersistence, pg_get_userbyid(c.relowner),
      c.relrowsecurity, c.relforcerowsecurity, pg_temp.sorted_acl(c.relacl),
      c.relreplident,
      case when c.reltablespace = 0 then '<DATABASE_DEFAULT>' else ts.spcname end,
      coalesce(array_to_string(c.reloptions, ','), ''),
      coalesce(obj_description(c.oid, 'pg_class'), ''))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_tablespace ts on ts.oid = c.reltablespace
  where n.nspname in ('public', 'private', 'supabase_migrations')
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'c')

  union all

  select 'column',
    format('%I.%I.%I', n.nspname, c.relname, a.attname),
    concat_ws('|', a.attnum, pg_catalog.format_type(a.atttypid, a.atttypmod),
      a.attnotnull, a.attidentity, a.attgenerated, a.attstorage,
      coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
      pg_temp.sorted_acl(a.attacl), coalesce(col_description(c.oid, a.attnum), ''))
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname in ('public', 'private', 'supabase_migrations')
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'c')
    and a.attnum > 0
    and not a.attisdropped

  union all

  select 'constraint',
    format('%I.%I:%I', n.nspname, c.relname, con.conname),
    concat_ws('|', con.contype, con.convalidated, con.condeferrable,
      con.condeferred, pg_get_constraintdef(con.oid, true),
      coalesce(obj_description(con.oid, 'pg_constraint'), ''))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'domain_constraint',
    format('%I.%I:%I', n.nspname, t.typname, con.conname),
    concat_ws('|', con.convalidated, con.condeferrable, con.condeferred,
      pg_get_constraintdef(con.oid, true),
      coalesce(obj_description(con.oid, 'pg_constraint'), ''))
  from pg_constraint con
  join pg_type t on t.oid = con.contypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'index',
    format('%I.%I', n.nspname, c.relname),
    concat_ws('|', pg_get_userbyid(c.relowner), i.indisunique, i.indisprimary,
      i.indisvalid, i.indisready, i.indisclustered, i.indisreplident,
      case when c.reltablespace = 0 then '<DATABASE_DEFAULT>' else ts.spcname end,
      coalesce(array_to_string(c.reloptions, ','), ''),
      pg_get_indexdef(i.indexrelid))
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_tablespace ts on ts.oid = c.reltablespace
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'type',
    format('%I.%I', n.nspname, t.typname),
    concat_ws('|', t.typtype, t.typcategory, pg_get_userbyid(t.typowner),
      pg_temp.sorted_acl(t.typacl),
      case when t.typelem = 0 then '' else pg_catalog.format_type(t.typelem, null) end,
      case when t.typbasetype = 0 then '' else pg_catalog.format_type(t.typbasetype, null) end,
      t.typtypmod, t.typnotnull, coalesce(t.typdefault, ''),
      coalesce((
        select string_agg(e.enumlabel, ',' order by e.enumsortorder)
        from pg_enum e where e.enumtypid = t.oid
      ), ''), coalesce(obj_description(t.oid, 'pg_type'), ''))
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'range',
    pg_catalog.format_type(r.rngtypid, null),
    concat_ws('|',
      pg_catalog.format_type(r.rngsubtype, null),
      case when r.rngcollation = 0 then ''
        else format('%I.%I', collation_ns.nspname, collation_catalog.collname) end,
      format('%I.%I', operator_ns.nspname, operator_class.opcname),
      case when r.rngcanonical = 0 then '' else r.rngcanonical::regprocedure::text end,
      case when r.rngsubdiff = 0 then '' else r.rngsubdiff::regprocedure::text end,
      pg_catalog.format_type(r.rngmultitypid, null)
    )
  from pg_range r
  join pg_type range_type on range_type.oid = r.rngtypid
  join pg_namespace range_ns on range_ns.oid = range_type.typnamespace
  join pg_opclass operator_class on operator_class.oid = r.rngsubopc
  join pg_namespace operator_ns on operator_ns.oid = operator_class.opcnamespace
  left join pg_collation collation_catalog on collation_catalog.oid = r.rngcollation
  left join pg_namespace collation_ns on collation_ns.oid = collation_catalog.collnamespace
  where range_ns.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'view',
    format('%I.%I', n.nspname, c.relname),
    concat_ws('|', pg_get_viewdef(c.oid, true),
      coalesce(array_to_string(c.reloptions, ','), ''))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')
    and c.relkind in ('v', 'm')

  union all

  select 'sequence',
    format('%I.%I', n.nspname, c.relname),
    concat_ws('|', pg_get_userbyid(c.relowner),
      pg_catalog.format_type(s.seqtypid, null), s.seqstart, s.seqincrement,
      s.seqmax, s.seqmin, s.seqcache, s.seqcycle, pg_temp.sorted_acl(c.relacl))
  from pg_sequence s
  join pg_class c on c.oid = s.seqrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'function',
    p.oid::regprocedure::text,
    concat_ws('|', pg_get_userbyid(p.proowner), p.prosecdef,
      coalesce(array_to_string(p.proconfig, ','), ''),
      pg_temp.sorted_acl(p.proacl), pg_get_functiondef(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')

  union all

  select 'trigger',
    format('%I.%I:%I', n.nspname, c.relname, t.tgname),
    concat_ws('|', t.tgenabled, pg_get_triggerdef(t.oid, true))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc trigger_function on trigger_function.oid = t.tgfoid
  join pg_namespace function_ns on function_ns.oid = trigger_function.pronamespace
  where not t.tgisinternal
    and (
      n.nspname in ('public', 'private', 'supabase_migrations')
      or (
        n.nspname = 'auth'
        and c.relname = 'users'
        and t.tgname = 'on_auth_user_created'
        and function_ns.nspname = 'private'
      )
    )

  union all

  select 'policy',
    format('%I.%I:%I', schemaname, tablename, policyname),
    concat_ws('|', permissive, array_to_string(roles, ','), cmd,
      coalesce(qual, ''), coalesce(with_check, ''))
  from pg_policies
  where schemaname in ('public', 'private', 'supabase_migrations')

  union all

  select 'default_acl',
    format('%I:%I:%s', n.nspname, r.rolname, d.defaclobjtype),
    pg_temp.sorted_acl(d.defaclacl)
  from pg_default_acl d
  join pg_roles r on r.oid = d.defaclrole
  left join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')
), successor_object_inventory as (
  select object_type, object_name, definition
  from object_inventory
  where not (
    object_type = 'constraint'
    and object_name in (
      'public.orders:orders_campaign_id_fkey',
      'public.orders:orders_primary_contact_id_fkey',
      'public.campaigns:campaigns_id_account_id_key',
      'public.contacts:contacts_id_account_id_key',
      'public.orders:orders_campaign_account_fkey',
      'public.orders:orders_primary_contact_account_fkey'
    )
  )
  and not (
    object_type = 'index'
    and object_name in (
      'public.campaigns_id_account_id_key',
      'public.contacts_id_account_id_key'
    )
  )
  and not (
    object_type = 'function'
    and object_name = 'read_service_lead_engagement(uuid)'
  )

  union all

  select object_type, object_name,
    replace(
      replace(
        definition,
        '  join public.campaigns c on c.id = o.campaign_id',
        E'  join public.campaigns c\n    on c.id = o.campaign_id\n   and c.account_id = o.account_id'
      ),
      '  left join public.contacts ct on ct.id = o.primary_contact_id',
      E'  left join public.contacts ct\n    on ct.id = o.primary_contact_id\n   and ct.account_id = o.account_id'
    )
  from object_inventory
  where object_type = 'function'
    and object_name = 'read_service_lead_engagement(uuid)'

  union all

  values
    ('constraint', 'public.campaigns:campaigns_id_account_id_key',
      'u|t|f|f|UNIQUE (id, account_id)|'),
    ('constraint', 'public.contacts:contacts_id_account_id_key',
      'u|t|f|f|UNIQUE (id, account_id)|'),
    ('constraint', 'public.orders:orders_campaign_account_fkey',
      'f|t|f|f|FOREIGN KEY (campaign_id, account_id) REFERENCES campaigns(id, account_id) ON DELETE CASCADE|Prevents an order from referencing a campaign owned by another account.'),
    ('constraint', 'public.orders:orders_primary_contact_account_fkey',
      'f|t|f|f|FOREIGN KEY (primary_contact_id, account_id) REFERENCES contacts(id, account_id) ON DELETE SET NULL (primary_contact_id)|Prevents an order from referencing a primary contact owned by another account.'),
    ('index', 'public.campaigns_id_account_id_key',
      'postgres|t|f|t|t|f|f|<DATABASE_DEFAULT>||CREATE UNIQUE INDEX campaigns_id_account_id_key ON public.campaigns USING btree (id, account_id)'),
    ('index', 'public.contacts_id_account_id_key',
      'postgres|t|f|t|t|f|f|<DATABASE_DEFAULT>||CREATE UNIQUE INDEX contacts_id_account_id_key ON public.contacts USING btree (id, account_id)')
), table_inventory(schema_name, table_name) as (
  values ('auth', 'users'), ('auth', 'sessions')

  union all

  select n.nspname, c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private', 'supabase_migrations')
    and c.relkind in ('r', 'p', 'm')
), data_inventory as (
  select format('%I.%I', t.schema_name, t.table_name) as object_name,
    x.row_count,
    x.content
  from table_inventory t
  cross join lateral pg_temp.table_content(t.schema_name, t.table_name) x
), sequence_inventory as (
  select format('%I.%I', schemaname, sequencename) as object_name,
    jsonb_build_object(
      'lastValue', state.last_value,
      'isCalled', state.is_called,
      'startValue', start_value,
      'incrementBy', increment_by,
      'maxValue', max_value,
      'minValue', min_value,
      'cacheSize', cache_size,
      'cycle', cycle,
      'ownedBy', coalesce((
        select string_agg(
          format('%I.%I.%I:%s', owned_ns.nspname, owned_table.relname,
            owned_column.attname, dep.deptype),
          ',' order by owned_ns.nspname, owned_table.relname,
            owned_column.attname, dep.deptype
        )
        from pg_class sequence_relation
        join pg_namespace sequence_namespace
          on sequence_namespace.oid = sequence_relation.relnamespace
        join pg_depend dep
          on dep.classid = 'pg_class'::regclass
         and dep.objid = sequence_relation.oid
         and dep.refclassid = 'pg_class'::regclass
         and dep.deptype in ('a', 'i')
        join pg_class owned_table on owned_table.oid = dep.refobjid
        join pg_namespace owned_ns on owned_ns.oid = owned_table.relnamespace
        join pg_attribute owned_column
          on owned_column.attrelid = owned_table.oid
         and owned_column.attnum = dep.refobjsubid
        where sequence_namespace.nspname = schemaname
          and sequence_relation.relname = sequencename
      ), '<UNOWNED>')
    )::text as content
  from pg_sequences
  cross join lateral pg_temp.sequence_state(schemaname, sequencename) state
  where schemaname in ('public', 'private', 'supabase_migrations')
), schema_result as (
  select encode(
      digest(
        coalesce(string_agg(
          object_type || E'\\0' || object_name || E'\\0' || definition,
          E'\\n' order by object_type, object_name, definition
        ), ''),
        'sha256'
      ),
      'hex'
    ) as schema_hash,
    count(*) as object_count
  from object_inventory
), successor_schema_result as (
  select encode(
      digest(
        coalesce(string_agg(
          object_type || E'\\0' || object_name || E'\\0' || definition,
          E'\\n' order by object_type, object_name, definition
        ), ''),
        'sha256'
      ),
      'hex'
    ) as successor_schema_hash,
    count(*) as successor_object_count
  from successor_object_inventory
), data_result as (
  select encode(
      digest(
        coalesce(string_agg(
          object_name || E'\\0' || row_count::text || E'\\0' || content,
          E'\\n' order by object_name
        ), ''),
        'sha256'
      ),
      'hex'
    ) as data_hash,
    sum(row_count) as row_count
  from data_inventory
), sequence_result as (
  select encode(
      digest(
        coalesce(string_agg(
          object_name || E'\\0' || content,
          E'\\n' order by object_name
        ), ''),
        'sha256'
      ),
      'hex'
    ) as sequence_hash,
    encode(
      digest(
        coalesce(string_agg(
          object_name || E'\\0' || content,
          E'\\n' order by object_name
        ) filter (
          where object_name <> 'private.engagement_access_audit_receipts_receipt_id_seq'
        ), ''),
        'sha256'
      ),
      'hex'
    ) as non_audit_sequence_hash
  from sequence_inventory
)
select concat_ws('|', schema_hash, successor_schema_hash, data_hash,
  sequence_hash, non_audit_sequence_hash, object_count,
  successor_object_count, row_count)
from schema_result
cross join successor_schema_result
cross join data_result
cross join sequence_result;
