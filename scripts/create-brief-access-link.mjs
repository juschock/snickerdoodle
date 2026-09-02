#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';
import { evaluateCommercialReadiness, resolveAllowedOrigin } from '../lib/commercial-readiness.mjs';

const email = process.argv[2]?.trim().toLowerCase();
const secret = process.env.CHECKOUT_SECURITY_SECRET;
const siteOrigin = resolveAllowedOrigin(process.env);

if (!evaluateCommercialReadiness(process.env)) {
  console.error('Private invite generation is disabled because commercial readiness is on hold.');
  process.exit(1);
}
if (!siteOrigin) {
  console.error('SNICKERDOODLE_ALLOWED_ORIGIN must be an exact HTTP(S) origin with no path, query, or fragment.');
  process.exit(1);
}

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run brief:invite -- qualified@example.com');
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error('CHECKOUT_SECURITY_SECRET must be set to the server secret (32+ characters).');
  process.exit(1);
}

const subjectHash = createHmac('sha256', secret)
  .update(`snickerdoodle:brief-access-subject:v1:${email}`)
  .digest('hex');
const issuedAt = Date.now();
const payload = Buffer.from(JSON.stringify({
  v: 2,
  subjectHash,
  issuedAt,
  expiresAt: issuedAt + 7 * 24 * 60 * 60 * 1000,
  nonce: randomUUID()
})).toString('base64url');
const signature = createHmac('sha256', secret)
  .update(`snickerdoodle:brief-access-token:v2:${payload}`)
  .digest('base64url');
const url = new URL(`${siteOrigin}/snickerdoodle/brief`);
url.hash = new URLSearchParams({ access: `${payload}.${signature}` }).toString();

console.log(url.toString());
