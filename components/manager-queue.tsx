'use client';

import { type FormEvent, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import Image from 'next/image';
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
  open_reconciliation_alerts: number;
  attention_reasons: string[];
};

type OwnerReconciliationAlert = {
  alert_id: string;
  event_type: string;
  alert_code: string;
  occurrence_count: number;
  last_observed_at: string;
  can_resolve_expiry: boolean;
};

export type FulfillmentAction = {
  eventType: 'fulfillment.started' | 'fulfillment.completed' | 'order.closed';
  expectedStatus: 'new_intake' | 'drafting' | 'delivered';
  nextStatus: 'drafting' | 'delivered' | 'closed';
  label: string;
};

export type FulfillmentRetry = FulfillmentAction & {
  orderId: string;
  idempotencyKey: string;
};

const FULFILLMENT_ACTIONS: Partial<Record<string, FulfillmentAction>> = {
  new_intake: {
    eventType: 'fulfillment.started',
    expectedStatus: 'new_intake',
    nextStatus: 'drafting',
    label: 'Start fulfillment'
  },
  drafting: {
    eventType: 'fulfillment.completed',
    expectedStatus: 'drafting',
    nextStatus: 'delivered',
    label: 'Mark delivered'
  },
  delivered: {
    eventType: 'order.closed',
    expectedStatus: 'delivered',
    nextStatus: 'closed',
    label: 'Close order'
  }
};

export function selectFulfillmentRetry(
  current: FulfillmentRetry | null,
  orderId: string,
  action: FulfillmentAction,
  createIdempotencyKey: () => string
) {
  if (
    current?.orderId === orderId &&
    current.eventType === action.eventType &&
    current.expectedStatus === action.expectedStatus
  ) return current;

  return {
    ...action,
    orderId,
    idempotencyKey: createIdempotencyKey()
  };
}

type AuthStep = 'password' | 'mfa' | 'enrollment' | 'cleanup' | 'ready';

const OWNER_TOTP_FRIENDLY_NAME = 'Snickerdoodle owner authenticator';
const MAX_TOTP_QR_CODE_LENGTH = 3_000_000;
const FACTOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OwnerVerifiedFactor = {
  id: string;
  label: string;
};

export type OwnerSecondFactorPreparation =
  | { step: 'mfa'; factors: OwnerVerifiedFactor[] }
  | { step: 'enrollment'; factorId: string; qrCode: string; manualSecret: string }
  | { step: 'cleanup'; factorId: string };

export function selectOwnerFactorId(
  factors: OwnerVerifiedFactor[],
  selectedFactorIndex: number | null
) {
  if (
    selectedFactorIndex === null ||
    !Number.isSafeInteger(selectedFactorIndex) ||
    selectedFactorIndex < 0
  ) return null;
  return factors[selectedFactorIndex]?.id ?? null;
}

function validFactorId(value: unknown): value is string {
  return typeof value === 'string' && FACTOR_ID_PATTERN.test(value);
}

function isSafeTotpSvg(value: string) {
  const svg = value.trim().replace(/^<\?xml[^>]*>\s*/i, '');
  return (
    /^<svg(?:\s|>)/i.test(svg) &&
    /<\/svg>\s*$/i.test(svg) &&
    !/<(?:script|foreignObject)\b/i.test(svg) &&
    !/\son[a-z]+\s*=/i.test(svg)
  );
}

function normalizeTotpQrCode(value: unknown) {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_TOTP_QR_CODE_LENGTH) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dataPrefix = trimmed.match(/^data:image\/svg\+xml;(?:utf-8|charset=utf-8),/i)?.[0];
  if (dataPrefix) {
    try {
      const svg = decodeURIComponent(trimmed.slice(dataPrefix.length));
      return isSafeTotpSvg(svg) ? trimmed : null;
    } catch {
      return null;
    }
  }

  if (isSafeTotpSvg(trimmed)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }

  return null;
}

function normalizeTotpSecret(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  if (
    normalized.length < 16 ||
    normalized.length > 256 ||
    !/^[A-Z2-7]+={0,6}$/.test(normalized)
  ) return null;
  return normalized;
}

