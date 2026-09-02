'use client';

import { type FormEvent, useMemo, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { createSupabaseOwnerAuthClient } from '@/lib/supabase-manager';

type QueueReceipt = {
  queue_receipt_id: string;
  intake_kind: string;
  intake_id: string;
  queue_state: string;
  payment_state: string;
  order_id: string | null;
  terms_version: string | null;
  reconciliation_status: string;
  latest_alert_code: string | null;
  created_at: string;
  updated_at: string;
};

type PaidIntake = {
  checkout_intent_id: string;
  order_id: string;
  order_status: string;
  payment_status: string;
  terms_version: string;
  delivery_email: string;
  brief_json: Record<string, unknown>;
  assignments: unknown[];
  reconciliation_status: string;
  reconciliation_alerts: unknown[];
};

type QueueCursor = {
  updated_at: string;
  queue_receipt_id: string;
};

type AuthStep = 'password' | 'mfa' | 'ready';

function isQueueReceipt(value: unknown): value is QueueReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  const requiredStrings = [
    'queue_receipt_id', 'intake_kind', 'intake_id', 'queue_state', 'payment_state',
    'reconciliation_status', 'created_at', 'updated_at'
  ].every((key) => typeof receipt[key] === 'string');
  const nullableStrings = ['order_id', 'terms_version', 'latest_alert_code']
    .every((key) => receipt[key] === null || typeof receipt[key] === 'string');
  return requiredStrings && nullableStrings;
}

function isPaidIntake(value: unknown): value is PaidIntake {
  if (!value || typeof value !== 'object') return false;
  const intake = value as Record<string, unknown>;
  return [
    'checkout_intent_id', 'order_id', 'order_status', 'payment_status',
    'terms_version', 'delivery_email', 'reconciliation_status'
  ].every((key) => typeof intake[key] === 'string') &&
    Boolean(intake.brief_json && typeof intake.brief_json === 'object') &&
    Array.isArray(intake.assignments) && Array.isArray(intake.reconciliation_alerts);
}

async function currentSession(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('Owner session is unavailable.');
  return data.session;
}

