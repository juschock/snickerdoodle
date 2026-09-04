'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { createSupabaseOwnerRecoveryClient } from '@/lib/supabase-manager';

const INVALID_RECOVERY_MESSAGE =
  'This password reset link is invalid or expired. Request a new one from the owner sign-in page.';
const UNCONFIGURED_RECOVERY_MESSAGE =
  'Owner password recovery is not configured for this deployment.';

export function OwnerPasswordRecovery({
  supabaseUrl,
  supabaseAnonKey
}: {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    !supabaseUrl || !supabaseAnonKey ? UNCONFIGURED_RECOVERY_MESSAGE : null
  );

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;

    const recoveryParams = new URLSearchParams(window.location.hash.slice(1));
    if (recoveryParams.get('type') !== 'recovery') {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      const invalidTimer = window.setTimeout(() => setError(INVALID_RECOVERY_MESSAGE), 0);
      return () => window.clearTimeout(invalidTimer);
    }

    let client: SupabaseClient;
    try {
      client = createSupabaseOwnerRecoveryClient(supabaseUrl, supabaseAnonKey);
    } catch {
      window.history.replaceState(null, '', window.location.pathname);
      const unconfiguredTimer = window.setTimeout(
        () => setError(UNCONFIGURED_RECOVERY_MESSAGE),
        0
      );
      return () => window.clearTimeout(unconfiguredTimer);
    }

    clientRef.current = client;
    let active = true;
    let recoveryAccepted = false;
    let recoveryExpired = false;
    let timeout = 0;

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((event, session) => {
      if (
        !active ||
        recoveryExpired ||
        event !== 'PASSWORD_RECOVERY' ||
        !session
      ) return;
      recoveryAccepted = true;
      window.clearTimeout(timeout);
      window.history.replaceState(null, '', window.location.pathname);
      setError(null);
      setReady(true);
    });

    timeout = window.setTimeout(() => {
      if (!active || recoveryAccepted) return;
      recoveryExpired = true;
      window.history.replaceState(null, '', window.location.pathname);
      setReady(false);
      setError(INVALID_RECOVERY_MESSAGE);
    }, 8_000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
      clientRef.current = null;
    };
  }, [supabaseUrl, supabaseAnonKey]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = clientRef.current;
    if (!client || !ready || loading) return;

    setError(null);

    if (password.length < 12 || password.length > 1024) {
      setError('Use a password between 12 and 1024 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        throw new Error('Password update was rejected. Request a new reset link and try again.');
      }

      /*
       * The recovery client never persists its session. Explicit local sign-out
       * is still attempted before a hard navigation; the navigation destroys
       * the in-memory client even if the provider sign-out request itself fails.
       */
      try {
        await client.auth.signOut({ scope: 'local' });
      } finally {
        clientRef.current = null;
        setReady(false);
        setPassword('');
        setConfirmation('');
        window.location.replace('/snickerdoodle/manager/queue');
      }
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : 'Password update was rejected. Request a new reset link and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Restricted owner recovery
      </p>
      <h1 className="mt-2 font-heading text-3xl font-semibold text-foreground">
        Choose a new owner password
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Reset links are single-use. After the password is changed, this recovery
        session is cleared and a fresh password sign-in is required.
      </p>

      {!ready && !error ? (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          Verifying reset link…
        </p>
      ) : null}

      {ready ? (
        <form className="mt-8 grid max-w-xl gap-4" onSubmit={updatePassword}>
          <label className="text-sm font-medium text-foreground">
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={1024}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={1024}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
            />
          </label>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? 'Changing password…' : 'Change password'}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
