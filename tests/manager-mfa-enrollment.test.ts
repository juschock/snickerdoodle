import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  prepareOwnerSecondFactor,
  retryIncompleteOwnerSecondFactor,
  selectOwnerFactorId,
  type OwnerVerifiedFactor
} from '@/components/manager-queue';

const verifiedFactorId = '10000000-0000-4000-8000-000000000001';
const enrollmentFactorId = '20000000-0000-4000-8000-000000000002';
const staleFactorId = '30000000-0000-4000-8000-000000000003';
const otherFactorId = '40000000-0000-4000-8000-000000000004';
const ownerFriendlyName = 'Snickerdoodle owner authenticator';
const qrPrefix = 'data:image/svg+xml;utf-8,';
const validSecret = 'JBSWY3DPEHPK3PXP';
const maxQrCodeLength = 3_000_000;

function sdkSvgQrCode(length: number) {
  const opening = `${qrPrefix}%3Csvg%3E%3C!--`;
  const closing = '--%3E%3C%2Fsvg%3E';
  if (length < opening.length + closing.length) {
    throw new Error('Synthetic QR fixture length is too short.');
  }
  return `${opening}${'x'.repeat(length - opening.length - closing.length)}${closing}`;
}

const validQrCode = sdkSvgQrCode(128);

type FactorFixture = {
  id: string;
  factor_type: 'totp' | 'phone';
  status: 'verified' | 'unverified';
  friendly_name?: string;
};

function totpFactor(
  id: string,
  status: FactorFixture['status'],
  friendlyName?: string
): FactorFixture {
  return {
    id,
    factor_type: 'totp',
    status,
    ...(friendlyName ? { friendly_name: friendlyName } : {})
  };
}

function mfaClient({
  factors = [],
  factorSnapshots,
  factorError = null,
  enrollment,
  enrollmentError = null,
  unenrollmentError = null
}: {
  factors?: FactorFixture[];
  factorSnapshots?: FactorFixture[][];
  factorError?: Error | null;
  enrollment?: { id: string; qrCode: string; secret: string };
  enrollmentError?: Error | null;
  unenrollmentError?: Error | null;
}) {
  const snapshots = factorSnapshots ?? [factors];
  let snapshotIndex = 0;
  const enroll = vi.fn().mockResolvedValue({
    data: enrollment ? {
      id: enrollment.id,
      type: 'totp',
      friendly_name: ownerFriendlyName,
      totp: {
        qr_code: enrollment.qrCode,
        secret: enrollment.secret,
        uri: 'otpauth://example.invalid'
      }
    } : null,
    error: enrollmentError
  });
  const unenroll = vi.fn().mockResolvedValue({
    data: unenrollmentError ? null : { id: staleFactorId },
    error: unenrollmentError
  });
  const listFactors = vi.fn().mockImplementation(async () => {
    if (factorError) return { data: null, error: factorError };
    const current = snapshots[Math.min(snapshotIndex, snapshots.length - 1)] ?? [];
    snapshotIndex += 1;
    return {
      data: {
        all: current,
        phone: current.filter(
          (factor) => factor.factor_type === 'phone' && factor.status === 'verified'
        ),
        totp: current.filter(
          (factor) => factor.factor_type === 'totp' && factor.status === 'verified'
        )
      },
      error: null
    };
  });
  const client = {
    auth: { mfa: { enroll, listFactors, unenroll } }
  } as unknown as SupabaseClient;
  return { client, enroll, listFactors, unenroll };
}

