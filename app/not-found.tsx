import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';

export default async function NotFound() {
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex flex-1 items-center bg-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">404 · Page not found</p>
          <h1 className="mt-3 font-heading text-3xl font-semibold text-foreground">That page is not in this package.</h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            The link may be outdated, or the page may have moved.
          </p>
          <Link
            href="/"
            className="mt-7 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Return to Snickerdoodle
          </Link>
        </div>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
