import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoots = ['app', 'components', 'lib', 'scripts'];
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function applicationSource() {
  return sourceRoots.flatMap(sourceFiles).map((path) => `${path}\n${readFileSync(path, 'utf8')}`).join('\n');
}

describe('candidate-bound payment and no-AI boundary', () => {
  it('pins the reviewed Stripe SDK and includes no AI provider runtime dependency', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    });

    expect(packageJson.dependencies?.stripe).toBe('22.4.0');
    expect(dependencyNames.some((name) => /(?:^|\/)(?:openai|anthropic|ai-sdk|google-generative-ai|cohere|mistral)(?:$|\/)/i.test(name)))
      .toBe(false);
  });

  it('never embeds payment credentials and defaults both activation switches off', () => {
    const source = applicationSource();
    const envExample = readFileSync('.env.example', 'utf8');

    expect(source).not.toMatch(/(?:rk|sk)_(?:live|test)_[A-Za-z0-9]{8,}/);
    expect(source).not.toMatch(/whsec_[A-Za-z0-9]{8,}/);
    expect(envExample).toContain('SNICKERDOODLE_PAYMENTS_ENABLED=false');
    expect(envExample).toContain('SNICKERDOODLE_PAYMENT_WEBHOOKS_ENABLED=false');
    expect(envExample).toMatch(/^STRIPE_RESTRICTED_KEY=$/m);
    expect(envExample).toMatch(/^STRIPE_WEBHOOK_SECRET=$/m);
    expect(source).not.toContain('process.env.STRIPE_SECRET_KEY');
  });

  it('uses dynamic payment methods, leaves tax automation off, and verifies webhook signatures', () => {
    const checkout = readFileSync('app/api/checkout/route.ts', 'utf8');
    const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');

    expect(checkout).toContain('integration_identifier:');
    expect(checkout).not.toContain('payment_method_types');
    expect(checkout).not.toContain('automatic_tax');
    expect(checkout).not.toContain('{CHECKOUT_SESSION_ID}');
    expect(webhook).toContain('constructEvent');
    expect(webhook.indexOf('constructEvent')).toBeLessThan(
      webhook.indexOf("supabase.rpc('process_stripe_payment_event'")
    );
  });
});
