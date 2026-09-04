import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { publicSampleKits } from '@/lib/sample-kits';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { PRODUCT_NAME, publicUrl } from '@/lib/site';

const description = `Preview fictional ${PRODUCT_NAME} campaign package templates for nonprofits, local businesses, and community campaigns.`;

export const metadata: Metadata = {
  title: 'Campaign package templates',
  description,
  alternates: { canonical: publicUrl('/samples') },
  openGraph: { title: `Campaign package templates | ${PRODUCT_NAME}`, description, url: publicUrl('/samples') }
};

export default async function SamplesPage() {
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex-1 bg-secondary/30">
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Samples</p>
            <h1 className="mt-4 text-balance font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Explore fictional {PRODUCT_NAME} campaign package templates.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {commercialReady
                ? 'These fictional templates illustrate the structure, tone, and level of detail used in the current package design. Final materials depend on a separately accepted intake and order.'
                : 'These fictional templates are available only for product evaluation. They do not represent customer work, verified results, an offer, a deliverable promise, or current service capacity.'}
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {publicSampleKits.map((kit) => (
              <Link
                key={kit.slug}
                href={`/samples/${kit.slug}`}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary/40"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{kit.campaignType}</p>
                <h2 className="mt-3 font-heading text-2xl font-semibold text-foreground">{kit.title}</h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">{kit.summary}</p>
                <p className="mt-6 font-medium text-primary group-hover:underline">View template →</p>
              </Link>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h2 className="font-heading text-2xl font-semibold text-foreground">What these templates are — and are not</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              These are fictional templates. They do not represent real clients, real outcomes, or guaranteed
              performance. They are intended to show how {PRODUCT_NAME} organizes campaign copy, calls to action,
              reminders, and follow-up materials into a demonstration. Do not use them as-is.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
