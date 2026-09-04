import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  prepareOwnerSecondFactor,
  selectOwnerFactorId,
  type OwnerVerifiedFactor
} from '@/components/manager-queue';

const verifiedFactorId = '10000000-0000-4000-8000-000000000001';
const enrollmentFactorId = '20000000-0000-4000-8000-000000000002';

function mfaClient({
  factors,
  factorError = null,
  enrollment,
  enrollmentError = null
}: {
  factors: Array<{
    id: string;
    status: 'verified' | 'unverified';
    friendly_name?: string;
  }>;
  factorError?: Error | null;
  enrollment?: { id: string; qrCode: string; secret: string };
  enrollmentError?: Error | null;
}) {
  const enroll = vi.fn().mockResolvedValue({
    data: enrollment ? {
      id: enrollment.id,
      type: 'totp',
      friendly_name: 'Snickerdoodle owner authenticator',
      totp: {
        qr_code: enrollment.qrCode,
        secret: enrollment.secret,
        uri: 'otpauth://example.invalid'
      }
    } : null,
    error: enrollmentError
  });
  const listFactors = vi.fn().mockResolvedValue({
    data: factorError ? null : { all: factors, totp: factors, phone: [] },
    error: factorError
  });
  const client = { auth: { mfa: { enroll, listFactors } } } as unknown as SupabaseClient;
  return { client, enroll, listFactors };
}

describe('owner TOTP enrollment routing', () => {
  it('preserves every verified TOTP factor and excludes unverified factors', async () => {
    const { client, enroll } = mfaClient({
      factors: [
        { id: verifiedFactorId, status: 'verified', friendly_name: 'Google Authenticator' },
        { id: enrollmentFactorId, status: 'verified', friendly_name: 'Microsoft Authenticator' },
        { id: '30000000-0000-4000-8000-000000000003', status: 'unverified' }
      ]
    });

    await expect(prepareOwnerSecondFactor(client)).resolves.toEqual({
      step: 'mfa',
      factors: [
        { id: verifiedFactorId, label: 'Google Authenticator (1)' },
        { id: enrollmentFactorId, label: 'Microsoft Authenticator (2)' }
      ]
    });
    expect(enroll).not.toHaveBeenCalled();
  });

  it('selects only the explicitly chosen verified factor', () => {
    const factors: OwnerVerifiedFactor[] = [
      { id: verifiedFactorId, label: 'Authenticator 1' },
      { id: enrollmentFactorId, label: 'Authenticator 2' }
    ];

    expect(selectOwnerFactorId(factors, null)).toBeNull();
    expect(selectOwnerFactorId(factors, -1)).toBeNull();
    expect(selectOwnerFactorId(factors, 2)).toBeNull();
    expect(selectOwnerFactorId(factors, 1)).toBe(enrollmentFactorId);
  });

  it('starts first-time or recovery enrollment when no verified TOTP factor exists', async () => {
    const { client, enroll } = mfaClient({
      factors: [{ id: verifiedFactorId, status: 'unverified' }],
      enrollment: {
        id: enrollmentFactorId,
        qrCode: 'data:image/svg+xml;utf-8,%3Csvg%3Eqr%3C/svg%3E',
        secret: 'JBSWY3DPEHPK3PXP'
      }
    });

    await expect(prepareOwnerSecondFactor(client)).resolves.toEqual({
      step: 'enrollment',
      factorId: enrollmentFactorId,
      qrCode: 'data:image/svg+xml;utf-8,%3Csvg%3Eqr%3C/svg%3E',
      manualSecret: 'JBSWY3DPEHPK3PXP'
    });
    expect(enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Snickerdoodle owner authenticator'
    });
  });

  it('fails closed for factor-list errors or malformed enrollment artifacts', async () => {
    const listFailure = mfaClient({
      factors: [],
      factorError: new Error('provider detail')
    });
    const malformedEnrollment = mfaClient({
      factors: [],
      enrollment: {
        id: enrollmentFactorId,
        qrCode: 'https://attacker.example/qr.svg',
        secret: 'JBSWY3DPEHPK3PXP'
      }
    });

    await expect(prepareOwnerSecondFactor(listFailure.client))
      .rejects.toThrow('Could not inspect registered second factors.');
    expect(listFailure.enroll).not.toHaveBeenCalled();
    await expect(prepareOwnerSecondFactor(malformedEnrollment.client))
      .rejects.toThrow('Could not start authenticator enrollment.');
  });

  it('keeps enrollment artifacts ephemeral and proves AAL2 before exposing manager controls', () => {
    const source = readFileSync('components/manager-queue.tsx', 'utf8');
    const challengeIndex = source.indexOf('challengeAndVerify({');
    const currentSessionIndex = source.indexOf('acceptAal2Session(await currentSession(authClient))');
    const readyControlsIndex = source.indexOf("authStep === 'ready'");
    const signOutSource = source.slice(source.indexOf('async function signOut()'), readyControlsIndex);

    expect(source).toContain("useState<AuthStep>('password')");
    expect(source).toContain("authStep === 'enrollment'");
    expect(source).toContain('enrollmentQrCode');
    expect(source).toContain('enrollmentManualSecret');
    expect(source).toContain("name=\"owner-authenticator\"");
    expect(source).toContain('selectOwnerFactorId(verifiedFactors, selectedFactorIndex)');
    expect(source).not.toContain('value={factor.id}');
    expect(source.match(/setEnrollmentQrCode\(null\)/g)).toHaveLength(2);
    expect(source.match(/setEnrollmentManualSecret\(null\)/g)).toHaveLength(2);
    expect(challengeIndex).toBeGreaterThan(-1);
    expect(currentSessionIndex).toBeGreaterThan(challengeIndex);
    expect(readyControlsIndex).toBeGreaterThan(currentSessionIndex);
    expect(signOutSource.indexOf('setEnrollmentQrCode(null)'))
      .toBeLessThan(signOutSource.indexOf("authClient.auth.signOut({ scope: 'local' })"));
    expect(signOutSource.indexOf('setEnrollmentManualSecret(null)'))
      .toBeLessThan(signOutSource.indexOf("authClient.auth.signOut({ scope: 'local' })"));
    expect(source).toContain("if (!session) throw new Error('A current AAL2 owner session is required.')");
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|console\.|service_role|ServiceRole|admin\.auth|\.unenroll\(/);
  });
});