async function readOwnerFactorState(client: SupabaseClient) {
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) {
    throw new Error('Could not inspect registered second factors.');
  }

  // `data.all` is authoritative for lifecycle state. The convenience
  // `data.totp` collection cannot detect an incomplete enrollment.
  const allFactors = factors.data?.all ?? [];
  const allTotp = allFactors.filter(
    (factor) => factor.factor_type === 'totp'
  );
  const hasAnyVerifiedFactor = allFactors.some(
    (factor) => factor.status === 'verified'
  );
  const verifiedTotp = allTotp.filter(
    (factor) => factor.status === 'verified'
  );

  const verifiedFactors = verifiedTotp.map((factor, index) => {
    if (!validFactorId(factor.id)) {
      throw new Error('Could not inspect registered second factors.');
    }

    const friendlyName = typeof factor.friendly_name === 'string'
      ? factor.friendly_name.replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
    return {
      id: factor.id,
      label: friendlyName
        ? `${friendlyName} (${index + 1})`
        : `Authenticator ${index + 1}`
    };
  });

  const soleFactor = allFactors.length === 1 ? allFactors[0] : null;
  const incompleteFactorId =
    soleFactor?.factor_type === 'totp' &&
    soleFactor.status === 'unverified' &&
    soleFactor.friendly_name === OWNER_TOTP_FRIENDLY_NAME
      ? soleFactor.id
      : null;
  if (incompleteFactorId !== null && !validFactorId(incompleteFactorId)) {
    throw new Error('Could not inspect registered second factors.');
  }

  return {
    verifiedFactors,
    hasAnyVerifiedFactor,
    incompleteFactorId,
    totalFactors: allFactors.length
  };
}

function readEnrollmentArtifacts(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const candidate = data as {
    id?: unknown;
    totp?: { qr_code?: unknown; secret?: unknown };
  };
  if (!validFactorId(candidate.id)) return null;

  const qrCode = normalizeTotpQrCode(candidate.totp?.qr_code);
  const manualSecret = normalizeTotpSecret(candidate.totp?.secret);
  if (!qrCode || !manualSecret) return null;
  return { factorId: candidate.id, qrCode, manualSecret };
}

async function enrollOwnerSecondFactor(
  client: SupabaseClient
): Promise<OwnerSecondFactorPreparation> {
  const enrollment = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: OWNER_TOTP_FRIENDLY_NAME
  });
  if (enrollment.error) {
    throw new Error('Could not start authenticator enrollment.');
  }

  const artifacts = readEnrollmentArtifacts(enrollment.data);
  if (artifacts) return { step: 'enrollment', ...artifacts };

  // Enrollment may succeed provider-side even when its presentation payload
  // cannot be accepted. Re-read state; never enroll twice or auto-unenroll.
  const createdId = enrollment.data && typeof enrollment.data === 'object'
    ? (enrollment.data as { id?: unknown }).id
    : null;
  if (validFactorId(createdId)) {
    const state = await readOwnerFactorState(client);
    if (
      !state.hasAnyVerifiedFactor &&
      state.totalFactors === 1 &&
      state.incompleteFactorId === createdId
    ) {
      return { step: 'cleanup', factorId: createdId };
    }
  }

  throw new Error('Could not start authenticator enrollment.');
}

export function getOwnerRecoveryRedirect(origin: string) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('Invalid recovery origin.');
  }

  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (
    parsed.origin !== origin ||
    (parsed.protocol !== 'https:' && !(isLoopback && parsed.protocol === 'http:'))
  ) {
    throw new Error('Invalid recovery origin.');
  }

  return `${parsed.origin}/snickerdoodle/auth/recovery`;
}

