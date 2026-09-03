import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { faqs } from '@/lib/content';
import { ckPath } from '@/lib/nav';
import {
  FIT_CHECK_CTA,
  FIT_CHECK_MAILTO,
  PRODUCT_NAME,
  PRODUCT_QUESTIONS_MAILTO,
  getProductMetadataMode,
  publicUrl
} from '@/lib/site';

const holdFaqs = [
  {
    q: `Is ${PRODUCT_NAME} accepting orders?`,
    a: 'No. The product remains in readiness review, and no service offer, capacity reservation, or fulfillment commitment is currently available.'
  },
  {
    q: 'Can I submit a private survey or make a payment?',
    a: 'No. Private intake and payment are unavailable while commercial readiness is on hold.'
  },
  {
    q: 'What are the public samples?',
    a: 'They are fictional demonstrations for product evaluation. They are not customer work, verified results, an offer, or a promise of deliverables or capacity.'
  },
  {
    q: 'Can I ask a product question?',
    a: 'Yes. You may email a product question, but that contact does not create an order, reserve capacity, or authorize work.'
  }
];

export async function generateMetadata(): Promise<Metadata> {
  const commercialReady = await readPageCommercialReadiness();
  const { faqDescription } = getProductMetadataMode(commercialReady);

  return {
    title: 'FAQ',
    description: faqDescription,
    alternates: { canonical: publicUrl('/faq') },
    openGraph: { title: `FAQ | ${PRODUCT_NAME}`, description: faqDescription, url: publicUrl('/faq') }
  };
}

export default async function FaqPage() {
  const commercialReady = await readPageCommercialReadiness();
  const displayedFaqs = commercialReady ? faqs : holdFaqs;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">FAQ</span>
            <h1 className="mt-3 text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Frequently asked questions
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              {commercialReady
                ? 'Everything you need to know before requesting a campaign fit check.'
                : 'Current availability, intake, payment, and sample status.'}
            </p>
          </div>

          <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card">
            {displayedFaqs.map((faq) => (
              <details key={faq.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium text-foreground">
                  {faq.q}
                  <Plus className="size-4 shrink-0 text-primary transition-transform group-open:rotate-45" />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {commercialReady ? (
              <Button size="lg" nativeButton={false} render={<a href={FIT_CHECK_MAILTO}>{FIT_CHECK_CTA}</a>} />
            ) : (
              <Button size="lg" nativeButton={false} render={<Link href="/samples">View fictional samples</Link>} />
            )}
            {!commercialReady && (
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<a href={PRODUCT_QUESTIONS_MAILTO}>Ask a product question</a>}
              />
            )}
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href={ckPath('/')}>Back to home</Link>} />
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
