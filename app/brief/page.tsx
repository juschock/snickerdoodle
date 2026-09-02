import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Clock } from 'lucide-react';
import { BriefAccessGate } from '@/components/brief-access-gate';
import { BriefFragmentCleanup } from '@/components/brief-fragment-cleanup';
import { CommercialHold } from '@/components/commercial-hold';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  BRIEF_ACCESS_COOKIE_NAME,
  validateBriefAccessToken
} from '@/lib/checkout-security';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { PRODUCT_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Private Campaign Intake',
  description: `${PRODUCT_NAME} private campaign intake and secure checkout.`,
  referrer: 'no-referrer',
  robots: { index: false, follow: false }
};

export default async function BriefPage() {
  const commercialReady = await readPageCommercialReadiness();

  if (!commercialReady) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader commercialReady={false} />
        <main id="main-content" className="flex-1">
          <BriefFragmentCleanup />
          <CommercialHold />
        </main>
        <SiteFooter commercialReady={false} />
      </div>
    );
  }

  const candidateToken = (await cookies()).get(BRIEF_ACCESS_COOKIE_NAME)?.value ?? null;
  const securitySecret = process.env.CHECKOUT_SECURITY_SECRET;
  const hasAccess = Boolean(
    candidateToken &&
    securitySecret &&
    securitySecret.length >= 32 &&
    validateBriefAccessToken(candidateToken, securitySecret)
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={true} />
      <main id="main-content" className="flex-1 bg-secondary/30">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5 text-primary" />
              Private qualified-project intake · Most surveys take 5–10 minutes
            </span>
            <h1 className="mt-5 text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Start your {PRODUCT_NAME} campaign survey
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              You do not need perfect copy here. Just give us the facts, goals, links, tone, and the action you want
              people to take.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              Tell us about your campaign, then continue to Stripe&apos;s secure hosted checkout. Racoben confirms the
              order after payment and follows up if any material fact is missing.
            </p>
          </div>

          <div className="mt-10">
            <BriefAccessGate hasAccess={hasAccess} />
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={true} />
    </div>
  );
}
