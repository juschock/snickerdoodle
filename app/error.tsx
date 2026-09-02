'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main-content" className="flex min-h-screen items-center bg-secondary/30 px-4 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Something went wrong</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold text-foreground">We could not load this page.</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Try the request again. If the problem continues, return to the Snickerdoodle home page.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
