import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { ckPath } from '@/lib/nav';
import { INTAKE_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Checkout status not confirmed',
  robots: { index: false, follow: false, nocache: true }
};

export default async function CheckoutCancelPage() {
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex flex-1 items-center bg-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
          <h1 className="font-heading text-3xl font-semibold">Checkout status not confirmed</h1>
          <p className="mt-4 text-muted-foreground">
            This page does not confirm whether payment completed or whether an order exists.{' '}
            {commercialReady
              ? <>If you know you canceled before paying, use your private intake link when you are ready to try again.</>
              : <>Checkout is not currently available.</>}{' '}
            If you may have paid or are unsure, do not retry; email{' '}
            <a className="underline" href={`mailto:${INTAKE_EMAIL}`}>{INTAKE_EMAIL}</a> so Racoben can confirm your
            status.
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
