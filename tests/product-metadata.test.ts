import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMERCIAL_FAQ_META_DESCRIPTION,
  COMMERCIAL_PRODUCT_META_DESCRIPTION,
  COMMERCIAL_TAGLINE,
  HOLD_FAQ_META_DESCRIPTION,
  HOLD_PRODUCT_META_DESCRIPTION,
  HOLD_TAGLINE,
  getProductMetadataMode
} from '@/lib/site';

const { readPageCommercialReadinessMock } = vi.hoisted(() => ({
  readPageCommercialReadinessMock: vi.fn<() => Promise<boolean>>()
}));

vi.mock('@/lib/commercial-runtime', () => ({
  readPageCommercialReadiness: readPageCommercialReadinessMock
}));

vi.mock('next/font/google', () => ({
  Fraunces: () => ({ variable: '--font-fraunces' }),
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' })
}));

import { generateMetadata as generateFaqMetadata } from '@/app/faq/page';
import { dynamic as layoutDynamic, generateMetadata as generateLayoutMetadata } from '@/app/layout';
import { generateMetadata as generateHomeMetadata } from '@/app/page';

describe('product metadata mode', () => {
  beforeEach(() => {
    readPageCommercialReadinessMock.mockReset();
  });

  it('resolves readiness-dependent metadata at request time', () => {
    expect(layoutDynamic).toBe('force-dynamic');
  });

  it('selects the complete hold metadata mode without mixing in commercial copy', () => {
    expect(getProductMetadataMode(false)).toEqual({
      tagline: HOLD_TAGLINE,
      productDescription: HOLD_PRODUCT_META_DESCRIPTION,
      faqDescription: HOLD_FAQ_META_DESCRIPTION
    });
  });

  it('selects the complete commercial metadata mode without hold language', () => {
    expect(getProductMetadataMode(true)).toEqual({
      tagline: COMMERCIAL_TAGLINE,
      productDescription: COMMERCIAL_PRODUCT_META_DESCRIPTION,
      faqDescription: COMMERCIAL_FAQ_META_DESCRIPTION
    });
  });

  it.each([
    {
      commercialReady: false,
      tagline: HOLD_TAGLINE,
      productDescription: HOLD_PRODUCT_META_DESCRIPTION,
      faqDescription: HOLD_FAQ_META_DESCRIPTION
    },
    {
      commercialReady: true,
      tagline: COMMERCIAL_TAGLINE,
      productDescription: COMMERCIAL_PRODUCT_META_DESCRIPTION,
      faqDescription: COMMERCIAL_FAQ_META_DESCRIPTION
    }
  ])(
    'couples ordinary and Open Graph descriptions to the $commercialReady gate state',
    async ({ commercialReady, tagline, productDescription, faqDescription }) => {
      readPageCommercialReadinessMock.mockResolvedValue(commercialReady);

      const layoutMetadata = await generateLayoutMetadata();
      const homeMetadata = await generateHomeMetadata();
      const faqMetadata = await generateFaqMetadata();

      expect(layoutMetadata).toMatchObject({
        title: {
          default: `Snickerdoodle by Racoben Engineering — ${tagline}`,
          template: '%s | Snickerdoodle'
        },
        description: productDescription,
        openGraph: {
          title: `Snickerdoodle by Racoben Engineering — ${tagline}`,
          description: productDescription
        },
        twitter: {
          title: `Snickerdoodle by Racoben Engineering — ${tagline}`,
          description: productDescription
        }
      });
      expect(homeMetadata).toMatchObject({
        openGraph: {
          title: `Snickerdoodle by Racoben Engineering — ${tagline}`,
          description: productDescription
        }
      });
      expect(faqMetadata).toMatchObject({
        description: faqDescription,
        openGraph: { description: faqDescription }
      });
    }
  );
});
