export const COMMERCIAL_GATE_NAMES = Object.freeze([
  'SNICKERDOODLE_COMMERCIAL_READY',
  'SNICKERDOODLE_OFFER_APPROVED',
  'SNICKERDOODLE_FULFILLMENT_READY',
  'SNICKERDOODLE_REVIEWER_READY',
  'SNICKERDOODLE_LEGAL_APPROVED',
  'SNICKERDOODLE_PAYMENTS_READY',
  'SNICKERDOODLE_G5_ASSIGNED',
  'SNICKERDOODLE_MONETARY_APPROVED'
]);

/**
 * Commercial mode is intentionally conjunctive and exact. Missing values,
 * alternate truthy spellings, or any single unresolved gate keep the product
 * closed. These deployment flags record approvals; they never grant them.
 */
export function evaluateCommercialReadiness(environment) {
  return COMMERCIAL_GATE_NAMES.every((name) => environment[name] === 'true');
}

export function resolveAllowedOrigin(environment) {
  const candidate = environment.SNICKERDOODLE_ALLOWED_ORIGIN;
  if (typeof candidate !== 'string' || candidate.length === 0) return null;

  try {
    const parsed = new URL(candidate);
    const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      (parsed.protocol === 'http:' && !isLoopback) ||
      candidate !== parsed.origin ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isLoopbackOrigin(origin) {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}
