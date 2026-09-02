import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { faqs } from '@/lib/content';
import { PUBLIC_PREFIX, SITE_ORIGIN, TERMS_VERSION, publicUrl } from '@/lib/site';

describe('commercial customer policy', () => {
  it('binds the canonical product origin', () => {
    expect(SITE_ORIGIN).toBe('https://racoben.com');
    expect(PUBLIC_PREFIX).toBe('/snickerdoodle');
    expect(publicUrl('/terms')).toBe('https://racoben.com/snickerdoodle/terms');
  });

  it('publishes the gated one-time offer and conservative refund terms', () => {
    const terms = readFileSync('app/terms/page.tsx', 'utf8');
    const commercialFaq = faqs.find((faq) => faq.q === 'What is the cancellation and refund policy?');

    expect(terms).toContain('Last updated August 30, 2026');
    expect(terms).toContain('one-time {KIT_PRICE} USD payment');
    expect(terms).toContain('normal 48-hour delivery window');
    expect(terms).toContain('before Racoben begins substantive fulfillment');
    expect(terms).toContain('misses an unpaused');
    expect(terms).toContain('within seven calendar days after delivery');
    expect(terms).toContain('one reasonable correction or a full refund');
    expect(terms).toContain('Checkout does not automatically add tax');
    expect(TERMS_VERSION).toBe('2026-08-30');
    expect(terms).toContain('durable checkout record binds that consent to terms version');
    expect(terms).toContain('browser redirect alone never proves payment');
    expect(commercialFaq?.a).toContain('customer-caused delays are not refundable');
  });

  it('states the durable intake, least-privilege manager, analytics, and deletion boundaries', () => {
    const privacy = readFileSync('app/privacy/page.tsx', 'utf8');

    expect(privacy).toContain('Provider analytics is off by default');
    expect(privacy).toContain('validated server submission creates a durable intake record');
    expect(privacy).toContain('but no raw');
    expect(privacy).toContain('active owner and a live authenticated session');
    expect(privacy).toContain('Requests are verified before disclosure, correction, export, or deletion');
  });

  it('keeps the policy and payment offer behind the exact commercial branch', () => {
    const terms = readFileSync('app/terms/page.tsx', 'utf8');
    const faqPage = readFileSync('app/faq/page.tsx', 'utf8');
    const home = readFileSync('app/page.tsx', 'utf8');

    expect(terms.indexOf('commercialReady ?')).toBeLessThan(terms.indexOf('one-time {KIT_PRICE} USD payment'));
    expect(faqPage).toContain('const displayedFaqs = commercialReady ? faqs : holdFaqs;');
    expect(faqPage).toContain('Private intake and payment are unavailable while commercial readiness is on hold.');
    expect(home).toContain('{commercialReady ? (');
    expect(home).toContain('<CommercialHold />');
  });
});
