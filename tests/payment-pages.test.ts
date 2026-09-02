import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import CheckoutSuccessPage, { metadata } from '@/app/checkout/success/page';

describe('payment status page', () => {
  it('is a static, no-index payment-receipt page', () => {
    expect(CheckoutSuccessPage()).toBeTruthy();
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
});
