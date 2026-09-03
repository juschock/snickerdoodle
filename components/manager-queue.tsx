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

type OperationsHealth = {
  status: 'healthy' | 'attention_required';
  generated_at: string;
  latest_webhook_received_at: string | null;
  latest_webhook_completed_at: string | null;
  webhook_receipts_24h: number;
  failed_webhook_receipts_24h: number;
  stuck_webhook_receipts: number;
  stale_unpaid_checkout_intents: number;
  paid_checkout_intents_without_order: number;
  paid_stripe_orders_without_intent: number;
  paid_stripe_orders_without_event: number;
  processed_stripe_events_without_paid_order: number;
  attention_reasons: string[];
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

function isOperationsHealth(value: unknown): value is OperationsHealth {
  if (!value || typeof value !== 'object') return false;
  const health = value as Record<string, unknown>;
  const counts = [
    'webhook_receipts_24h', 'failed_webhook_receipts_24h', 'stuck_webhook_receipts',
    'stale_unpaid_checkout_intents', 'paid_checkout_intents_without_order',
    'paid_stripe_orders_without_intent', 'paid_stripe_orders_without_event',
    'processed_stripe_events_without_paid_order'
  ].every((key) => Number.isSafeInteger(health[key]) && Number(health[key]) >= 0);
  const timestamps = ['latest_webhook_received_at', 'latest_webhook_completed_at']
    .every((key) => health[key] === null || (
      typeof health[key] === 'string' && Number.isFinite(Date.parse(health[key]))
    ));
  return (health.status === 'healthy' || health.status === 'attention_required') &&
    typeof health.generated_at === 'string' && Number.isFinite(Date.parse(health.generated_at)) &&
    counts && timestamps &&
    Array.isArray(health.attention_reasons) &&
    health.attention_reasons.every((reason) => typeof reason === 'string');
}

function readPrivateInviteLink(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const link = (value as { link?: unknown }).link;
  if (typeof link !== 'string' || link.length > 4096) return null;
  try {
    const url = new URL(link);
    const access = new URLSearchParams(url.hash.slice(1));
    const keys = Array.from(access.keys());
    const isLoopbackHttp = url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !isLoopbackHttp) ||
      url.username || url.password || url.pathname !== '/snickerdoodle/brief' || url.search ||
      keys.length !== 1 || keys[0] !== 'access' ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access.get('access') ?? '')
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
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
  const [operationsHealth, setOperationsHealth] = useState<OperationsHealth | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
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

  async function authorizedPost(path: string, body: Record<string, unknown>) {
    if (!session) throw new Error('A current AAL2 owner session is required.');
    const response = await fetch(path, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('The owner session expired or no longer satisfies AAL2. Sign in again.');
      }
      if (response.status === 400) throw new Error('Enter a valid delivery email.');
      throw new Error('Private invite generation is temporarily unavailable.');
    }
    return payload;
  }

  async function loadOperationsHealth() {
    setError(null);
    setLoading(true);
    try {
      const payload = await authorizedGet('/snickerdoodle/api/manager/health');
      const health = (payload as { health?: unknown }).health;
      if (!isOperationsHealth(health)) throw new Error('Payment operations returned an invalid response.');
      setOperationsHealth(health);
    } catch (healthError) {
      setOperationsHealth(null);
      setError(healthError instanceof Error ? healthError.message : 'Payment operations health is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function issuePrivateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteLink(null);
    setInviteNotice(null);
    setLoading(true);
    try {
      const payload = await authorizedPost('/snickerdoodle/api/manager/invites', { email: inviteEmail });
      const link = readPrivateInviteLink(payload);
      if (!link) throw new Error('Private invite generation returned an invalid response.');
      setInviteLink(link);
      setInviteNotice('Private link created. It expires in seven days and remains only in this page session.');
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Private invite generation is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function copyPrivateInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteNotice('Private link copied. Share it only with the intended recipient.');
    } catch {
      setError('The browser could not copy the private link. Select and copy it manually.');
    }
  }

  function openPrivateInvite() {
    if (!inviteLink) return;
    window.open(inviteLink, '_blank', 'noopener,noreferrer');
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
    setOperationsHealth(null);
    setInviteEmail('');
    setInviteLink(null);
    setInviteNotice(null);
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
        <div className="mt-8">
          <div className="flex flex-wrap gap-3">
            <Button type="button" size="lg" disabled={loading} onClick={() => loadQueue(false)}>
              {loading ? 'Loading…' : 'Load secure queue'}
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={signOut}>Sign out</Button>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="operations-health-heading" className="rounded-xl border border-border bg-secondary/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="operations-health-heading" className="font-heading text-xl font-semibold">Payment operations health</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Aggregate reconciliation and webhook counters only.</p>
                </div>
                <Button type="button" variant="outline" disabled={loading} onClick={loadOperationsHealth}>
                  Check health
                </Button>
              </div>
              {operationsHealth ? (
                <div className="mt-4">
                  <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                    {operationsHealth.status === 'healthy' ? 'Healthy' : 'Attention required'}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">Webhook receipts (24h)</dt><dd className="text-lg font-semibold">{operationsHealth.webhook_receipts_24h}</dd></div>
                    <div><dt className="text-muted-foreground">Failed receipts (24h)</dt><dd className="text-lg font-semibold">{operationsHealth.failed_webhook_receipts_24h}</dd></div>
                    <div><dt className="text-muted-foreground">Stuck receipts</dt><dd className="text-lg font-semibold">{operationsHealth.stuck_webhook_receipts}</dd></div>
                    <div><dt className="text-muted-foreground">Stale unpaid checkouts</dt><dd className="text-lg font-semibold">{operationsHealth.stale_unpaid_checkout_intents}</dd></div>
                    <div><dt className="text-muted-foreground">Paid intent/order gaps</dt><dd className="text-lg font-semibold">{operationsHealth.paid_checkout_intents_without_order}</dd></div>
                    <div><dt className="text-muted-foreground">Paid orders missing intent</dt><dd className="text-lg font-semibold">{operationsHealth.paid_stripe_orders_without_intent}</dd></div>
                    <div><dt className="text-muted-foreground">Paid order/event gaps</dt><dd className="text-lg font-semibold">{operationsHealth.paid_stripe_orders_without_event}</dd></div>
                    <div><dt className="text-muted-foreground">Events missing paid order</dt><dd className="text-lg font-semibold">{operationsHealth.processed_stripe_events_without_paid_order}</dd></div>
                  </dl>
                  {operationsHealth.stale_unpaid_checkout_intents > 0 ? (
                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                      Stale unpaid checkouts are aged follow-up items. They require review but do not indicate a confirmed payment loss.
                    </p>
                  ) : null}
                  <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                    <div><dt className="inline font-medium text-foreground">Latest webhook received: </dt><dd className="inline">{operationsHealth.latest_webhook_received_at ? new Date(operationsHealth.latest_webhook_received_at).toLocaleString() : 'None recorded'}</dd></div>
                    <div><dt className="inline font-medium text-foreground">Latest webhook completed: </dt><dd className="inline">{operationsHealth.latest_webhook_completed_at ? new Date(operationsHealth.latest_webhook_completed_at).toLocaleString() : 'None recorded'}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">Generated {new Date(operationsHealth.generated_at).toLocaleString()}</p>
                </div>
              ) : null}
            </section>

            <section aria-labelledby="private-invite-heading" className="rounded-xl border border-border bg-secondary/20 p-5">
              <h2 id="private-invite-heading" className="font-heading text-xl font-semibold">Create a private survey link</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                The link is bound to one delivery email, expires in seven days, and is not saved by this workspace.
              </p>
              <form className="mt-4" onSubmit={issuePrivateInvite}>
                <label className="text-sm font-medium text-foreground">
                  Delivery email
                  <input type="email" autoComplete="off" required maxLength={320} value={inviteEmail}
                    onChange={(event) => {
                      setInviteEmail(event.target.value);
                      setInviteLink(null);
                      setInviteNotice(null);
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
                </label>
                <Button type="submit" className="mt-3" disabled={loading}>Create private link</Button>
              </form>
              {inviteLink ? (
                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground">
                    One-recipient private link
                    <input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()}
                      className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={copyPrivateInvite}>Copy link</Button>
                    <Button type="button" size="sm" variant="outline" onClick={openPrivateInvite}>Open survey</Button>
                  </div>
                </div>
              ) : null}
              {inviteNotice ? <p className="mt-3 text-xs leading-relaxed text-muted-foreground" aria-live="polite">{inviteNotice}</p> : null}
            </section>
          </div>
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
