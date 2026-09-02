import { connection } from 'next/server';
import { evaluateCommercialReadiness } from './commercial-readiness.mjs';
import { readCheckoutPaymentConfig } from './payment-runtime';

/** Use from server-rendered pages before deciding which product state to render. */
export async function readPageCommercialReadiness() {
  await connection();
  return evaluateCommercialReadiness(process.env);
}

/** Mirrors the exact checkout route gate without exposing any payment configuration. */
export async function readPageCheckoutAvailability() {
  await connection();
  return readCheckoutPaymentConfig() !== null;
}

/** Route handlers already execute at request time and do not need connection(). */
export function readRequestCommercialReadiness() {
  return evaluateCommercialReadiness(process.env);
}