describe('owner TOTP enrollment routing', () => {
  it('preserves every verified TOTP factor and never removes one', async () => {
    const { client, enroll, unenroll } = mfaClient({
      factors: [
        totpFactor(verifiedFactorId, 'verified', 'Google Authenticator'),
        totpFactor(enrollmentFactorId, 'verified', 'Microsoft Authenticator'),
        totpFactor(staleFactorId, 'unverified', ownerFriendlyName)
      ]
    });

    await expect(prepareOwnerSecondFactor(client)).resolves.toEqual({
      step: 'mfa',
      factors: [
        { id: verifiedFactorId, label: 'Google Authenticator (1)' },
        { id: enrollmentFactorId, label: 'Microsoft Authenticator (2)' }
      ]
    });
    expect(unenroll).not.toHaveBeenCalled();
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

  it('starts exactly one first-time enrollment when no factor exists', async () => {
    const { client, enroll, unenroll } = mfaClient({
      enrollment: {
        id: enrollmentFactorId,
        qrCode: validQrCode,
        secret: validSecret
      }
    });

    await expect(prepareOwnerSecondFactor(client)).resolves.toEqual({
      step: 'enrollment',
      factorId: enrollmentFactorId,
      qrCode: validQrCode,
      manualSecret: validSecret
    });
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: ownerFriendlyName
    });
    expect(unenroll).not.toHaveBeenCalled();
  });

  it('requires explicit cleanup for the exact incomplete owner factor', async () => {
    const { client, enroll, unenroll } = mfaClient({
      factors: [totpFactor(staleFactorId, 'unverified', ownerFriendlyName)]
    });

    await expect(prepareOwnerSecondFactor(client)).resolves.toEqual({
      step: 'cleanup',
      factorId: staleFactorId
    });
    expect(unenroll).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
  });

  it('revalidates, removes the exact incomplete factor, and enrolls one replacement', async () => {
    const stale = totpFactor(staleFactorId, 'unverified', ownerFriendlyName);
    const { client, enroll, listFactors, unenroll } = mfaClient({
      factorSnapshots: [[stale], []],
      enrollment: {
        id: enrollmentFactorId,
        qrCode: validQrCode,
        secret: validSecret
      }
    });

    await expect(retryIncompleteOwnerSecondFactor(client, staleFactorId)).resolves.toEqual({
      step: 'enrollment',
      factorId: enrollmentFactorId,
      qrCode: validQrCode,
      manualSecret: validSecret
    });
    expect(listFactors).toHaveBeenCalledTimes(2);
    expect(unenroll).toHaveBeenCalledTimes(1);
    expect(unenroll).toHaveBeenCalledWith({ factorId: staleFactorId });
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(unenroll.mock.invocationCallOrder[0]).toBeLessThan(enroll.mock.invocationCallOrder[0]);
  });

  it('preserves a verified factor that appears at cleanup action time', async () => {
    const verified = totpFactor(verifiedFactorId, 'verified', 'Primary Authenticator');
    const { client, enroll, unenroll } = mfaClient({ factorSnapshots: [[verified]] });

    await expect(retryIncompleteOwnerSecondFactor(client, staleFactorId)).resolves.toEqual({
      step: 'mfa',
      factors: [{ id: verifiedFactorId, label: 'Primary Authenticator (1)' }]
    });
    expect(unenroll).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
  });

  it('fails closed when the incomplete factor changes before explicit cleanup', async () => {
    const { client, enroll, unenroll } = mfaClient({
      factorSnapshots: [[totpFactor(otherFactorId, 'unverified', ownerFriendlyName)]]
    });

    await expect(retryIncompleteOwnerSecondFactor(client, staleFactorId))
      .rejects.toThrow('Incomplete authenticator state changed. Sign in again.');
    expect(unenroll).not.toHaveBeenCalled();
    expect(enroll).not.toHaveBeenCalled();
  });

  it('does not remove unrelated unverified factors', async () => {
    const unrelatedTotp = totpFactor(staleFactorId, 'unverified', 'Personal authenticator');
    const unrelatedPhone: FactorFixture = {
      id: otherFactorId,
      factor_type: 'phone',
      status: 'unverified',
      friendly_name: ownerFriendlyName
    };
    const { client, enroll, unenroll } = mfaClient({
      factors: [unrelatedTotp, unrelatedPhone],
      enrollment: {
        id: enrollmentFactorId,
        qrCode: validQrCode,
        secret: validSecret
      }
    });

    await expect(prepareOwnerSecondFactor(client)).resolves.toMatchObject({
      step: 'enrollment',
      factorId: enrollmentFactorId
    });
    expect(unenroll).not.toHaveBeenCalled();
    expect(enroll).toHaveBeenCalledTimes(1);
  });

  it('does not enroll if explicit cleanup fails or remains incomplete', async () => {
    const stale = totpFactor(staleFactorId, 'unverified', ownerFriendlyName);
    const cleanupFailure = mfaClient({
      factorSnapshots: [[stale]],
      unenrollmentError: new Error('provider detail')
    });
    const staleAfterCleanup = mfaClient({ factorSnapshots: [[stale], [stale]] });

    await expect(retryIncompleteOwnerSecondFactor(cleanupFailure.client, staleFactorId))
      .rejects.toThrow('Could not remove the incomplete authenticator setup.');
    expect(cleanupFailure.enroll).not.toHaveBeenCalled();
    await expect(retryIncompleteOwnerSecondFactor(staleAfterCleanup.client, staleFactorId))
      .rejects.toThrow('Could not remove the incomplete authenticator setup.');
    expect(staleAfterCleanup.unenroll).toHaveBeenCalledTimes(1);
    expect(staleAfterCleanup.enroll).not.toHaveBeenCalled();
  });

  it('accepts a large SDK-returned QR string above the former 100 KB limit', async () => {
    const largeQrCode = sdkSvgQrCode(150_000);
    const { client } = mfaClient({
      enrollment: {
        id: enrollmentFactorId,
        qrCode: largeQrCode,
        secret: validSecret
      }
    });

    const result = await prepareOwnerSecondFactor(client);
    expect(result.step).toBe('enrollment');
    if (result.step !== 'enrollment') throw new Error('Expected enrollment artifacts.');
    expect(result.qrCode).toBe(largeQrCode);
    expect(result.qrCode).toHaveLength(150_000);
  });

  it('accepts exactly 3,000,000 QR characters and rejects 3,000,001', async () => {
    const boundaryQrCode = sdkSvgQrCode(maxQrCodeLength);
    const oversizedQrCode = `${boundaryQrCode}x`;
    const accepted = mfaClient({
      enrollment: {
        id: enrollmentFactorId,
        qrCode: boundaryQrCode,
        secret: validSecret
      }
    });
    const rejected = mfaClient({
      factorSnapshots: [[], [totpFactor(enrollmentFactorId, 'unverified', ownerFriendlyName)]],
      enrollment: {
        id: enrollmentFactorId,
        qrCode: oversizedQrCode,
        secret: validSecret
      }
    });

    const acceptedResult = await prepareOwnerSecondFactor(accepted.client);
    expect(acceptedResult.step).toBe('enrollment');
    if (acceptedResult.step !== 'enrollment') throw new Error('Expected enrollment artifacts.');
    expect(acceptedResult.qrCode).toHaveLength(maxQrCodeLength);
    await expect(prepareOwnerSecondFactor(rejected.client)).resolves.toEqual({
      step: 'cleanup',
      factorId: enrollmentFactorId
    });
    expect(rejected.enroll).toHaveBeenCalledTimes(1);
    expect(rejected.unenroll).not.toHaveBeenCalled();
  });

  it('fails closed for factor-list errors and unprovable malformed enrollment artifacts', async () => {
    const listFailure = mfaClient({ factorError: new Error('provider detail') });
    const malformedEnrollment = mfaClient({
      enrollment: {
        id: enrollmentFactorId,
        qrCode: 'https://attacker.example/qr.svg',
        secret: validSecret
      }
    });
    const prefixedNonSvg = mfaClient({
      enrollment: {
        id: enrollmentFactorId,
        qrCode: `${qrPrefix}not-an-svg-document`,
        secret: validSecret
      }
    });

    await expect(prepareOwnerSecondFactor(listFailure.client))
      .rejects.toThrow('Could not inspect registered second factors.');
    expect(listFailure.enroll).not.toHaveBeenCalled();
    await expect(prepareOwnerSecondFactor(malformedEnrollment.client))
      .rejects.toThrow('Could not start authenticator enrollment.');
    expect(malformedEnrollment.unenroll).not.toHaveBeenCalled();
    await expect(prepareOwnerSecondFactor(prefixedNonSvg.client))
      .rejects.toThrow('Could not start authenticator enrollment.');
    expect(prefixedNonSvg.unenroll).not.toHaveBeenCalled();
  });

  it.each([
    `${qrPrefix}%3Csvg%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E%3C%2Fsvg%3E`,
    `${qrPrefix}%3Csvg%3E%3CforeignObject%3Ex%3C%2FforeignObject%3E%3C%2Fsvg%3E`,
    `${qrPrefix}%3Csvg%20onload%3D%22alert(1)%22%3E%3C%2Fsvg%3E`
  ])('rejects active content in an SDK-shaped SVG data URI', async (qrCode) => {
    const malformed = mfaClient({
      enrollment: { id: enrollmentFactorId, qrCode, secret: validSecret }
    });

    await expect(prepareOwnerSecondFactor(malformed.client))
      .rejects.toThrow('Could not start authenticator enrollment.');
  });

  it('keeps enrollment artifacts ephemeral and proves AAL2 before exposing manager controls', () => {
    const source = readFileSync('components/manager-queue.tsx', 'utf8');
    const challengeIndex = source.indexOf('challengeAndVerify({');
    const currentSessionIndex = source.indexOf('acceptAal2Session(await currentSession(authClient))');
    const readyControlsIndex = source.indexOf("authStep === 'ready'");
    const signOutSource = source.slice(source.indexOf('async function signOut()'), readyControlsIndex);

    expect(source).toContain("useState<AuthStep>('password')");
    expect(source).toContain("authStep === 'cleanup'");
    expect(source).toContain("authStep === 'enrollment'");
    expect(source).toContain('incompleteFactorId');
    expect(source).toContain('enrollmentQrCode');
    expect(source).toContain('enrollmentManualSecret');
    expect(source).toContain('retryIncompleteOwnerSecondFactor(');
    expect(source).toContain('selectOwnerFactorId(verifiedFactors, selectedFactorIndex)');
    expect(source).not.toContain('value={factor.id}');
    expect(challengeIndex).toBeGreaterThan(-1);
    expect(currentSessionIndex).toBeGreaterThan(challengeIndex);
    expect(readyControlsIndex).toBeGreaterThan(currentSessionIndex);
    expect(signOutSource.indexOf('setEnrollmentQrCode(null)'))
      .toBeLessThan(signOutSource.indexOf("authClient.auth.signOut({ scope: 'local' })"));
    expect(signOutSource.indexOf('setEnrollmentManualSecret(null)'))
      .toBeLessThan(signOutSource.indexOf("authClient.auth.signOut({ scope: 'local' })"));
    expect(source).toContain("if (!session) throw new Error('A fully verified owner session is required.')");
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|console\.|service_role|ServiceRole|admin\.auth/);
  });
});
