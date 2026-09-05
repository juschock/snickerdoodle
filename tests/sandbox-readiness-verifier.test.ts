import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const verifier = readFileSync(
  resolve(process.cwd(), 'scripts/verify-sandbox-readiness.mjs'),
  'utf8'
);

describe('sandbox readiness verifier manager reconciliation boundaries', () => {
  it('probes both new routes anonymously and preserves private response headers', () => {
    expect(verifier).toContain('/snickerdoodle/api/manager/alerts');
    expect(verifier).toContain('/snickerdoodle/api/manager/reconciliation');
    expect(verifier).toContain("'manager.alerts_missing_bearer_401'");
    expect(verifier).toContain("'manager.reconciliation_missing_bearer_401'");
    expect(verifier).toContain(
      "assertPrivateSecurityHeaders(alerts, 'manager.alerts')"
    );
    expect(verifier).toContain(
      "assertPrivateSecurityHeaders(reconciliation, 'manager.reconciliation')"
    );
  });

  it('probes the wrong methods with exact Allow headers and private response headers', () => {
    expect(verifier).toContain("'manager.alerts_wrong_method_405'");
    expect(verifier).toContain(
      "alertsWrongMethod.headers.get('allow') === 'GET'"
    );
    expect(verifier).toContain(
      "assertPrivateSecurityHeaders(alertsWrongMethod, 'manager.alerts_wrong_method')"
    );
    expect(verifier).toContain("'manager.reconciliation_wrong_method_405'");
    expect(verifier).toContain(
      "reconciliationWrongMethod.headers.get('allow') === 'POST'"
    );
    expect(verifier).toContain(
      "assertPrivateSecurityHeaders(reconciliationWrongMethod, 'manager.reconciliation_wrong_method')"
    );
  });
});
