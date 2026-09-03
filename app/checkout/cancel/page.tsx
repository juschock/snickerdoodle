import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { ckPath } from '@/lib/nav';

export const metadata: Metadata = {
  title: 'Checkout canceled',
  robots: { index: false, follow: false, nocache: true }
};

export default async function CheckoutCancelPage() {
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex flex-1 items-center bg-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
          <h1 className="font-heading text-3xl font-semibold">Checkout canceled</h1>
          <p className="mt-4 text-muted-foreground">
            Stripe did not report a completed payment, so no paid order or delivery obligation was created. Return
            to your private intake link when you are ready to try again.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button nativeButton={false} render={<Link href="/samples">View fictional samples</Link>} />
            <Button variant="outline" nativeButton={false} render={<Link href={ckPath('/')}>Back to Snickerdoodle</Link>} />
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
