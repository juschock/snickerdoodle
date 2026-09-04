import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getOwnerRecoveryRedirect } from '@/components/manager-queue';

describe('owner password recovery boundary', () => {
  it('constructs only the fixed same-origin recovery destination', () => {
    expect(getOwnerRecoveryRedirect('https://racoben.com'))
      .toBe('https://racoben.com/snickerdoodle/auth/recovery');
    expect(getOwnerRecoveryRedirect('https://preview.example.invalid'))
      .toBe('https://preview.example.invalid/snickerdoodle/auth/recovery');
    expect(getOwnerRecoveryRedirect('http://127.0.0.1:3102'))
      .toBe('http://127.0.0.1:3102/snickerdoodle/auth/recovery');

    expect(() => getOwnerRecoveryRedirect('https://racoben.com/other'))
      .toThrow('Invalid recovery origin.');
    expect(() => getOwnerRecoveryRedirect('http://example.com'))
      .toThrow('Invalid recovery origin.');
    expect(() => getOwnerRecoveryRedirect('javascript:alert(1)'))
      .toThrow('Invalid recovery origin.');
  });

  it('keeps reset requests generic and rate-limit friendly', () => {
    const source = readFileSync('components/manager-queue.tsx', 'utf8');

    expect(source).toContain('resetPasswordForEmail(email.trim()');
    expect(source).toContain('getOwnerRecoveryRedirect(window.location.origin)');
    expect(source).toContain('recoveryPending');
    expect(source).toContain('recoveryRequested');
    expect(source).toContain(
      'If that address can receive a reset email, check its inbox and use the newest link.'
    );
    expect(source).toContain("setPassword('')");
    expect(source).not.toMatch(
      /user not found|account does not exist|email is not registered/i
    );
  });

  it('uses an ephemeral path-scoped recovery client only on the dedicated callback page', () => {
    const clientSource = readFileSync('lib/supabase-manager.ts', 'utf8');
    const recoverySource = readFileSync('components/owner-password-recovery.tsx', 'utf8');

    expect(clientSource).toContain('createSupabaseOwnerRecoveryClient');
    expect(clientSource).toContain('persistSession: false');
    expect(clientSource).toContain("callbackUrl.pathname === '/snickerdoodle/auth/recovery'");
    expect(clientSource).toContain("params.type === 'recovery'");
    expect(clientSource).toContain("flowType: 'implicit'");

    expect(recoverySource).toContain("event !== 'PASSWORD_RECOVERY'");
    expect(recoverySource).toContain(
      "window.history.replaceState(null, '', window.location.pathname)"
    );
    expect(recoverySource).toContain('client.auth.updateUser({ password })');
    expect(recoverySource).toContain("client.auth.signOut({ scope: 'local' })");
    expect(recoverySource).toContain(
      "window.location.replace('/snickerdoodle/manager/queue')"
    );
    expect(recoverySource).not.toMatch(
      /access_token|refresh_token|service_role|admin\.auth|console\./i
    );

    const updateIndex = recoverySource.indexOf('client.auth.updateUser({ password })');
    const signOutIndex = recoverySource.indexOf("client.auth.signOut({ scope: 'local' })");
    const redirectIndex = recoverySource.indexOf(
      "window.location.replace('/snickerdoodle/manager/queue')"
    );
    expect(updateIndex).toBeGreaterThan(-1);
    expect(signOutIndex).toBeGreaterThan(updateIndex);
    expect(redirectIndex).toBeGreaterThan(signOutIndex);
  });

  it('keeps the recovery page private and non-referring', () => {
    const pageSource = readFileSync('app/auth/recovery/page.tsx', 'utf8');
    expect(pageSource).toContain('index: false');
    expect(pageSource).toContain('follow: false');
    expect(pageSource).toContain("referrer: 'no-referrer'");
    expect(pageSource).not.toMatch(/searchParams|redirectTo|next=/);
  });
});