export async function prepareOwnerSecondFactor(
  client: SupabaseClient
): Promise<OwnerSecondFactorPreparation> {
  const state = await readOwnerFactorState(client);
  if (state.hasAnyVerifiedFactor) {
    if (state.verifiedFactors.length > 0) {
      return { step: 'mfa', factors: state.verifiedFactors };
    }
    throw new Error('Could not inspect registered second factors.');
  }
  if (state.incompleteFactorId) {
    return { step: 'cleanup', factorId: state.incompleteFactorId };
  }
  if (state.totalFactors !== 0) {
    throw new Error('Could not inspect registered second factors.');
  }
  return enrollOwnerSecondFactor(client);
}

export async function retryIncompleteOwnerSecondFactor(
  client: SupabaseClient,
  factorId: string
): Promise<OwnerSecondFactorPreparation> {
  if (!validFactorId(factorId)) {
    throw new Error('Incomplete authenticator state changed. Sign in again.');
  }

  // Re-read at action time. If a verified factor appeared, prefer it and
  // remove nothing.
  const before = await readOwnerFactorState(client);
  if (before.hasAnyVerifiedFactor) {
    if (before.verifiedFactors.length > 0) {
      return { step: 'mfa', factors: before.verifiedFactors };
    }
    throw new Error('Could not inspect registered second factors.');
  }
  if (
    before.totalFactors !== 1 ||
    before.incompleteFactorId !== factorId
  ) {
    throw new Error('Incomplete authenticator state changed. Sign in again.');
  }

  const removal = await client.auth.mfa.unenroll({ factorId });
  if (removal.error) {
    throw new Error('Could not remove the incomplete authenticator setup.');
  }

  const after = await readOwnerFactorState(client);
  if (after.hasAnyVerifiedFactor) {
    if (after.verifiedFactors.length > 0) {
      return { step: 'mfa', factors: after.verifiedFactors };
    }
    throw new Error('Could not remove the incomplete authenticator setup.');
  }
  if (after.totalFactors !== 0) {
    throw new Error('Could not remove the incomplete authenticator setup.');
  }

  // Exactly one replacement enrollment attempt per explicit cleanup action.
  return enrollOwnerSecondFactor(client);
}

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
    'processed_stripe_events_without_paid_order', 'open_reconciliation_alerts'
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

