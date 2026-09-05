import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/checkout/success/page';

describe('payment status page', () => {
  it('is a no-index payment-receipt page', () => {
    expect(metadata.robots).toEqual(expect.objectContaining({ index: false, follow: false }));
  });

  it('keeps payment availability claims bound to the exact runtime gate', () => {
    const privacy = readFileSync('app/privacy/page.tsx', 'utf8');
    const received = readFileSync('app/brief/received/page.tsx', 'utf8');

    expect(privacy).toContain('readPageCheckoutAvailability');
    expect(privacy).toContain('checkoutAvailable');
    expect(privacy).not.toContain('Payment collection is unavailable in this code release.');
    expect(received).toContain('readPageCheckoutAvailability');
    expect(received).toContain('This page does not confirm payment.');
    expect(received).not.toContain('Payment is unavailable in this release.');
  });

  it('uses clear return-page language without exposing reconciliation internals', () => {
    const received = readFileSync('app/brief/received/page.tsx', 'utf8');
    const success = readFileSync('app/checkout/success/page.tsx', 'utf8');

    expect(received).toContain('This page does not confirm payment.');
    expect(success).toContain('This page does not confirm payment or create a paid order.');
    expect(`${received}\n${success}`).not.toContain('signed payment event');
    expect(`${received}\n${success}`).not.toContain('reconciled');
  });
});
