import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readPageCommercialReadinessMock } = vi.hoisted(() => ({
  readPageCommercialReadinessMock: vi.fn<() => Promise<boolean>>()
}));

vi.mock('@/lib/commercial-runtime', () => ({
  readPageCommercialReadiness: readPageCommercialReadinessMock
}));

import CheckoutCancelPage, { metadata as cancelMetadata } from '@/app/checkout/cancel/page';
import CheckoutSuccessPage, { metadata as successMetadata } from '@/app/checkout/success/page';

function sourceFilesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? sourceFilesBelow(child) : /\.tsx$/.test(entry.name) ? [child] : [];
  });
}

describe('checkout return readiness presentation', () => {
  beforeEach(() => {
    readPageCommercialReadinessMock.mockReset();
  });

  it('preserves no-index and no-cache metadata on both checkout return pages', () => {
    const expectedRobots = { index: false, follow: false, nocache: true };

    expect(successMetadata.robots).toEqual(expectedRobots);
    expect(cancelMetadata.robots).toEqual(expectedRobots);
  });

  it.each([
    {
      commercialReady: false,
      headerLabel: 'View fictional samples',
      footerCopy: 'Snickerdoodle is not accepting orders yet.'
    },
    {
      commercialReady: true,
      headerLabel: 'Request a Fit Check',
      footerCopy: 'You have something to promote.'
    }
  ])(
    'renders success and cancel chrome for commercialReady=$commercialReady without changing checkout truth',
    async ({ commercialReady, headerLabel, footerCopy }) => {
      readPageCommercialReadinessMock.mockResolvedValue(commercialReady);

      const success = renderToStaticMarkup(await CheckoutSuccessPage());
      const cancel = renderToStaticMarkup(await CheckoutCancelPage());

      for (const html of [success, cancel]) {
        expect(html).toContain(headerLabel);
        expect(html).toContain(footerCopy);
      }

      expect(success).toContain('we’re confirming your payment');
      expect(success).toContain('This return page does not confirm payment.');
      expect(cancel).toContain('Stripe did not report a completed payment');
      expect(cancel).toContain('no paid order or delivery obligation was created');
    }
  );

  it('requires every application caller to provide the commercial readiness state explicitly', () => {
    const applicationSource = [...sourceFilesBelow('app'), ...sourceFilesBelow('components')]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const headerSource = readFileSync('components/site-header.tsx', 'utf8');
    const footerSource = readFileSync('components/site-footer.tsx', 'utf8');

    expect(applicationSource).not.toMatch(/<SiteHeader\s*\/>/);
    expect(applicationSource).not.toMatch(/<SiteFooter\s*\/>/);
    expect(headerSource).toContain('{ commercialReady }: { commercialReady: boolean }');
    expect(footerSource).toContain('{ commercialReady }: { commercialReady: boolean }');
    expect(headerSource).not.toContain('commercialReady = false');
    expect(footerSource).not.toContain('commercialReady = false');
  });
});
