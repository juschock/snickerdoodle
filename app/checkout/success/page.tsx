import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { ckPath } from '@/lib/nav';
import { INTAKE_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Checkout return received',
  robots: { index: false, follow: false, nocache: true }
};

export default async function CheckoutSuccessPage() {
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex flex-1 items-center bg-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
          <h1 className="font-heading text-3xl font-semibold">Checkout return received</h1>
          <p className="mt-4 text-muted-foreground">
            This page does not confirm payment or create a paid order. Racoben will separately confirm any paid order
            and delivery schedule by email. If you are unsure whether payment completed or do not receive that
            confirmation, email <a className="underline" href={`mailto:${INTAKE_EMAIL}`}>{INTAKE_EMAIL}</a> before
            trying checkout again. Please do not submit the same campaign again unless Racoben asks you to.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button nativeButton={false} render={<Link href="/samples">Review campaign templates</Link>} />
            <Button variant="outline" nativeButton={false} render={<Link href={ckPath('/')}>Back to Snickerdoodle</Link>} />
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
