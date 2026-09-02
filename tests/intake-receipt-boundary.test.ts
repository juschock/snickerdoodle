import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

describe('durable intake and payment receipt boundary', () => {
  it('does not show client-only receipt state or use mailto as submission', () => {
    const form = source('components/brief-form.tsx');

    expect(form).toContain("fetch(`${PUBLIC_PREFIX}/api/checkout`");
    expect(form).toContain('if (!response.ok) throw new Error');
    expect(form).toContain('globalThis.location.assign(result.url)');
    expect(form).not.toContain('mailto:');
    expect(form).not.toMatch(/setSubmitted|submitted\s*=\s*true/);
    expect(form.indexOf('if (!response.ok)')).toBeLessThan(
      form.indexOf('globalThis.location.assign(result.url)')
    );
  });

  it('persists validated intake before Stripe and never treats redirect as payment truth', () => {
    const checkout = source('app/api/checkout/route.ts');
    const webhook = source('app/api/stripe/webhook/route.ts');

    expect(checkout.indexOf("from('checkout_intents').insert"))
      .toBeLessThan(checkout.indexOf('checkout.sessions.create'));
    expect(checkout.indexOf("supabase.rpc('bind_stripe_checkout_capacity'"))
      .toBeLessThan(checkout.indexOf('return noStoreJson({ url: session.url })'));
    expect(webhook.indexOf('constructEvent'))
      .toBeLessThan(webhook.indexOf("supabase.rpc('finalize_stripe_checkout'"));
  });

  it('keeps the operational queue metadata-only and owner-session scoped', () => {
    const migration = source(
      'supabase/migrations/20260830191310_add_privacy_safe_intake_manager_queue.sql'
    );

    const queueTable = migration.slice(
      migration.indexOf('create table private.intake_manager_queue'),
      migration.indexOf('comment on table private.intake_manager_queue')
    );
    expect(queueTable).not.toContain('brief_json');
    expect(queueTable).not.toContain('delivery_email');
    expect(queueTable).not.toContain('stripe');
    expect(migration).toContain('if not (select private.is_owner())');
    expect(migration).toContain('private.intake_manager_queue_access_receipts');
    expect(migration).toContain('from public, anon, authenticated, service_role');
  });

  it('exposes queue metadata only through a bearer-authenticated owner RPC', () => {
    const route = source('app/api/manager/queue/route.ts');
    const client = source('lib/supabase-manager.ts');

    expect(route).toContain("request.headers.get('authorization')");
    expect(route).toContain("rpc('read_intake_manager_queue'");
    expect(route).toContain('verifySupabaseOwnerAal2');
    expect(route).toContain("'Cache-Control': 'no-store'");
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(client).toContain('SUPABASE_ANON_KEY');
    expect(client).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('provides normal password+TOTP AAL2 owner auth without raw-token or persistent browser storage', () => {
    const page = source('app/manager/queue/page.tsx');
    const queue = source('components/manager-queue.tsx');
    const successor = source(
      'supabase/migrations/20260830202804_harden_checkout_reconciliation_and_owner_aal2.sql'
    );

    expect(page).toContain("robots: { index: false, follow: false, nocache: true }");
    expect(queue).toContain("signInWithPassword");
    expect(queue).toContain('challengeAndVerify');
    expect(queue).toContain('getAuthenticatorAssuranceLevel');
    expect(queue).toContain("'/snickerdoodle/api/manager/queue'");
    expect(queue).toContain('beforeUpdatedAt=');
    expect(queue).toContain('Load older queue items');
    expect(queue).toContain("headers: { Authorization: `Bearer ${session.access_token}` }");
    expect(queue).toContain('type="password"');
    expect(queue).not.toMatch(/Current owner session token|setToken\(|token\s*input/i);
    expect(queue).not.toMatch(/localStorage|sessionStorage|document\.cookie|SUPABASE_SERVICE_ROLE_KEY/);
    expect(successor).toContain('private.is_owner_aal2()');
    expect(successor).toContain("->> 'aal', '') = 'aal2'");
    expect(successor).toContain('create or replace function public.read_owner_paid_brief');
    expect(successor).toContain('private.owner_paid_brief_access_receipts');
  });
});
