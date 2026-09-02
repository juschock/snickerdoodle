import type Stripe from 'stripe';

export type PaymentEventKind =
  | 'paid'
  | 'recoverable_failure'
  | 'full_refund'
  | 'partial_refund'
  | 'dispute_opened'
  | 'dispute_won'
  | 'dispute_lost'
  | 'ignored';

export type PaymentTransitionRule = Readonly<{
  event: string;
  kind: PaymentEventKind;
  sourceStates: readonly string[];
  destinationState: string;
  forbiddenRegressions: readonly string[];
  stripeObject: 'checkout.session' | 'charge' | 'dispute' | 'other';
  rowsAffected: readonly string[];
  transactionBoundary: 'process_stripe_payment_event';
  idempotency: string;
  terminalPrecedence: string;
  reconciliation: string;
}>;

const common = {
  transactionBoundary: 'process_stripe_payment_event' as const,
  idempotency: 'Stripe event_id is claimed once; Session and PaymentIntent bindings are unique.',
  rowsAffected: [
    'stripe_webhook_receipts',
    'checkout_intents',
    'stripe_checkout_reservations',
    'orders',
    'stripe_events',
    'intake_manager_queue',
    'activity_events',
    'payment_reconciliation_alerts'
  ]
};

export const PAYMENT_TRANSITION_MAP: readonly PaymentTransitionRule[] = [
  {
    ...common,
    event: 'checkout.session.completed',
    kind: 'paid',
    sourceStates: ['pending', 'checkout_created', 'expired'],
    destinationState: 'paid',
    forbiddenRegressions: ['refunded', 'dispute_lost'],
    stripeObject: 'checkout.session',
    terminalPrecedence: 'Authoritative paid outranks an earlier recoverable failure for the same binding.',
    reconciliation: 'Create the exact order graph once; a late success resolves failure alerts.'
  },
  {
    ...common,
    event: 'checkout.session.async_payment_succeeded',
    kind: 'paid',
    sourceStates: ['pending', 'checkout_created', 'expired'],
    destinationState: 'paid',
    forbiddenRegressions: ['refunded', 'dispute_lost'],
    stripeObject: 'checkout.session',
    terminalPrecedence: 'Authoritative paid outranks an earlier recoverable failure for the same binding.',
    reconciliation: 'Create the exact order graph once; a late success resolves failure alerts.'
  },
  {
    ...common,
    event: 'checkout.session.expired',
    kind: 'recoverable_failure',
    sourceStates: ['pending', 'checkout_created'],
    destinationState: 'expired',
    forbiddenRegressions: ['paid', 'refunded', 'disputed', 'dispute_lost'],
    stripeObject: 'checkout.session',
    terminalPrecedence: 'Paid is stronger; expiration delivered after payment is stale and attention-only.',
    reconciliation: 'Release only the exact intent reservation; retain a durable alert.'
  },
  {
    ...common,
    event: 'checkout.session.async_payment_failed',
    kind: 'recoverable_failure',
    sourceStates: ['pending', 'checkout_created'],
    destinationState: 'expired',
    forbiddenRegressions: ['paid', 'refunded', 'disputed', 'dispute_lost'],
    stripeObject: 'checkout.session',
    terminalPrecedence: 'Paid is stronger; a later legitimate success for the same binding may reactivate.',
    reconciliation: 'Release only the exact intent reservation; retain a durable alert.'
  },
  {
    ...common,
    event: 'charge.refunded',
    kind: 'full_refund',
    sourceStates: ['paid', 'disputed'],
    destinationState: 'refunded',
    forbiddenRegressions: ['unpaid'],
    stripeObject: 'charge',
    terminalPrecedence: 'Full refund is terminal for commercial fulfillment and cannot become paid again.',
    reconciliation: 'Require amount_refunded to equal the order total; partial refunds are attention-only.'
  },
  {
    ...common,
    event: 'charge.dispute.created',
    kind: 'dispute_opened',
    sourceStates: ['paid'],
    destinationState: 'disputed',
    forbiddenRegressions: ['unpaid', 'refunded', 'dispute_lost'],
    stripeObject: 'dispute',
    terminalPrecedence: 'Refunded and lost-dispute states are stronger than an opened dispute.',
    reconciliation: 'Retain the order and payment evidence while moving the queue to attention.'
  },
  {
    ...common,
    event: 'charge.dispute.closed:won',
    kind: 'dispute_won',
    sourceStates: ['disputed'],
    destinationState: 'paid',
    forbiddenRegressions: ['refunded', 'dispute_lost'],
    stripeObject: 'dispute',
    terminalPrecedence: 'A won dispute restores paid only from disputed.',
    reconciliation: 'Resolve the matching dispute alert; preserve immutable event history.'
  },
  {
    ...common,
    event: 'charge.dispute.closed:lost',
    kind: 'dispute_lost',
    sourceStates: ['disputed', 'paid'],
    destinationState: 'dispute_lost',
    forbiddenRegressions: ['unpaid', 'refunded'],
    stripeObject: 'dispute',
    terminalPrecedence: 'Lost dispute is terminal and later stale paid events cannot regress it.',
    reconciliation: 'Keep the order graph and event evidence; queue remains payment attention.'
  }
] as const;

