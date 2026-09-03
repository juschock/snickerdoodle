export const PARENT_BRAND = 'Racoben Engineering';
export const PARENT_BRAND_LEGAL = 'Racoben Engineering, LLC';

/** Customer-facing product name — update here when rebranding. */
export const PRODUCT_NAME = 'Snickerdoodle';

/** Internal folder/order prefix (no spaces). Derived from PRODUCT_NAME. */
export const INTERNAL_ORDER_PREFIX = PRODUCT_NAME.replace(/\s+/g, '');

export const HOLD_TAGLINE = 'Fictional campaign samples for product evaluation.';
export const COMMERCIAL_TAGLINE = 'One survey. A complete campaign package.';
export const TAGLINE_LINE_1 = 'One survey.';
export const TAGLINE_LINE_2 = 'A complete campaign package.';
export const PACKAGE_LABEL = 'campaign execution package';
export const FIT_CHECK_CTA = 'Request a Fit Check';

export const HERO_PROMISE =
  'Campaign execution packages for nonprofits, community organizations, local businesses, and events.';

export const HERO_SUPPORT =
  'Human-reviewed campaign execution packages for nonprofits, community organizations, local businesses, and events. Everything you need to launch one coordinated campaign—with one survey.';

export const SITE_ORIGIN = 'https://racoben.com';

/** URL path under racoben.com — update alongside PRODUCT_NAME when rebranding. */
export const PUBLIC_PREFIX = '/snickerdoodle';

export const KIT_PRICE = '$99';
export const TERMS_VERSION = '2026-08-30';
export const INTAKE_EMAIL = process.env.NEXT_PUBLIC_SNICKERDOODLE_EMAIL ?? 'snickerdoodle@racoben.com';
export const FIT_CHECK_MAILTO = `mailto:${INTAKE_EMAIL}?subject=${encodeURIComponent('Snickerdoodle fit check')}&body=${encodeURIComponent('Campaign:\nDeadline:\nAudience:\nPrimary action:\n')}`;
export const PRODUCT_QUESTIONS_MAILTO = `mailto:${INTAKE_EMAIL}?subject=${encodeURIComponent('Snickerdoodle product question')}`;

export const PRODUCT_SCOPE_INTRO = `${PRODUCT_NAME} prepares complete, human-reviewed ${PACKAGE_LABEL}s for small organizations.`;

export const PRODUCT_LEGAL_DISCLAIMER = `${PRODUCT_NAME} provides campaign execution materials and planning support. It is not legal, fundraising compliance, tax, or advertising advice.`;

export const PRODUCT_EXCLUSIONS_DISCLAIMER = `${PRODUCT_NAME} provides campaign execution materials and planning support. It does not include custom graphic design, ad buying, email sending, social media posting, list management, or guaranteed campaign results.`;
export const PRODUCT_HOLD_DISCLAIMER = `${PRODUCT_NAME} is not currently offering or accepting campaign work. Public samples are fictional demonstrations only.`;

export const HOLD_PRODUCT_META_DESCRIPTION = `Explore clearly labeled fictional ${PRODUCT_NAME} campaign samples and check the product's current access status.`;
export const COMMERCIAL_PRODUCT_META_DESCRIPTION =
  'Human-reviewed campaign execution packages for nonprofits, community organizations, local businesses, and events.';
export const HOLD_FAQ_META_DESCRIPTION = `Current product-readiness status and fictional sample information for ${PRODUCT_NAME}.`;
export const COMMERCIAL_FAQ_META_DESCRIPTION =
  'Answers about Snickerdoodle campaign packages, pricing, checkout, fulfillment, and how the service works.';

export function getProductMetadataMode(commercialReady: boolean) {
  return commercialReady
    ? {
        tagline: COMMERCIAL_TAGLINE,
        productDescription: COMMERCIAL_PRODUCT_META_DESCRIPTION,
        faqDescription: COMMERCIAL_FAQ_META_DESCRIPTION
      }
    : {
        tagline: HOLD_TAGLINE,
        productDescription: HOLD_PRODUCT_META_DESCRIPTION,
        faqDescription: HOLD_FAQ_META_DESCRIPTION
      };
}

export function productPath(path: string = '/') {
  if (path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function publicUrl(path: string = '/') {
  if (path === '/') return `${SITE_ORIGIN}${PUBLIC_PREFIX}`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${PUBLIC_PREFIX}${normalized}`;
}

/** Public folder assets — Next Image does not always honor basePath in dev. */
export function publicAsset(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_PREFIX}${normalized}`;
}
