import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { INTAKE_EMAIL, KIT_PRICE, PRODUCT_LEGAL_DISCLAIMER, PRODUCT_NAME, TERMS_VERSION, publicUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms',
  alternates: { canonical: publicUrl('/terms') },
  openGraph: { title: `Terms | ${PRODUCT_NAME}`, url: publicUrl('/terms') }
};

export default async function TermsPage() {
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="font-heading text-3xl font-semibold text-foreground">Terms</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated August 30, 2026</p>
          <div className="mt-8 space-y-8 text-muted-foreground">
            {commercialReady ? (
              <>
                <section aria-labelledby="terms-service" className="space-y-3">
                  <h2 id="terms-service" className="font-heading text-xl font-semibold text-foreground">The service</h2>
                  <p>
                    {PRODUCT_NAME} prepares a campaign execution package from the information you provide. {PRODUCT_LEGAL_DISCLAIMER}{' '}
                    The normal delivery timeline begins only after Racoben confirms an order following any required payment and
                    receives a complete intake. Results are not guaranteed.
                  </p>
                </section>
                <section aria-labelledby="terms-responsibilities" className="space-y-3">
                  <h2 id="terms-responsibilities" className="font-heading text-xl font-semibold text-foreground">Your responsibilities</h2>
                  <p>
                    You agree to provide accurate information and materials you have permission to use. You are responsible for
                    reviewing names, dates, claims, links, legal requirements, and final details before publishing, and for using
                    the delivered materials lawfully on the platforms and channels available to you.
                  </p>
                </section>
                <section aria-labelledby="terms-orders" className="space-y-3">
                  <h2 id="terms-orders" className="font-heading text-xl font-semibold text-foreground">Orders, delivery, and support</h2>
                  <p>
                    The package price is a one-time {KIT_PRICE} USD payment. Checkout does not automatically add tax while Racoben
                    completes its current tax-treatment review. The normal 48-hour delivery window begins only after successful
                    payment, Racoben&apos;s order confirmation, and receipt of a complete, usable intake. Racoben may pause that window
                    while waiting for missing information, clarification, approvals, or materials from you.
                  </p>
                  <p>
                    A fit check or survey submission does not create an order, charge you, reserve capacity, or authorize Racoben
                    to begin work. Racoben will confirm the next step before any order or fulfillment begins.
                  </p>
                  <p>
                    Checkout requires consent to these terms. The durable checkout record binds that consent to terms version{' '}
                    {TERMS_VERSION}; a browser redirect alone never proves payment or creates a paid order.
                  </p>
                  <p>
                    For order, delivery, cancellation, or refund questions, email{' '}
                    <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${INTAKE_EMAIL}`}>{INTAKE_EMAIL}</a>.
                  </p>
                </section>
                <section aria-labelledby="terms-cancellations" className="space-y-3">
                  <h2 id="terms-cancellations" className="font-heading text-xl font-semibold text-foreground">
                    Cancellations, corrections, and refunds
                  </h2>
                  <p>
                    You may cancel for a full refund before Racoben begins substantive fulfillment. If Racoben misses an unpaused
                    48-hour delivery window, you may cancel for a full refund instead of continuing the order.
                  </p>
                  <p>
                    Report a material failure to match the confirmed package scope within seven calendar days after delivery. You
                    may choose one reasonable correction or a full refund. Refunds are not available for campaign results,
                    third-party platform decisions or performance, or delays caused by incomplete information, late feedback,
                    unavailable approvals, or other customer-controlled circumstances.
                  </p>
                  <p>Approved refunds are returned to the original payment method.</p>
                </section>
                <section aria-labelledby="terms-materials" className="space-y-3">
                  <h2 id="terms-materials" className="font-heading text-xl font-semibold text-foreground">Materials and revisions</h2>
                  <p>
                    You retain ownership of the materials you provide. You may use completed campaign materials delivered for
                    your organization or campaign. Third-party rights and the revision scope stated with an order still apply.
                  </p>
                </section>
              </>
            ) : (
              <>
                <section aria-labelledby="terms-status" className="space-y-3">
                  <h2 id="terms-status" className="font-heading text-xl font-semibold text-foreground">Current product status</h2>
                  <p>
                    {PRODUCT_NAME} is not currently offering or accepting campaign work, orders, payments, private intake,
                    capacity reservations, or fulfillment commitments.
                  </p>
                  <p>Emailing a product question does not create an order, reserve capacity, or authorize work.</p>
                </section>
                <section aria-labelledby="terms-samples" className="space-y-3">
                  <h2 id="terms-samples" className="font-heading text-xl font-semibold text-foreground">Fictional samples</h2>
                  <p>
                    Public samples are fictional demonstrations for evaluation. They are not customer work, verified outcomes,
                    an offer, a deliverable promise, or an indication of current service capacity. Do not use them as-is.
                  </p>
                </section>
                <section aria-labelledby="terms-site-use" className="space-y-3">
                  <h2 id="terms-site-use" className="font-heading text-xl font-semibold text-foreground">Site use</h2>
                  <p>
                    You may review the public site and fictional samples for lawful informational purposes. Third-party names,
                    trademarks, platforms, and services remain subject to their owners’ rights and terms.
                  </p>
                </section>
              </>
            )}
            <section aria-labelledby="terms-changes" className="space-y-3">
              <h2 id="terms-changes" className="font-heading text-xl font-semibold text-foreground">
                Changes and contact
              </h2>
              <p>
                We may update these terms as the service changes. The date above identifies the current version. Questions
                about these terms can be sent to{' '}
                <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${INTAKE_EMAIL}`}>
                  {INTAKE_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