const byEvent = new Map(PAYMENT_TRANSITION_MAP.map((rule) => [rule.event, rule]));

export type NormalizedStripePaymentEvent = {
  rule: PaymentTransitionRule | null;
  checkoutSessionId: string | null;
  checkoutIntentId: string | null;
  paymentIntentId: string | null;
  stripeCustomerId: string | null;
  chargeId: string | null;
  disputeId: string | null;
  amountTotal: number | null;
  amountRefunded: number | null;
  currency: string | null;
  customerEmail: string | null;
  providerStatus: string | null;
};

function stripeObjectId(value: string | { id: string } | null | undefined) {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

export function normalizeStripePaymentEvent(event: Stripe.Event): NormalizedStripePaymentEvent {
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    return {
      rule: byEvent.get(event.type) ?? null,
      checkoutSessionId: session.id,
      checkoutIntentId: session.metadata?.checkout_intent_id ?? session.client_reference_id,
      paymentIntentId: stripeObjectId(session.payment_intent),
      stripeCustomerId: stripeObjectId(session.customer),
      chargeId: null,
      disputeId: null,
      amountTotal: session.amount_total,
      amountRefunded: null,
      currency: session.currency,
      customerEmail: session.customer_details?.email ?? session.customer_email,
      providerStatus: session.payment_status
    };
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const kind = charge.amount_refunded === charge.amount ? 'full_refund' : 'partial_refund';
    return {
      rule: { ...(byEvent.get(event.type)!), kind },
      checkoutSessionId: null,
      checkoutIntentId: null,
      paymentIntentId: stripeObjectId(charge.payment_intent),
      stripeCustomerId: stripeObjectId(charge.customer),
      chargeId: charge.id,
      disputeId: null,
      amountTotal: charge.amount,
      amountRefunded: charge.amount_refunded,
      currency: charge.currency,
      customerEmail: null,
      providerStatus: kind
    };
  }

  if (event.type.startsWith('charge.dispute.')) {
    const dispute = event.data.object as Stripe.Dispute;
    const status = dispute.status;
    const eventKey = event.type === 'charge.dispute.closed'
      ? `${event.type}:${status === 'won' || status === 'warning_closed' ? 'won' : status === 'lost' ? 'lost' : 'unknown'}`
      : event.type;
    return {
      rule: byEvent.get(eventKey) ?? null,
      checkoutSessionId: null,
      checkoutIntentId: null,
      paymentIntentId: stripeObjectId(dispute.payment_intent),
      stripeCustomerId: null,
      chargeId: stripeObjectId(dispute.charge),
      disputeId: dispute.id,
      amountTotal: dispute.amount,
      amountRefunded: null,
      currency: dispute.currency,
      customerEmail: null,
      providerStatus: status
    };
  }

  return {
    rule: null,
    checkoutSessionId: null,
    checkoutIntentId: null,
    paymentIntentId: null,
    stripeCustomerId: null,
    chargeId: null,
    disputeId: null,
    amountTotal: null,
    amountRefunded: null,
    currency: null,
    customerEmail: null,
    providerStatus: null
  };
}
