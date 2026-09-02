import Link from 'next/link';
import { CircleOff, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRODUCT_NAME, PRODUCT_QUESTIONS_MAILTO } from '@/lib/site';

export function CommercialHold() {
  return (
    <section className="bg-secondary/30">
      <div className="mx-auto grid min-h-[calc(100vh-8rem)] max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            Product-readiness review
          </span>
          <h1 className="mt-6 text-balance font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {PRODUCT_NAME} is not accepting orders.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Explore clearly labeled fictional campaign samples while the product, operating controls, and customer journey
            remain under review.
          </p>
          <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
            No service offer, private intake, payment, capacity reservation, or fulfillment commitment is currently available.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/samples">View fictional samples</Link>} />
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<a href={PRODUCT_QUESTIONS_MAILTO}>Ask a product question</a>}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-9">
          <CircleOff className="size-9 text-primary" aria-hidden="true" />
          <h2 className="mt-5 font-heading text-2xl font-semibold text-foreground">Commercial readiness is on hold</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Public availability will remain closed unless every retained offer, fulfillment, reviewer, legal, payment,
            monetary-approval, and go-to-market gate is resolved and recorded.
          </p>
          <p className="mt-5 rounded-xl bg-secondary/60 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            A sample is a fictional demonstration, not a customer result, offer, deliverable promise, or indication of current
            service capacity.
          </p>
        </div>
      </div>
    </section>
  );
}
