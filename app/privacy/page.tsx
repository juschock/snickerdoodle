import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  readPageCheckoutAvailability,
  readPageCommercialReadiness
} from '@/lib/commercial-runtime';
import { INTAKE_EMAIL, PARENT_BRAND_LEGAL, PRODUCT_NAME, publicUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy',
  alternates: { canonical: publicUrl('/privacy') },
  openGraph: { title: `Privacy | ${PRODUCT_NAME}`, url: publicUrl('/privacy') }
};

export default async function PrivacyPage() {
  const [commercialReady, checkoutAvailable] = await Promise.all([
    readPageCommercialReadiness(),
    readPageCheckoutAvailability()
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-foreground">Privacy</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated August 30, 2026</p>
          <div className="mt-8 space-y-8 text-muted-foreground">
            <section aria-labelledby="privacy-information" className="space-y-3">
              <h2 id="privacy-information" className="font-heading text-xl font-semibold text-foreground">
                Information we collect
              </h2>
              <p>
                {commercialReady
                  ? `${PRODUCT_NAME} collects contact, organization, campaign, audience, schedule, and delivery information submitted through a fit-check email or the private campaign survey. We also keep intake, order when applicable, and support records needed to provide the service.`
                  : `${PRODUCT_NAME} does not currently provide private campaign intake or checkout. If you email a product question, we receive the address, message, and other information you choose to include.`}
              </p>
              <p>
                Provider analytics is off by default. If Racoben explicitly enables it later, analytics remains suppressed on the
                private survey and receipt subtree, and query strings and fragments are removed from allowed public-page events.
                Privacy-safe operational error events may still be recorded to protect and keep the service reliable.
              </p>
            </section>
            <section aria-labelledby="privacy-use" className="space-y-3">
              <h2 id="privacy-use" className="font-heading text-xl font-semibold text-foreground">
                How we use information
              </h2>
              <p>
                {PARENT_BRAND_LEGAL} uses collected information to respond to product questions, provide support, prevent abuse,
                maintain business records, and improve the site. {commercialReady
                  ? 'When commercial intake is available, it is also used to process requests and prepare and deliver campaign materials. '
                  : ''}
                We do not sell your personal information.
              </p>
            </section>
            <section aria-labelledby="privacy-providers" className="space-y-3">
              <h2 id="privacy-providers" className="font-heading text-xl font-semibold text-foreground">
                Service providers and access
              </h2>
              <p>
                Information is available only to authorized personnel and service providers needed to operate the site, such as
                hosting, database, analytics, and email providers. Those providers process information under their own terms and
                privacy practices.
              </p>
              <p>
                A validated server submission creates a durable intake record before any checkout redirect. The manager queue
                contains receipt state, payment state, order reference when applicable, and the accepted terms version—but no raw
                survey answers, delivery email, card information, Stripe payload, or customer secret. Queue access requires an
                active owner and a live authenticated session and is itself audited.
              </p>
              <p>
                {checkoutAvailable
                  ? 'Stripe processes checkout and payment information. Racoben does not receive or store a full payment card number. Do not include passwords, payment card numbers, health records, government identifiers, or other unnecessary sensitive information in the campaign survey.'
                  : `Payment collection is currently unavailable. If an approved payment implementation launches later, its payment provider would process checkout information; Racoben would not receive or store a full payment card number. ${commercialReady
                    ? 'Do not include passwords, payment card numbers, health records, government identifiers, or other unnecessary sensitive information in the campaign survey.'
                    : 'Private intake is also unavailable. Do not email passwords, payment card numbers, health records, government identifiers, or other unnecessary sensitive information.'}`}
              </p>
            </section>
            <section aria-labelledby="privacy-retention" className="space-y-3">
              <h2 id="privacy-retention" className="font-heading text-xl font-semibold text-foreground">
                Retention and security
              </h2>
              <p>
                We retain information only as long as reasonably needed to provide the service, resolve disputes, maintain
                required business records, and meet legal obligations. We use access controls and other reasonable safeguards,
                but no online service can guarantee absolute security.
              </p>
            </section>
            <section aria-labelledby="privacy-choices" className="space-y-3">
              <h2 id="privacy-choices" className="font-heading text-xl font-semibold text-foreground">
                Your choices
              </h2>
              <p>
                To ask what information we hold about you, request a correction or deletion, or raise a privacy concern, email{' '}
                <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${INTAKE_EMAIL}`}>
                  {INTAKE_EMAIL}
                </a>
                . We may need to retain limited records when required for legal, security, or accounting purposes.
              </p>
              <p>
                Requests are verified before disclosure, correction, export, or deletion. Deletion may remove customer content
                while retaining the minimum payment, refund, dispute, fraud-prevention, security, and accounting records required
                by law or needed to establish and defend legal rights.
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
