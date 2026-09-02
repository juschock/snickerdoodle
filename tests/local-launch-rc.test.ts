import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function filesBelow(path: string): string[] {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [relative(root, join(root, child))];
  });
}

describe('SN07 local launch release candidate', () => {
  it('binds every current runtime identity to 1.1.0-rc.3', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    const lock = JSON.parse(read('package-lock.json')) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect(pkg.version).toBe('1.1.0-rc.3');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages['']?.version).toBe(pkg.version);
    expect(read('lib/stripe.ts')).toContain("version: '1.1.0-rc.3'");
  });

  it('classifies every application route and keeps private paths out of discovery', () => {
    const inventory = read('docs/release/route-access-inventory.md');
    for (const source of filesBelow('app').filter((path) => /\/(page|route)\.tsx?$/.test(path))) {
      const route = source
        .replace(/^app/, '/snickerdoodle')
        .replace(/\/page\.tsx$/, '')
        .replace(/\/route\.ts$/, '') || '/snickerdoodle';
      const routePattern = route.replace(/\[([^\]]+)\]/g, '[$1]');
      expect(inventory, `${source} is absent from the route inventory`).toContain(routePattern);
    }
    expect(read('app/robots.ts')).toContain("'/snickerdoodle/brief'");
    expect(read('app/sitemap.ts')).not.toContain('/brief');
  });

  it('contains no effective global-capacity or one-order operating rule', () => {
    const effective = [
      ...filesBelow('app'), ...filesBelow('lib'), ...filesBelow('components'),
      'docs/payment-operations.md', 'docs/internal-automation-pipeline.md',
      'docs/marketing-plan-zero-budget.md', 'docs/studio/studio-architecture.md',
      'docs/studio/phase-plan.md'
    ].filter((path) => /\.(?:ts|tsx|mjs|md)$/.test(path)).map(read).join('\n');
    expect(effective).not.toMatch(/one[- ]order[- ]at[- ]a[- ]time/i);
    expect(effective).not.toMatch(/singleton[- ]capacity reservation/i);
    expect(effective).not.toMatch(/only one active .*order/i);
  });

  it('makes the recovery rehearsal run the decisive whole-product corpora', () => {
    const rehearsal = read('scripts/db/launch-recovery-rehearsal.sh');
    for (const evidence of [
      'privacy-lifecycle-acceptance.sql', 'ord03-acceptance.sql',
      'intake-manager-queue-acceptance.sql', 'privileged-rpc-access-acceptance.sql',
      'payment-state-machine-acceptance.sql', 'payment-state-machine-concurrency.sh',
      'payment-terminal-race-concurrency.sh', 'sn06-replay-privacy-tombstone.sql'
    ]) expect(rehearsal).toContain(evidence);
    expect(rehearsal).toContain('SNICK_SN07_WHOLE_PRODUCT_RC_PASS');
  });

  it('keeps hosted and rollback proof boundaries explicit', () => {
    expect(read('docs/release/hosted-readiness-manifest.md')).toContain('None is performed or credited by SN07');
    expect(read('docs/release/rollback-boundary.md')).toContain('Database changes are forward-only');
    expect(read('docs/release/environment-contract.md')).toContain('Missing, malformed, mode-mismatched');
  });
});