export function ManagerQueue({
  supabaseUrl,
  supabaseAnonKey
}: {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}) {
  const authClient = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) return null;
    try {
      return createSupabaseOwnerAuthClient(supabaseUrl, supabaseAnonKey);
    } catch {
      return null;
    }
  }, [supabaseUrl, supabaseAnonKey]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('password');
  const [receipts, setReceipts] = useState<QueueReceipt[]>([]);
  const [selectedIntake, setSelectedIntake] = useState<PaidIntake | null>(null);
  const [nextCursor, setNextCursor] = useState<QueueCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function acceptAal2Session(nextSession: Session) {
    const assurance = await authClient!.auth.mfa.getAuthenticatorAssuranceLevel(nextSession.access_token);
    if (assurance.error || assurance.data.currentLevel !== 'aal2') {
      throw new Error('A verified second factor is required.');
    }
    setSession(nextSession);
    setAuthStep('ready');
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient) return;
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
      setPassword('');
      if (signInError || !data.session) throw new Error('Owner sign-in was rejected.');

      const assurance = await authClient.auth.mfa.getAuthenticatorAssuranceLevel(data.session.access_token);
      if (assurance.error) throw new Error('Could not verify authentication assurance.');
      if (assurance.data.currentLevel === 'aal2') {
        await acceptAal2Session(data.session);
        return;
      }

      const factors = await authClient.auth.mfa.listFactors();
      const verifiedTotp = factors.data?.totp.find((factor) => factor.status === 'verified');
      if (factors.error || !verifiedTotp) {
        await authClient.auth.signOut({ scope: 'local' });
        throw new Error('This owner account must enroll a verified TOTP factor before queue access.');
      }
      setFactorId(verifiedTotp.id);
      setAuthStep('mfa');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Owner sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authClient || !factorId) return;
    setError(null);
    setLoading(true);
    try {
      const verification = await authClient.auth.mfa.challengeAndVerify({ factorId, code: totpCode });
      setTotpCode('');
      if (verification.error) throw new Error('Second-factor verification was rejected.');
      await acceptAal2Session(await currentSession(authClient));
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Second-factor verification failed.');
    } finally {
      setLoading(false);
    }
  }

  async function authorizedGet(path: string) {
    if (!session) throw new Error('A current AAL2 owner session is required.');
    const response = await fetch(path, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? 'The owner session expired or no longer satisfies AAL2. Sign in again.'
        : 'The manager workspace is temporarily unavailable.');
    }
    return payload;
  }

  async function loadQueue(loadOlder = false) {
    setError(null);
    if (!loadOlder) setLoaded(false);
    setLoading(true);
    try {
      const path = loadOlder && nextCursor
        ? `/snickerdoodle/api/manager/queue?beforeUpdatedAt=${encodeURIComponent(nextCursor.updated_at)}&beforeReceiptId=${encodeURIComponent(nextCursor.queue_receipt_id)}`
        : '/snickerdoodle/api/manager/queue';
      const payload = await authorizedGet(path);
      const candidateReceipts = (payload as { receipts?: unknown }).receipts;
      if (!Array.isArray(candidateReceipts) || !candidateReceipts.every(isQueueReceipt)) {
        throw new Error('The manager queue returned an invalid response.');
      }
      const candidateCursor = (payload as { next_cursor?: unknown }).next_cursor;
      if (
        candidateCursor !== null && candidateCursor !== undefined &&
        (!candidateCursor || typeof candidateCursor !== 'object' ||
          typeof (candidateCursor as Record<string, unknown>).updated_at !== 'string' ||
          typeof (candidateCursor as Record<string, unknown>).queue_receipt_id !== 'string')
      ) throw new Error('The manager queue returned an invalid cursor.');
      setReceipts((current) => loadOlder
        ? [...current, ...candidateReceipts.filter((receipt) =>
            !current.some((item) => item.queue_receipt_id === receipt.queue_receipt_id))]
        : candidateReceipts);
      setNextCursor((candidateCursor ?? null) as QueueCursor | null);
      setSelectedIntake(null);
      setLoaded(true);
    } catch (queueError) {
      setReceipts([]);
      setNextCursor(null);
      setError(queueError instanceof Error ? queueError.message : 'The manager queue is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPaidIntake(intentId: string) {
    setError(null);
    setLoading(true);
    try {
      const payload = await authorizedGet(`/snickerdoodle/api/manager/intakes/${encodeURIComponent(intentId)}`);
      const intake = (payload as { intake?: unknown }).intake;
      if (!isPaidIntake(intake)) throw new Error('The paid intake returned an invalid response.');
      setSelectedIntake(intake);
    } catch (intakeError) {
      setSelectedIntake(null);
      setError(intakeError instanceof Error ? intakeError.message : 'The paid intake is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    if (authClient) await authClient.auth.signOut({ scope: 'local' });
    setSession(null);
    setFactorId(null);
    setReceipts([]);
    setNextCursor(null);
    setSelectedIntake(null);
    setLoaded(false);
    setAuthStep('password');
  }

  return (
    <section aria-labelledby="manager-queue-heading" className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Restricted owner workspace</p>
        <h1 id="manager-queue-heading" className="mt-2 font-heading text-3xl font-semibold text-foreground">
          Intake, assignment, and payment operations
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Sign in through Supabase Auth and complete a verified second factor. Access is limited to an active owner
          with a live AAL2 session. Passwords, TOTP codes, and session tokens are held in memory only and are never
          written to browser storage, cookies, URLs, logs, or customer records.
        </p>
      </div>

      {!authClient ? (
        <p role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Owner authentication is not configured for this deployment.
        </p>
      ) : null}

      {authClient && authStep === 'password' ? (
        <form className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={signIn}>
          <label className="text-sm font-medium text-foreground">
            Owner email
            <input type="email" autoComplete="username" required maxLength={320} value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Password
            <input type="password" autoComplete="current-password" required minLength={8} maxLength={1024}
              value={password} onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
          </label>
          <Button type="submit" size="lg" disabled={loading} className="sm:col-span-2 sm:w-fit">
            {loading ? 'Signing in…' : 'Continue securely'}
          </Button>
        </form>
      ) : null}

      {authClient && authStep === 'mfa' ? (
        <form className="mt-8 max-w-sm" onSubmit={verifyMfa}>
          <label className="text-sm font-medium text-foreground">
            Authenticator code
            <input type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}"
              minLength={6} maxLength={6} value={totpCode}
              onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
          </label>
          <Button type="submit" size="lg" disabled={loading || totpCode.length !== 6} className="mt-4">
            {loading ? 'Verifying…' : 'Verify second factor'}
          </Button>
        </form>
      ) : null}

      {authClient && authStep === 'ready' ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" size="lg" disabled={loading} onClick={() => loadQueue(false)}>
            {loading ? 'Loading…' : 'Load secure queue'}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      ) : null}

      <div className="mt-6" aria-live="polite">
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
        {loaded && receipts.length === 0 ? <p className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">No intake receipts are waiting in the queue.</p> : null}
      </div>

      {receipts.length > 0 ? (
        <div className="mt-6">
          <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <caption className="sr-only">Owner intake, assignment, payment, and reconciliation queue</caption>
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">Kind</th><th className="px-4 py-3">Queue</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Reconciliation</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receipts.map((receipt) => (
                <tr key={receipt.queue_receipt_id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(receipt.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{receipt.intake_kind}</td><td className="px-4 py-3">{receipt.queue_state}</td><td className="px-4 py-3">{receipt.payment_state}</td>
                  <td className="px-4 py-3">{receipt.reconciliation_status}{receipt.latest_alert_code ? <span className="block font-mono text-xs">{receipt.latest_alert_code}</span> : null}</td>
                  <td className="px-4 py-3 font-mono text-xs">{receipt.order_id ?? '—'}</td><td className="px-4 py-3">{receipt.terms_version ?? '—'}</td>
                  <td className="px-4 py-3">{receipt.payment_state === 'paid' ? <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => loadPaidIntake(receipt.intake_id)}>Open paid brief</Button> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {nextCursor ? <Button type="button" size="sm" variant="outline" disabled={loading}
            className="mt-4" onClick={() => loadQueue(true)}>
            {loading ? 'Loading…' : 'Load older queue items'}
          </Button> : null}
        </div>
      ) : null}

      {selectedIntake ? (
        <section aria-labelledby="paid-intake-heading" className="mt-8 rounded-xl border border-border bg-secondary/20 p-5">
          <h2 id="paid-intake-heading" className="font-heading text-xl font-semibold">Paid brief and fulfillment state</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-medium">Delivery email</dt><dd>{selectedIntake.delivery_email}</dd></div>
            <div><dt className="font-medium">Order/payment</dt><dd>{selectedIntake.order_status} / {selectedIntake.payment_status}</dd></div>
            <div><dt className="font-medium">Terms version</dt><dd>{selectedIntake.terms_version}</dd></div>
            <div><dt className="font-medium">Reconciliation</dt><dd>{selectedIntake.reconciliation_status}</dd></div>
          </dl>
          <h3 className="mt-6 font-semibold">Customer brief</h3><pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-background p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selectedIntake.brief_json, null, 2)}</pre>
          <h3 className="mt-6 font-semibold">Assignments</h3><pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-background p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selectedIntake.assignments, null, 2)}</pre>
          <h3 className="mt-6 font-semibold">Reconciliation alerts</h3><pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-background p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selectedIntake.reconciliation_alerts, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
}
