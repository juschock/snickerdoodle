#!/usr/bin/env node

import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

function help() {
  process.stdout.write(`Usage:
  node scripts/verify-sandbox-readiness.mjs \\
    --app-url https://...sandbox... \\
    --expected-app-alias https://...sandbox... \\
    --ingress-url https://...sandbox... \\
    --expected-ingress-alias https://...sandbox...

Equivalent non-secret environment variables:
  SNICKERDOODLE_SANDBOX_APP_URL
  SNICKERDOODLE_EXPECTED_APP_ALIAS
  SNICKERDOODLE_SANDBOX_INGRESS_URL
  SNICKERDOODLE_EXPECTED_INGRESS_ALIAS

The verifier performs read-only HTTP probes and starts the existing local production
build with a sanitized environment. It does not accept or read provider secrets.
`);
}

function parseArgs(argv) {
  const allowed = new Set([
    '--app-url',
    '--expected-app-alias',
    '--ingress-url',
    '--expected-ingress-alias'
  ]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    const equalsAt = argument.indexOf('=');
    const key = equalsAt === -1 ? argument : argument.slice(0, equalsAt);
    const value = equalsAt === -1 ? argv[index += 1] : argument.slice(equalsAt + 1);
    if (!allowed.has(key) || !value || value.startsWith('--')) {
      throw new Error('Invalid arguments. Use --help for the accepted non-secret inputs.');
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function sandboxOrigin(rawValue, label) {
  if (!rawValue) throw new Error(`${label} is required.`);
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
  const hostname = parsed.hostname.toLowerCase();
  const liveMarker = /(^|[.-])(live|prod|production)([.-]|$)/;
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search ||
    parsed.hash ||
    !hostname.includes('sandbox') ||
    hostname === 'racoben.com' ||
    hostname.endsWith('.racoben.com') ||
    liveMarker.test(hostname)
  ) {
    throw new Error(`${label} must be a sandbox-only HTTPS origin with no path, credentials, query, or fragment.`);
  }
  return parsed.origin;
}

function assertCheck(condition, name) {
  if (!condition) throw new Error(`Readiness check failed: ${name}.`);
  checks.push(name);
}

function hasDirective(response, header, value) {
  return (response.headers.get(header) ?? '').toLowerCase().includes(value.toLowerCase());
}

function assertPrivateSecurityHeaders(response, name) {
  assertCheck(hasDirective(response, 'cache-control', 'no-store'), `${name}.cache_no_store`);
  assertCheck(response.headers.get('referrer-policy')?.toLowerCase() === 'no-referrer', `${name}.no_referrer`);
  assertCheck(hasDirective(response, 'x-robots-tag', 'noindex'), `${name}.noindex`);
  assertCheck(hasDirective(response, 'content-security-policy', "frame-ancestors 'none'"), `${name}.csp`);
  assertCheck(response.headers.get('x-frame-options')?.toUpperCase() === 'DENY', `${name}.frame_denied`);
  assertCheck(hasDirective(response, 'strict-transport-security', 'max-age='), `${name}.hsts`);
  assertCheck(response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff', `${name}.nosniff`);
  assertCheck(!response.headers.has('x-powered-by'), `${name}.no_framework_banner`);
}

async function safeFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: 'manual',
    cache: 'no-store',
    headers: {
      'User-Agent': 'snickerdoodle-sandbox-readiness/1',
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(12_000)
  });
}

async function freeLoopbackPort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  if (!port) throw new Error('Could not reserve a loopback port.');
  return port;
}

async function startSanitizedLocalBuild() {
  await access(resolve(repoRoot, '.next', 'BUILD_ID'));
  const nextBin = resolve(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  await access(nextBin);
  const port = await freeLoopbackPort();
  const child = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: repoRoot,
    env: {
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      PATH: process.env.PATH ?? ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const exit = new Promise((resolvePromise) => child.once('exit', (code, signal) => resolvePromise({ code, signal })));
  for (const stream of [child.stdout, child.stderr]) {
    stream.resume();
  }

  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const earlyExit = await Promise.race([
      exit.then((result) => ({ result })),
      new Promise((resolvePromise) => setTimeout(() => resolvePromise(null), 200))
    ]);
    if (earlyExit) throw new Error('The existing local production build could not be started. Run npm run build first.');
    try {
      const response = await safeFetch(`${origin}/snickerdoodle/api/manager/health`);
      if (response.status === 401) return { child, exit, origin };
    } catch {
      // The server is still starting.
    }
  }
  child.kill('SIGTERM');
  throw new Error('Timed out starting the existing local production build.');
}

async function stopLocalBuild(child, exit) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exit.then(() => true),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 2_000))
  ]);
  if (!stopped) child.kill('SIGKILL');
}