function isOwnerReconciliationAlert(
  value: unknown
): value is OwnerReconciliationAlert {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const alert = value as Record<string, unknown>;
  const keys = Object.keys(alert).sort();
  if (keys.join('|') !== [
    'alert_code',
    'alert_id',
    'can_resolve_expiry',
    'event_type',
    'last_observed_at',
    'occurrence_count'
  ].join('|')) return false;

  return typeof alert.alert_id === 'string' &&
    FACTOR_ID_PATTERN.test(alert.alert_id) &&
    typeof alert.event_type === 'string' &&
    alert.event_type.length >= 3 &&
    alert.event_type.length <= 255 &&
    typeof alert.alert_code === 'string' &&
    /^[a-z][a-z0-9_]{2,99}$/.test(alert.alert_code) &&
    Number.isSafeInteger(alert.occurrence_count) &&
    Number(alert.occurrence_count) > 0 &&
    typeof alert.last_observed_at === 'string' &&
    Number.isFinite(Date.parse(alert.last_observed_at)) &&
    typeof alert.can_resolve_expiry === 'boolean';
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
  const [incompleteFactorId, setIncompleteFactorId] = useState<string | null>(null);
  const [verifiedFactors, setVerifiedFactors] = useState<OwnerVerifiedFactor[]>([]);
  const [selectedFactorIndex, setSelectedFactorIndex] = useState<number | null>(null);
  const [enrollmentQrCode, setEnrollmentQrCode] = useState<string | null>(null);
  const [enrollmentManualSecret, setEnrollmentManualSecret] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('password');
  const [receipts, setReceipts] = useState<QueueReceipt[]>([]);
  const [selectedIntake, setSelectedIntake] = useState<PaidIntake | null>(null);
  const [nextCursor, setNextCursor] = useState<QueueCursor | null>(null);
  const [operationsHealth, setOperationsHealth] = useState<OperationsHealth | null>(null);
  const [reconciliationAlerts, setReconciliationAlerts] =
    useState<OwnerReconciliationAlert[]>([]);
  const [reconciliationAlertsLoaded, setReconciliationAlertsLoaded] =
    useState(false);
  const [reconciliationNotice, setReconciliationNotice] =
    useState<string | null>(null);
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const reconciliationIdempotencyKeys =
    useRef<Map<string, string>>(new Map());
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [fulfillmentRetry, setFulfillmentRetry] = useState<FulfillmentRetry | null>(null);
  const [fulfillmentNotice, setFulfillmentNotice] = useState<string | null>(null);
  const [fulfillmentPending, setFulfillmentPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function acceptAal2Session(nextSession: Session) {
    const assurance = await authClient!.auth.mfa.getAuthenticatorAssuranceLevel(nextSession.access_token);
    if (assurance.error || assurance.data.currentLevel !== 'aal2') {
      throw new Error('A verified second factor is required.');
    }
    setTotpCode('');
    setFactorId(null);
    setIncompleteFactorId(null);
    setVerifiedFactors([]);
    setSelectedFactorIndex(null);
    setEnrollmentQrCode(null);
    setEnrollmentManualSecret(null);
    setSession(nextSession);
    setAuthStep('ready');
  }

  function showSecondFactorPreparation(secondFactor: OwnerSecondFactorPreparation) {
    setTotpCode('');
    setFactorId(null);
    setIncompleteFactorId(null);
    setVerifiedFactors([]);
    setSelectedFactorIndex(null);
    setEnrollmentQrCode(null);
    setEnrollmentManualSecret(null);

    if (secondFactor.step === 'enrollment') {
      setFactorId(secondFactor.factorId);
      setEnrollmentQrCode(secondFactor.qrCode);
      setEnrollmentManualSecret(secondFactor.manualSecret);
    } else if (secondFactor.step === 'mfa') {
      setVerifiedFactors(secondFactor.factors);
      setSelectedFactorIndex(secondFactor.factors.length === 1 ? 0 : null);
    } else {
      setIncompleteFactorId(secondFactor.factorId);
    }

    setAuthStep(secondFactor.step);
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

      let secondFactor: OwnerSecondFactorPreparation;
      try {
        secondFactor = await prepareOwnerSecondFactor(authClient);
      } catch (factorError) {
        await authClient.auth.signOut({ scope: 'local' });
        throw factorError;
      }
      showSecondFactorPreparation(secondFactor);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Owner sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function replaceIncompleteAuthenticator() {
    if (!authClient || !incompleteFactorId || loading) return;
    setError(null);
    setLoading(true);
    try {
      const secondFactor = await retryIncompleteOwnerSecondFactor(
        authClient,
        incompleteFactorId
      );
      showSecondFactorPreparation(secondFactor);
    } catch (authError) {
      setError(authError instanceof Error
        ? authError.message
        : 'Could not restart authenticator enrollment.');
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    if (
      !authClient ||
      recoveryPending ||
      recoveryRequested ||
      email.trim().length === 0
    ) return;

    setError(null);
    setPassword('');
    setRecoveryNotice(null);
    setRecoveryPending(true);

    try {
      await authClient.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getOwnerRecoveryRedirect(window.location.origin)
      });
    } catch {
      // Deliberately indistinguishable from provider acceptance.
    } finally {
      setRecoveryRequested(true);
      setRecoveryNotice('If that address can receive a reset email, check its inbox and use the newest link.');
      setRecoveryPending(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedFactorId = authStep === 'mfa'
      ? selectOwnerFactorId(verifiedFactors, selectedFactorIndex)
      : factorId;
    if (!authClient || !selectedFactorId) return;
    setError(null);
    setLoading(true);
    try {
      const verification = await authClient.auth.mfa.challengeAndVerify({
        factorId: selectedFactorId,
        code: totpCode
      });
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
    if (!session) throw new Error('A fully verified owner session is required.');
    const response = await fetch(path, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? 'The owner session expired or needs authenticator verification again. Sign in again.'
        : 'The manager workspace is temporarily unavailable.');
    }
    return payload;
  }

  async function authorizedPost(path: string, body: Record<string, unknown>) {
    if (!session) throw new Error('A fully verified owner session is required.');
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
        throw new Error('The owner session expired or needs authenticator verification again. Sign in again.');
      }
      if (response.status === 400) throw new Error('Enter a valid delivery email.');
      throw new Error('Private invite generation is temporarily unavailable.');
    }
    return payload;
  }

  async function loadOperationsHealth(preserveError = false) {
    if (!preserveError) setError(null);
    setLoading(true);
    try {
      const payload = await authorizedGet('/snickerdoodle/api/manager/health');
      const health = (payload as { health?: unknown }).health;
      if (!isOperationsHealth(health)) throw new Error('Payment operations returned an invalid response.');
      setOperationsHealth(health);
      return true;
    } catch (healthError) {
      setOperationsHealth(null);
      setError(healthError instanceof Error ? healthError.message : 'Payment operations health is unavailable.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadReconciliationAlerts(preserveFeedback = false) {
    if (!preserveFeedback) {
      setError(null);
      setReconciliationNotice(null);
    }
    setLoading(true);
    try {
      const payload = await authorizedGet(
        '/snickerdoodle/api/manager/alerts'
      );
      const alerts = (payload as { alerts?: unknown }).alerts;
      if (
        !Array.isArray(alerts) ||
        !alerts.every(isOwnerReconciliationAlert)
      ) {
        throw new Error(
          'Reconciliation review returned an invalid response.'
        );
      }
      setReconciliationAlerts(alerts);
      setReconciliationAlertsLoaded(true);
      return true;
    } catch (alertError) {
      setReconciliationAlerts([]);
      setReconciliationAlertsLoaded(false);
      setError(
        alertError instanceof Error
          ? alertError.message
          : 'Reconciliation review is unavailable.'
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function resolveReconciliationAlert(
    alert: OwnerReconciliationAlert
  ) {
    if (
      !session ||
      !alert.can_resolve_expiry ||
      resolvingAlertId !== null
    ) return;

    if (!window.confirm(
      'Resolve this reviewed unpaid Checkout expiry? ' +
      'This closes only the reconciliation alert. ' +
      'It does not change payment, order, reservation, or fulfillment state.'
    )) return;

    const alertOccurrenceKey = `${alert.alert_id}:${alert.occurrence_count}`;
    let idempotencyKey =
      reconciliationIdempotencyKeys.current.get(alertOccurrenceKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      reconciliationIdempotencyKeys.current.set(
        alertOccurrenceKey,
        idempotencyKey
      );
    }

    setError(null);
    setReconciliationNotice(null);
    setResolvingAlertId(alert.alert_id);
    setLoading(true);

    try {
      const response = await fetch(
        '/snickerdoodle/api/manager/reconciliation',
        {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            alert_id: alert.alert_id,
            expected_occurrence_count: alert.occurrence_count,
            idempotency_key: idempotencyKey
          })
        }
      );

      const payload: unknown = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            'The owner session expired or needs authenticator verification again. Sign in again.'
          );
        }
        if (response.status === 409) {
          reconciliationIdempotencyKeys.current.delete(alertOccurrenceKey);
          setReconciliationAlertsLoaded(false);
          throw new Error(
            'This alert changed after review. Reload open alerts before deciding again.'
          );
        }
        throw new Error(
          'The reconciliation resolution was not applied.'
        );
      }

      if (
        !payload ||
        typeof payload !== 'object' ||
        Object.keys(payload).length !== 1 ||
        (payload as { status?: unknown }).status !== 'resolved'
      ) {
        throw new Error(
          'The reconciliation resolution returned an invalid response.'
        );
      }

      reconciliationIdempotencyKeys.current.delete(alertOccurrenceKey);
      const alertsRefreshed = await loadReconciliationAlerts(true);
      const healthRefreshed = await loadOperationsHealth(true);
      setReconciliationNotice(
        alertsRefreshed && healthRefreshed
          ? 'The reviewed unpaid-expiry alert was resolved. Payment truth was not changed.'
          : 'The reviewed unpaid-expiry alert was resolved, but the workspace refresh was incomplete. Review open alerts again before taking another action.'
      );
    } catch (resolutionError) {
      setError(
        resolutionError instanceof Error
          ? resolutionError.message
          : 'The reconciliation resolution did not complete.'
      );
    } finally {
      setResolvingAlertId(null);
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

  async function loadQueue(loadOlder = false, preserveSelectedIntentId: string | null = null) {
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
      if (!preserveSelectedIntentId) setSelectedIntake(null);
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
    if (selectedIntake?.checkout_intent_id !== intentId) {
      setFulfillmentRetry(null);
      setFulfillmentNotice(null);
    }
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

  async function transitionSelectedOrder(action: FulfillmentAction) {
    if (!session || !selectedIntake || selectedIntake.payment_status !== 'paid') return;
    const transition = selectFulfillmentRetry(
      fulfillmentRetry,
      selectedIntake.order_id,
      action,
      () => crypto.randomUUID()
    );
    const selectedIntentId = selectedIntake.checkout_intent_id;

    setFulfillmentRetry(transition);
    setFulfillmentNotice(null);
    setError(null);
    setFulfillmentPending(true);
    setLoading(true);
    try {
      const response = await fetch('/snickerdoodle/api/manager/fulfillment', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order_id: transition.orderId,
          event_type: transition.eventType,
          expected_status: transition.expectedStatus,
          idempotency_key: transition.idempotencyKey
        })
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('The owner session expired or needs authenticator verification again. Sign in again.');
        }
        throw new Error('The fulfillment update was not applied. Retry this action safely or refresh the order.');
      }
      if (
        !payload || typeof payload !== 'object' ||
        Object.keys(payload).length !== 1 ||
        (payload as { status?: unknown }).status !== action.nextStatus
      ) {
        throw new Error('The fulfillment update returned an invalid response. Retry this action safely.');
      }

      setFulfillmentRetry(null);
      setFulfillmentNotice(`Order moved to ${action.nextStatus.replaceAll('_', ' ')}.`);
      await loadQueue(false, selectedIntentId);
      await loadPaidIntake(selectedIntentId);
      await loadOperationsHealth();
    } catch (transitionError) {
      setError(transitionError instanceof Error
        ? transitionError.message
        : 'The fulfillment update did not complete. Retry this action safely.');
    } finally {
      setFulfillmentPending(false);
      setLoading(false);
    }
  }

  async function signOut() {
    setSession(null);
    setTotpCode('');
    setFactorId(null);
    setIncompleteFactorId(null);
    setVerifiedFactors([]);
    setSelectedFactorIndex(null);
    setEnrollmentQrCode(null);
    setEnrollmentManualSecret(null);
    setReceipts([]);
    setNextCursor(null);
    setSelectedIntake(null);
    setOperationsHealth(null);
    setReconciliationAlerts([]);
    setReconciliationAlertsLoaded(false);
    setReconciliationNotice(null);
    setResolvingAlertId(null);
    reconciliationIdempotencyKeys.current.clear();
    setInviteEmail('');
    setInviteLink(null);
    setInviteNotice(null);
    setFulfillmentRetry(null);
    setFulfillmentNotice(null);
    setFulfillmentPending(false);
    setLoaded(false);
    setAuthStep('password');
    setRecoveryPending(false);
    setRecoveryRequested(false);
    setRecoveryNotice(null);
    if (authClient) await authClient.auth.signOut({ scope: 'local' });
  }

  const selectedFulfillmentAction = selectedIntake
    ? FULFILLMENT_ACTIONS[selectedIntake.order_status]
    : undefined;

  return (
    <section aria-labelledby="manager-queue-heading" className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Restricted owner workspace</p>
        <h1 id="manager-queue-heading" className="mt-2 font-heading text-3xl font-semibold text-foreground">
          Intake, assignment, and payment operations
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Sign in with the owner account and complete authenticator verification. Access is limited to the active owner
          after both steps. During normal owner sign-in, passwords, authenticator codes, and session tokens are held in
          memory only and are not written by this workspace to browser storage, cookies, logs, or customer records.
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
              onChange={(event) => {
                setEmail(event.target.value);
                setRecoveryRequested(false);
                setRecoveryNotice(null);
              }}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
          </label>
          <label className="text-sm font-medium text-foreground">
            Password
            <input type="password" autoComplete="current-password" required minLength={8} maxLength={1024}
              value={password} onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" size="lg" disabled={loading || recoveryPending}>
              {loading ? 'Signing in…' : 'Continue securely'}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={
                loading ||
                recoveryPending ||
                recoveryRequested ||
                email.trim().length === 0
              }
              onClick={requestPasswordReset}
            >
              {recoveryPending ? 'Sending reset…' : 'Send password reset'}
            </Button>
          </div>
          {recoveryNotice ? (
            <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2" aria-live="polite">
              {recoveryNotice}
            </p>
          ) : null}
        </form>
      ) : null}

      {authClient && authStep === 'mfa' ? (
        <form className="mt-8 max-w-sm" onSubmit={verifyMfa}>
          {verifiedFactors.length > 1 ? (
            <fieldset className="mb-5">
              <legend className="text-sm font-medium text-foreground">Authenticator</legend>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Choose the authenticator that will generate this code.
              </p>
              <div className="mt-3 grid gap-2">
                {verifiedFactors.map((factor, index) => (
                  <label key={factor.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="owner-authenticator"
                      value={index}
                      checked={selectedFactorIndex === index}
                      onChange={() => setSelectedFactorIndex(index)}
                      required
                      className="size-4 accent-primary"
                    />
                    <span>{factor.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="text-sm font-medium text-foreground">
            Authenticator code
            <input type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}"
              minLength={6} maxLength={6} value={totpCode}
              onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
          </label>
          <Button type="submit" size="lg" disabled={
            loading || totpCode.length !== 6 || selectedFactorIndex === null
          } className="mt-4">
            {loading ? 'Verifying…' : 'Verify second factor'}
          </Button>
        </form>
      ) : null}

      {authClient && authStep === 'cleanup' && incompleteFactorId ? (
        <div className="mt-8 max-w-lg rounded-xl border border-border bg-secondary/20 p-5">
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Finish authenticator setup
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A previous Snickerdoodle owner-authenticator setup did not finish, so its QR code
            cannot be shown again. Continue only when you are ready to remove that incomplete,
            unverified setup and create one replacement QR code. Any verified authenticator is
            preserved and used instead if it appears before this action runs.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" size="lg" disabled={loading} onClick={replaceIncompleteAuthenticator}>
              {loading ? 'Retrying setup…' : 'Remove incomplete setup and retry'}
            </Button>
            <Button type="button" size="lg" variant="outline" disabled={loading} onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      ) : null}

      {authClient && authStep === 'enrollment' && enrollmentQrCode && enrollmentManualSecret ? (
        <div className="mt-8 max-w-lg rounded-xl border border-border bg-secondary/20 p-5">
          <h2 className="font-heading text-xl font-semibold text-foreground">Set up your owner authenticator</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Scan this QR code with your authenticator app. If scanning is unavailable, enter the manual setup key.
            The QR code and key are kept only in this page&apos;s memory and are cleared after verification or sign-out.
          </p>
          <Image
            src={enrollmentQrCode}
            alt="QR code for Snickerdoodle owner authenticator enrollment"
            width={192}
            height={192}
            unoptimized
            className="mt-5 rounded-lg border border-border bg-white p-2"
          />
          <div className="mt-5">
            <p className="text-sm font-medium text-foreground">Manual setup key</p>
            <p
              aria-label="Manual authenticator setup key"
              className="mt-2 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
            >
              {enrollmentManualSecret}
            </p>
          </div>
          <form className="mt-5 max-w-sm" onSubmit={verifyMfa}>
            <label className="text-sm font-medium text-foreground">
              Six-digit authenticator code
              <input type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}"
                minLength={6} maxLength={6} value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30" />
            </label>
            <Button type="submit" size="lg" disabled={loading || totpCode.length !== 6} className="mt-4">
              {loading ? 'Verifying…' : 'Enable authenticator and continue'}
            </Button>
          </form>
        </div>
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
                <Button type="button" variant="outline" disabled={loading} onClick={() => void loadOperationsHealth()}>
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
                    <div><dt className="text-muted-foreground">Open reconciliation alerts</dt><dd className="text-lg font-semibold">{operationsHealth.open_reconciliation_alerts}</dd></div>
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

          <section
            aria-labelledby="reconciliation-alerts-heading"
            className="mt-5 rounded-xl border border-border bg-secondary/20 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="reconciliation-alerts-heading"
                  className="font-heading text-xl font-semibold"
                >
                  Payment reconciliation alerts
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Review metadata only. Eligible unpaid Checkout expiries can
                  be acknowledged here after the database revalidates their
                  exact current state.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loading || resolvingAlertId !== null}
                onClick={() => void loadReconciliationAlerts()}
              >
                Review open alerts
              </Button>
            </div>

            {reconciliationAlertsLoaded &&
            reconciliationAlerts.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No reconciliation alerts are open.
              </p>
            ) : null}

            {reconciliationAlerts.length > 0 ? (
              <div className="mt-4 space-y-3">
                {reconciliationAlerts.map((alert) => (
                  <div
                    key={alert.alert_id}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <dl className="grid gap-1 text-sm">
                        <div>
                          <dt className="inline font-medium">Event: </dt>
                          <dd className="inline">{alert.event_type}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">Alert: </dt>
                          <dd className="inline font-mono text-xs">
                            {alert.alert_code}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">
                            Occurrences reviewed:{' '}
                          </dt>
                          <dd className="inline">
                            {alert.occurrence_count}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">
                            Last observed:{' '}
                          </dt>
                          <dd className="inline">
                            {new Date(
                              alert.last_observed_at
                            ).toLocaleString()}
                          </dd>
                        </div>
                      </dl>

                      {alert.can_resolve_expiry ? (
                        <Button
                          type="button"
                          disabled={
                            loading ||
                            resolvingAlertId === alert.alert_id
                          }
                          onClick={() =>
                            resolveReconciliationAlert(alert)}
                        >
                          {resolvingAlertId === alert.alert_id
                            ? 'Resolving…'
                            : 'Resolve verified unpaid expiry'}
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Manual investigation required
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {reconciliationNotice ? (
              <p
                className="mt-4 text-sm font-medium text-foreground"
                aria-live="polite"
              >
                {reconciliationNotice}
              </p>
            ) : null}
          </section>
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
          <div className="mt-6 rounded-lg border border-border bg-background p-4">
            <h3 className="font-semibold">Fulfillment action</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Each action applies only to this paid order and its displayed source state. A retry reuses the same
              idempotency key so a lost response cannot apply the action twice.
            </p>
            {selectedIntake.payment_status === 'paid' && selectedFulfillmentAction ? (
              <Button type="button" className="mt-3" disabled={loading || fulfillmentPending}
                onClick={() => transitionSelectedOrder(selectedFulfillmentAction)}>
                {fulfillmentPending ? 'Updating order…' : selectedFulfillmentAction.label}
              </Button>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No owner fulfillment action is available for this order state.
              </p>
            )}
            {fulfillmentRetry ? (
              <p className="mt-3 text-xs text-muted-foreground">
                A safe retry is retained in memory for this action until it succeeds or another order is selected.
              </p>
            ) : null}
            {fulfillmentNotice ? (
              <p className="mt-3 text-sm font-medium text-foreground" aria-live="polite">{fulfillmentNotice}</p>
            ) : null}
          </div>
          <h3 className="mt-6 font-semibold">Customer brief</h3><pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-background p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selectedIntake.brief_json, null, 2)}</pre>
          <h3 className="mt-6 font-semibold">Assignments</h3><pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-background p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selectedIntake.assignments, null, 2)}</pre>
          <h3 className="mt-6 font-semibold">Reconciliation alerts</h3><pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-border bg-background p-4 text-xs whitespace-pre-wrap">{JSON.stringify(selectedIntake.reconciliation_alerts, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
}
