import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { CommercialHold } from '@/components/commercial-hold';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import {
  readPageCheckoutAvailability,
  readPageCommercialReadiness
} from '@/lib/commercial-runtime';
import { INTAKE_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Private Intake Status',
  description: 'Status information for Snickerdoodle private campaign intake and secure checkout.',
  robots: { index: false, follow: false }
};

export default async function BriefReceivedPage() {
  const [commercialReady, checkoutAvailable] = await Promise.all([
    readPageCommercialReadiness(),
    readPageCheckoutAvailability()
  ]);

  if (!commercialReady) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader commercialReady={false} />
        <main id="main-content" className="flex-1"><CommercialHold /></main>
        <SiteFooter commercialReady={false} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={true} />
      <main id="main-content" className="flex flex-1 items-center bg-secondary/30">
        <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6">
          <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden="true" />
          <h1 className="mt-5 text-balance font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {checkoutAvailable ? 'Thanks — we’re confirming your payment' : 'Your campaign survey was received'}
          </h1>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
            {checkoutAvailable
              ? 'This page does not confirm payment. Stripe will email a receipt if payment completed, and Racoben will separately confirm your paid order and delivery schedule. If you did not finish checkout, return to your private intake link.'
              : 'No order was created and no payment was collected. Racoben will review the campaign facts and reply through the email address you provided before any work begins.'}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            If you need to correct something, email <a className="underline" href={`mailto:${INTAKE_EMAIL}`}>{INTAKE_EMAIL}</a> instead of submitting duplicate surveys.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button nativeButton={false} render={<Link href="/samples">View fictional samples</Link>} />
            <Button variant="outline" nativeButton={false} render={<Link href="/">Return home</Link>} />
          </div>
        </div>
      </main>
      <SiteFooter commercialReady={true} />
    </div>
  );
}