async function verifyProtectedApp(appOrigin) {
  const response = await safeFetch(`${appOrigin}/snickerdoodle`);
  assertCheck([302, 303, 307, 308].includes(response.status), 'app.sso_redirect');
  const location = response.headers.get('location');
  let destination = null;
  try {
    destination = location ? new URL(location, appOrigin) : null;
  } catch {
    destination = null;
  }
  assertCheck(
    destination?.protocol === 'https:' &&
      (destination.hostname === 'vercel.com' || destination.hostname.endsWith('.vercel.com')) &&
      /(sso|login|auth)/i.test(destination.pathname),
    'app.sso_destination'
  );
  assertCheck(hasDirective(response, 'cache-control', 'no-store'), 'app.sso_no_store');
  assertCheck(hasDirective(response, 'strict-transport-security', 'max-age='), 'app.sso_hsts');
  assertCheck(response.headers.get('x-frame-options')?.toUpperCase() === 'DENY', 'app.sso_frame_denied');
}

async function verifyLocalManagerBoundary() {
  const server = await startSanitizedLocalBuild();
  try {
    const health = await safeFetch(`${server.origin}/snickerdoodle/api/manager/health`);
    assertCheck(health.status === 401, 'manager.health_missing_bearer_401');
    assertPrivateSecurityHeaders(health, 'manager.health');

    const invite = await safeFetch(`${server.origin}/snickerdoodle/api/manager/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assertCheck(invite.status === 401, 'manager.invite_missing_bearer_401');
    assertPrivateSecurityHeaders(invite, 'manager.invite');

    const fulfillment = await safeFetch(`${server.origin}/snickerdoodle/api/manager/fulfillment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assertCheck(fulfillment.status === 401, 'manager.fulfillment_missing_bearer_401');
    assertPrivateSecurityHeaders(fulfillment, 'manager.fulfillment');

    const alerts = await safeFetch(`${server.origin}/snickerdoodle/api/manager/alerts`);
    assertCheck(alerts.status === 401, 'manager.alerts_missing_bearer_401');
    assertPrivateSecurityHeaders(alerts, 'manager.alerts');

    const reconciliation = await safeFetch(`${server.origin}/snickerdoodle/api/manager/reconciliation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assertCheck(reconciliation.status === 401, 'manager.reconciliation_missing_bearer_401');
    assertPrivateSecurityHeaders(reconciliation, 'manager.reconciliation');

    const healthWrongMethod = await safeFetch(`${server.origin}/snickerdoodle/api/manager/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assertCheck(healthWrongMethod.status === 405, 'manager.health_wrong_method_405');
    assertCheck(healthWrongMethod.headers.get('allow') === 'GET', 'manager.health_allow_get');
    assertPrivateSecurityHeaders(healthWrongMethod, 'manager.health_wrong_method');

    const inviteWrongMethod = await safeFetch(`${server.origin}/snickerdoodle/api/manager/invites`);
    assertCheck(inviteWrongMethod.status === 405, 'manager.invite_wrong_method_405');
    assertCheck(inviteWrongMethod.headers.get('allow') === 'POST', 'manager.invite_allow_post');
    assertPrivateSecurityHeaders(inviteWrongMethod, 'manager.invite_wrong_method');

    const fulfillmentWrongMethod = await safeFetch(`${server.origin}/snickerdoodle/api/manager/fulfillment`);
    assertCheck(fulfillmentWrongMethod.status === 405, 'manager.fulfillment_wrong_method_405');
    assertCheck(fulfillmentWrongMethod.headers.get('allow') === 'POST', 'manager.fulfillment_allow_post');
    assertPrivateSecurityHeaders(fulfillmentWrongMethod, 'manager.fulfillment_wrong_method');

    const alertsWrongMethod = await safeFetch(`${server.origin}/snickerdoodle/api/manager/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assertCheck(alertsWrongMethod.status === 405, 'manager.alerts_wrong_method_405');
    assertCheck(alertsWrongMethod.headers.get('allow') === 'GET', 'manager.alerts_allow_get');
    assertPrivateSecurityHeaders(alertsWrongMethod, 'manager.alerts_wrong_method');

    const reconciliationWrongMethod = await safeFetch(`${server.origin}/snickerdoodle/api/manager/reconciliation`);
    assertCheck(reconciliationWrongMethod.status === 405, 'manager.reconciliation_wrong_method_405');
    assertCheck(reconciliationWrongMethod.headers.get('allow') === 'POST', 'manager.reconciliation_allow_post');
    assertPrivateSecurityHeaders(reconciliationWrongMethod, 'manager.reconciliation_wrong_method');
  } finally {
    await stopLocalBuild(server.child, server.exit);
  }
}

async function verifyIngress(ingressOrigin) {
  const root = await safeFetch(`${ingressOrigin}/`);
  assertCheck(root.status === 404, 'ingress.root_404');

  const webhookGet = await safeFetch(`${ingressOrigin}/api/stripe/webhook`);
  assertCheck(webhookGet.status === 405, 'ingress.webhook_get_405');
  assertCheck(hasDirective(webhookGet, 'cache-control', 'no-store'), 'ingress.webhook_no_store');
  assertCheck(webhookGet.headers.get('referrer-policy')?.toLowerCase() === 'no-referrer', 'ingress.webhook_no_referrer');
  assertCheck(webhookGet.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff', 'ingress.webhook_nosniff');
  assertCheck(hasDirective(webhookGet, 'strict-transport-security', 'max-age='), 'ingress.webhook_hsts');
  assertCheck(!webhookGet.headers.has('x-powered-by'), 'ingress.webhook_no_framework_banner');

  const unsigned = await safeFetch(`${ingressOrigin}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  assertCheck(unsigned.status === 400, 'ingress.unsigned_post_fail_closed');
  assertCheck(hasDirective(unsigned, 'cache-control', 'no-store'), 'ingress.unsigned_no_store');
  assertCheck(unsigned.headers.get('referrer-policy')?.toLowerCase() === 'no-referrer', 'ingress.unsigned_no_referrer');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const appOrigin = sandboxOrigin(
    args['app-url'] ?? process.env.SNICKERDOODLE_SANDBOX_APP_URL,
    'Sandbox app URL'
  );
  const expectedAppOrigin = sandboxOrigin(
    args['expected-app-alias'] ?? process.env.SNICKERDOODLE_EXPECTED_APP_ALIAS,
    'Expected sandbox app alias'
  );
  const ingressOrigin = sandboxOrigin(
    args['ingress-url'] ?? process.env.SNICKERDOODLE_SANDBOX_INGRESS_URL,
    'Sandbox ingress URL'
  );
  const expectedIngressOrigin = sandboxOrigin(
    args['expected-ingress-alias'] ?? process.env.SNICKERDOODLE_EXPECTED_INGRESS_ALIAS,
    'Expected sandbox ingress alias'
  );

  assertCheck(appOrigin === expectedAppOrigin, 'input.app_alias_exact');
  assertCheck(ingressOrigin === expectedIngressOrigin, 'input.ingress_alias_exact');
  assertCheck(!appOrigin.includes('?') && !ingressOrigin.includes('?'), 'input.no_query_secret');

  await verifyProtectedApp(appOrigin);
  await verifyLocalManagerBoundary();
  await verifyIngress(ingressOrigin);

  process.stdout.write(`SNICKERDOODLE_SANDBOX_READINESS_PASS schema=1 checks=${checks.length}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown readiness failure.';
  process.stderr.write(`SNICKERDOODLE_SANDBOX_READINESS_FAIL ${message}\n`);
  process.exitCode = 1;
});
