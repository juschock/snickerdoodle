import Link from 'next/link';
import { Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FitCheckFallback } from '@/components/fit-check-fallback';
import {
  HERO_PROMISE,
  FIT_CHECK_CTA,
  FIT_CHECK_MAILTO,
  PRODUCT_NAME,
  TAGLINE_LINE_1,
  TAGLINE_LINE_2
} from '@/lib/site';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
        <div>
          <h1 className="text-balance font-heading text-5xl font-semibold leading-[1.02] tracking-tight text-foreground sm:text-6xl md:text-7xl">
            {PRODUCT_NAME}
          </h1>

          <p className="mt-4 max-w-xl text-balance font-heading text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
            {TAGLINE_LINE_1}
            <br />
            {TAGLINE_LINE_2}
          </p>

          <p className="mt-6 max-w-xl text-pretty text-xl leading-relaxed text-foreground sm:text-2xl sm:leading-relaxed">
            {HERO_PROMISE}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-col items-start gap-1">
              <Button
                size="lg"
                className="h-12 px-7 text-base"
                nativeButton={false}
                render={<a href={FIT_CHECK_MAILTO}>{FIT_CHECK_CTA}</a>}
              />
              <FitCheckFallback className="max-w-64" />
            </div>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base"
              nativeButton={false}
              render={<Link href="/samples">Explore Sample Templates</Link>}
            />
          </div>

          <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-3.5 shrink-0 text-primary" />
            Normally delivered within 48 hours after Racoben confirms the order following any required payment and receives a complete intake · Prepared and human-reviewed by Racoben
          </p>

          <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              You receive ready-to-use copy and campaign materials. You stay in control of where and how you publish
              them.
            </span>
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-secondary/60" aria-hidden="true" />
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">One coordinated package</p>
            <p className="mt-4 font-heading text-3xl font-semibold leading-tight text-foreground">
              One audience. One action. Every channel doing a clear job.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {['Email sequence', 'Social posts', 'Landing-page copy', 'Flyer copy', 'Calls to action', 'Posting schedule'].map((item) => (
                <div key={item} className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium text-foreground">
                  {item}
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Built from confirmed facts and reviewed by a person before delivery.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
