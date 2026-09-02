import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDir = join(process.cwd(), 'supabase', 'migrations');

function readMigration(filename: string) {
  return readFileSync(join(migrationDir, filename), 'utf8');
}

function sha256(filename: string) {
  return createHash('sha256').update(readMigration(filename)).digest('hex');
}

function functionDefinitionBlock(source: string, signature: string) {
  const startMarker = `create or replace function ${signature}`;
  const functionName = signature.slice(0, signature.indexOf('('));
  const endMarker = `\nrevoke all on function ${functionName}(uuid)`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('migration package integrity', () => {
  it('creates every table referenced by the first recorded migration in an earlier foundational migration', () => {
    const foundation = readMigration('20260714000000_foundational_schema.sql');
    const staff = readMigration('20260714202709_staff_authorization.sql');
    const requiredTables = [
      'profiles',
      'accounts',
      'contacts',
      'campaigns',
      'orders',
      'briefs',
      'internal_notes',
      'activity_events'
    ];

    expect(sha256('20260714000000_foundational_schema.sql')).toBe('19e037c57a7ef92d18b7f6f4870dcc00cf4c84f11708cc2e64139dcab63a20f3');
    for (const index of [
      'idx_contacts_account',
      'idx_campaigns_account',
      'idx_orders_account',
      'idx_orders_campaign',
      'idx_orders_status'
    ]) {
      expect(foundation).toContain(`create index if not exists ${index}`);
    }
    expect(foundation).toContain(
      'create index if not exists idx_activity_order on public.activity_events (order_id, created_at desc);'
    );
    for (const table of requiredTables) {
      expect(foundation).toContain(`create table if not exists public.${table}`);
      expect(foundation).toContain(`alter table public.${table} enable row level security`);
      expect(staff).toContain(`public.${table}`);
    }
  });

  it('keeps the four unredacted historical migrations byte-matched to the remote ledger', () => {
    expect(sha256('20260714203158_add_foreign_key_indexes.sql')).toBe('34cc65628c044d3d23a539e6c6a77c637767997adcb28847f5fa1c3bb9883cc6');
    expect(sha256('20260714212250_stripe_checkout_orders.sql')).toBe('2d92cf603c7be7320f3fd92e78bd2f563b35be9b9ab819cb1d5973424cc2801b');
    expect(sha256('20260716020843_harden_public_grants.sql')).toBe('57fd8240aeb1e78e96e973efab05438025ba0ab8a274869c75bda5e8ea84c04c');
    expect(sha256('20260716041133_payment_operations_security.sql')).toBe('253603cd70db7f9c7949fa1065360ec4cdc5626f5630a0c1b9587a0f0b08e374');
  });

  it('publishes an identity-neutral staff replay instead of a personal bootstrap address', () => {
    const migration = readMigration('20260714202709_staff_authorization.sql');

    expect(sha256('20260714202709_staff_authorization.sql')).toBe('7ebcf2c69b4c76faf8754d4e93ab32f9a61a22a1d8d28736262c4972e3a37fee');
    expect(migration).toContain("current_setting('app.settings.snickerdoodle_bootstrap_owner_email', true)");
    expect(migration).not.toMatch(/[A-Za-z0-9._%+-]+@gmail\.com/i);
  });

  it('pins the pending owner-serialization migration', () => {
    const migration = readMigration('20260829000000_serialize_owner_protection.sql');

    expect(sha256('20260829000000_serialize_owner_protection.sql')).toBe('975ba25c73efe71d3544029b41fc666943528866f165de6a4a7bdfec299a8bd2');
    expect(migration).toContain("lock table public.profiles in share row exclusive mode");
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain('before update or delete');
    expect(migration).toContain('for each statement execute function private.serialize_profile_owner_changes()');
    expect(migration).toContain('create or replace trigger protect_profile_access');
    expect(migration).not.toContain('drop trigger');
    expect(migration).toContain("current_setting('transaction_isolation') <> 'read committed'");
    expect(migration).toContain('pg_try_advisory_xact_lock');
    expect(migration).toContain("if tg_op = 'DELETE'");
  });

  it('pins the reviewed assignment-scoped non-payment migration', () => {
    const migration = readMigration('20260829081456_assignment_scoped_access.sql');
    const ownerPrecheck = migration.indexOf("if not exists (\n    select 1\n    from public.profiles p");
    const profileLock = migration.indexOf('pg_try_advisory_xact_lock(839534759014468561::bigint)');
    const lockedOwnerRecheck = migration.indexOf('for share of p;', profileLock);

    expect(sha256('20260829081456_assignment_scoped_access.sql')).toBe(
      '8c12c5413d103b0d55fc2a324fcc19d0f9152f270e809fb70d6eec7babe2953f'
    );
    expect(migration).toContain('create table public.engagement_assignments');
    expect(migration).toContain("assignment_role in ('service_lead', 'assigned_reviewer')");
    expect(migration).toContain('create table private.engagement_access_audit_receipts');
    expect(migration).toContain('create or replace function private.has_live_auth_session()');
    expect(migration).toContain('from auth.sessions s');
    expect(migration).toContain('for share of s nowait');
    expect(migration).toContain("current_setting('transaction_isolation') <> 'read committed'");
    expect(ownerPrecheck).toBeGreaterThan(0);
    expect(profileLock).toBeGreaterThan(ownerPrecheck);
    expect(lockedOwnerRecheck).toBeGreaterThan(profileLock);
    expect(migration).toContain('create or replace function public.manage_engagement_assignment(');
    expect(migration).toContain('create or replace function public.read_engagement_workspace(');
    expect(migration).toContain('create or replace function public.read_service_lead_engagement(');
    expect(migration).toContain('create or replace function public.write_engagement_work_item(');
    expect(migration).toContain('from public, anon, service_role;');
    expect(migration).toContain('select cron.alter_job(job_id := j.jobid, active := false)');
    expect(migration).toContain('revoke all privileges on table public.checkout_intents');
    expect(migration).not.toContain('create extension if not exists stripe');
  });

  it('pins the candidate engagement-graph integrity successor and its synthetic harness', () => {
    const migration = readMigration('20260829123000_engagement_graph_integrity.sql');
    const predecessor = readMigration('20260829081456_assignment_scoped_access.sql');
    const acceptance = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'engagement-graph-integrity-acceptance.sql'),
      'utf8'
    );
    const preflight = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'engagement-graph-integrity-preflight.sh'),
      'utf8'
    );
    const inventory = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'engagement-graph-inventory.sql'),
      'utf8'
    );
    const recovery = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'engagement-graph-integrity-recovery.sh'),
      'utf8'
    );

    expect(sha256('20260829123000_engagement_graph_integrity.sql')).toBe(
      'dbd1074748d25d36ab4ce9641c2c5e4d783a089f6138ca3b52aadfc453dcaae8'
    );
    expect(createHash('sha256').update(acceptance).digest('hex')).toBe(
      '0c72bef44cff6de34f42fd4e717a812afb137d55b2015754bd13052472d2660a'
    );
    expect(createHash('sha256').update(preflight).digest('hex')).toBe(
      '63cfe55bdd89e1e879e648ceefb7e703f8d7029e7efbbb881ce19b6e0846f860'
    );
    expect(createHash('sha256').update(inventory).digest('hex')).toBe(
      '131c474108d0a257a8b541dda4b40cb411c5054e4b549987c3a7d0b058c8dafe'
    );
    expect(createHash('sha256').update(recovery).digest('hex')).toBe(
      '0a4df948ae6987c86dc495bb263ea871cad88ed4ea8f19600fcfc9bda675db3a'
    );
    expect(migration).toContain(
      'lock table public.accounts, public.contacts, public.campaigns, public.orders'
    );
    expect(migration).toContain('add constraint orders_campaign_account_fkey');
    expect(migration).toContain('add constraint orders_primary_contact_account_fkey');
    expect(migration).toContain('drop constraint orders_campaign_id_fkey');
    expect(migration).toContain('drop constraint orders_primary_contact_id_fkey');
    expect(migration).toContain("con.confrelid = 'public.campaigns'::regclass");
    expect(migration).toContain("con.confrelid = 'public.contacts'::regclass");
    expect(migration).toContain("and con.confdeltype = 'c'");
    expect(migration).toContain("and con.confdeltype = 'n'");
    expect(migration).toContain("and con.confupdtype = 'a'");
    expect(migration).toContain("and con.confmatchtype = 's'");
    expect(migration).toContain('on delete cascade\n  not valid;');
    expect(migration).toContain('on delete set null (primary_contact_id)\n  not valid;');
    expect(migration).toContain('and c.account_id = o.account_id');
    expect(migration).toContain('and ct.account_id = o.account_id');
    const predecessorFunction = functionDefinitionBlock(
      predecessor,
      'public.read_service_lead_engagement(p_order_id uuid)'
    );
    const successorFunction = functionDefinitionBlock(
      migration,
      'public.read_service_lead_engagement(p_order_id uuid)'
    )
      .replace(
        '  join public.campaigns c\n    on c.id = o.campaign_id\n   and c.account_id = o.account_id',
        '  join public.campaigns c on c.id = o.campaign_id'
      )
      .replace(
        '  left join public.contacts ct\n    on ct.id = o.primary_contact_id\n   and ct.account_id = o.account_id',
        '  left join public.contacts ct on ct.id = o.primary_contact_id'
      );
    expect(successorFunction).toBe(predecessorFunction);
    expect(acceptance).toContain('cross-account campaign mutation unexpectedly succeeded');
    expect(acceptance).toContain('cross-account contact mutation unexpectedly succeeded');
    expect(acceptance).toContain('contact deletion nulls only primary_contact_id');
    expect(acceptance).toContain('campaign deletion cascades dependents, nulls retained references');
    expect(acceptance).toContain('account deletion cascades its graph, nulls retained references');
    expect(acceptance).toContain('evt_synthetic_graph_delete');
    expect(acceptance).toContain('target deletion graph has positive brief, assignment, work-item and audit edges');
    expect(acceptance).toContain('direct assignment-history delete unexpectedly succeeded');
    expect(acceptance).toContain('evt_synthetic_unaffected_tenant');
    expect(acceptance).toContain('public.engagement_work_items');
    expect(acceptance).toContain('rollback leaves no persistent audit receipt');
    expect(acceptance).toContain('direct application-role graph access remains denied');
    expect(preflight).toContain('Dirty-data client transaction did not roll back to the exact fixture');
    expect(preflight).toContain('Lock-timeout client transaction did not restore the exact fixture inventory');
    expect(preflight).toContain('expected_connection_identity');
    expect(preflight).toContain('\\watch 60');
    expect(preflight).toContain('pg_terminate_backend(pid)');
    expect(preflight).toContain('holder_backend_pid');
    expect(preflight).toContain('ERROR:  23514:');
    expect(preflight).toContain('ERROR:  55P03:');
    expect(preflight).toContain('ENGAGEMENT_GRAPH_PREFLIGHT_PASS');
    expect(inventory).toContain('pg_temp.sorted_acl');
    expect(inventory).toContain("when p_acl is null then '<NULL>'");
    expect(inventory).toContain("select 'default_acl'");
    expect(inventory).toContain("select 'domain_constraint'");
    expect(inventory).toContain("select 'type'");
    expect(inventory).toContain("select 'view'");
    expect(inventory).toContain("select 'range'");
    expect(inventory).toContain('i.indisclustered');
    expect(inventory).toContain('c.relreplident');
    expect(inventory).toContain('successor_schema_hash');
    expect(inventory).toContain('order by object_type, object_name, definition');
    expect(inventory).toContain('sequence_hash');
    expect(inventory).toContain("'isCalled', state.is_called");
    expect(inventory).toContain('non_audit_sequence_hash');
    expect(recovery).toContain('Source and restore authorities must be distinct');
    expect(recovery).toContain('reviewed whole-database fresh baseline');
    expect(recovery).toContain('expected_source_schema_hash');
    expect(recovery).toContain('on_auth_user_created');
    expect(recovery).toContain('allow_connections false');
    expect(recovery).toContain('Target changed between baseline and exclusive restore gate');
    expect(recovery).toContain('Out-of-scope managed/Auth target state or connection exclusivity changed');
    expect(recovery).toContain('--table=auth.users');
    expect(recovery).toContain('--schema=private');
    expect(recovery).toContain("printf '%s\\n' 'begin;' >&3");
    expect(recovery).toContain("printf '%s\\n' 'commit;' >&3");
    expect(recovery).toContain('SNICKERDOODLE_RESTORE_TRANSACTION_PASS');
    expect(recovery).toContain(
      'Restored content/owner/ACL/RLS/policy/trigger/index/sequence/type/view inventory differs'
    );
    expect(recovery).toContain('postflight_sequence_delta=4');
    expect(recovery).toContain('ENGAGEMENT_GRAPH_RECOVERY_PASS');
  });

  it('pins the assignment-history cascade repair without weakening direct deletion protection', () => {
    const migration = readMigration('20260830154048_allow_assignment_history_cascade.sql');

    expect(sha256('20260830154048_allow_assignment_history_cascade.sql')).toBe(
      '480373c732b2afcb5c9200990582748657b1de30f7b5a987533c79095deb1221'
    );
    expect(migration).toContain("t.tgname = 'protect_engagement_assignment'");
    expect(migration).toContain("c.confdeltype = 'c'");
    expect(migration).toContain('if pg_trigger_depth() <= 1 then');
    expect(migration).toContain("raise exception 'Assignment history is append-only'");
    expect(migration).toContain('return old;');
    expect(migration).not.toMatch(/^\s*grant\s+/im);
  });

  it('pins the restore-order-independent retained references and metadata-only manager queue', () => {
    const restoreOrder = readMigration(
      '20260830190850_make_activity_event_delete_actions_restore_order_independent.sql'
    );
    const managerQueue = readMigration(
      '20260830191310_add_privacy_safe_intake_manager_queue.sql'
    );
    const termsCustody = readMigration('20260830194934_capture_checkout_terms_version.sql');
    const managerAcceptance = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'intake-manager-queue-acceptance.sql'),
      'utf8'
    );
    const ord03Acceptance = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'ord03-acceptance.sql'),
      'utf8'
    );
    const ord03Concurrency = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'ord03-concurrency.sh'),
      'utf8'
    );

    expect(sha256(
      '20260830190850_make_activity_event_delete_actions_restore_order_independent.sql'
    )).toBe('57fdb96cd348e359d9136c75ea900ba982cf9ae231109298a88de4d90a1b0f43');
    expect(sha256('20260830191310_add_privacy_safe_intake_manager_queue.sql')).toBe(
      '60459167017df426de2fc31be151260fc695236dc0db87f34ce6448efe41ab08'
    );
    expect(createHash('sha256').update(managerAcceptance).digest('hex')).toBe(
      'a4cfa903c2e535b5eb5cd77ef8c9037db73e1094155536dc09eded5405dd902d'
    );
    expect(createHash('sha256').update(ord03Acceptance).digest('hex')).toBe(
      '476acaec8299ba4f299eeae3a3c822f7f525e6ead4e791526c121acb1aa27e8d'
    );
    expect(createHash('sha256').update(ord03Concurrency).digest('hex')).toBe(
      '0512f2eded077164725d3065254a66cc3f3a7b83b3a02a4f4f101d79f4c1b53d'
    );
    expect(restoreOrder).toContain('deferrable initially deferred');
    expect(restoreOrder).toContain('validate constraint activity_events_account_id_fkey');
    expect(restoreOrder).toContain('validate constraint activity_events_order_id_fkey');
    expect(restoreOrder).not.toMatch(/^\s*grant\s+/im);
    expect(managerQueue).toContain('create table private.intake_manager_queue');
    expect(managerQueue).toContain('Contains no brief, email, payment instrument');
    expect(managerQueue).toContain('after insert on public.checkout_intents');
    expect(managerQueue).toContain('after update of status, order_id on public.checkout_intents');
    expect(managerQueue).toContain('if not (select private.is_owner())');
    expect(managerQueue).toContain('grant execute on function public.read_intake_manager_queue(integer)');
    expect(managerQueue).not.toContain('delivery_email');
    expect(managerQueue).not.toContain('brief_json');
    expect(managerAcceptance).toContain('INTAKE_MANAGER_QUEUE_ACCEPTANCE_PASS');
    expect(managerAcceptance).toContain('no raw brief, email, Stripe payload, or customer secret');
    expect(sha256('20260830194934_capture_checkout_terms_version.sql')).toBe(
      '4b5d73e38a4552e6fa84b1d79d4cc580df68b1b9d6312d16f61872319c70f247'
    );
    expect(termsCustody).toContain("terms_version = 'historical-unversioned'");
    expect(termsCustody).toContain("or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(termsCustody).toContain('active owner with a live Auth session');
    expect(ord03Concurrency).toContain("psql -X -q \"$ORD03_DB_URL\" -v ON_ERROR_STOP=1 -At |");
  });

  it('pins the gated payment migration and disposable lifecycle harnesses', () => {
    const migration = readMigration('20260830140200_payment_launch_safety.sql');
    const acceptance = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'payment-launch-acceptance.sql'),
      'utf8'
    );
    const concurrency = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'payment-launch-concurrency.sh'),
      'utf8'
    );
    const capacityConcurrency = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'payment-capacity-concurrency.sh'),
      'utf8'
    );
    const terminalRaceConcurrency = readFileSync(
      join(process.cwd(), 'scripts', 'db', 'payment-terminal-race-concurrency.sh'),
      'utf8'
    );

    expect(sha256('20260830140200_payment_launch_safety.sql')).toBe(
      '9c6af84c015187c2435fd5c6e16068318e3a6cd2a227ce05244d06ce465a4840'
    );
    expect(createHash('sha256').update(acceptance).digest('hex')).toBe(
      '843cebd2d2db29a8e7bdf93ed6d3853c8c0ccaed001e437befe46dcd74a55877'
    );
    expect(createHash('sha256').update(concurrency).digest('hex')).toBe(
      '170d74cf681c31432a63333c41709ef5eb27751e220b33eab6464e0108023898'
    );
    expect(createHash('sha256').update(capacityConcurrency).digest('hex')).toBe(
      '5d8eccda218716303ad5becb166d5ce48f4364d0f4dcec439360ba85b5eb8412'
    );
    expect(createHash('sha256').update(terminalRaceConcurrency).digest('hex')).toBe(
      '5b868013505c7f8624ea29df01248a24c40328e316732dcc3a340061188e50be'
    );
    expect(migration).toContain('Checkout customer email does not match intent');
    expect(migration).toContain('Checkout Session does not match intent binding');
    expect(migration).toContain('Failed Checkout Session does not match intent binding');
    expect(acceptance).toContain('PAYMENT_LAUNCH_ACCEPTANCE_PASS');
    expect(acceptance).toContain('asynchronous failure closes only the bound unpaid intent');
    expect(acceptance).toContain('refund_attention_required');
    expect(acceptance).toContain('dispute_opened_attention_required');
    expect(acceptance).toContain('Checkout setup compensation preserves ambiguity');
    expect(acceptance).toContain('rollback;');
    expect(concurrency).toContain(
      'Refusing payment concurrency tests outside exact loopback PostgreSQL URL grammar'
    );
    expect(concurrency).toContain('PAYMENT_LAUNCH_CONCURRENCY_PASS');
    expect(concurrency).toContain('1|1|1|1|1|1|2|2|1');
    expect(capacityConcurrency).toContain(
      'Refusing payment capacity tests outside exact loopback PostgreSQL URL grammar'
    );
    expect(capacityConcurrency).toContain('Independent reservation race must allow both customers');
    expect(capacityConcurrency).toContain('same|true');
    expect(capacityConcurrency).toContain('PAYMENT_MULTI_CUSTOMER_CAPACITY_CONCURRENCY_PASS');
    expect(terminalRaceConcurrency).toContain(
      'Refusing payment terminal-race tests outside exact loopback PostgreSQL URL grammar'
    );
    expect(terminalRaceConcurrency).toContain('PAID_LOCK_HELD');
    expect(terminalRaceConcurrency).toContain('checkout.session.expired');
    expect(terminalRaceConcurrency).toContain('checkout.session.async_payment_failed');
    expect(terminalRaceConcurrency).toContain('checkout_expired_attention_required');
    expect(terminalRaceConcurrency).toContain('async_payment_failed_attention_required');
    expect(terminalRaceConcurrency).toContain("processing_status = 'processed'");
    expect(terminalRaceConcurrency).toContain(
      'Payment terminal-race assertion failed: PostgreSQL recorded a deadlock'
    );
    expect(terminalRaceConcurrency).toContain('PAYMENT_TERMINAL_RACE_CONCURRENCY_PASS');
  });
});
