import { PRODUCT_NAME } from '@/lib/site';

const uses = [
  'Paste emails into Mailchimp or Constant Contact.',
  'Post text copy on Facebook, Instagram, LinkedIn, or X.',
  'Add landing page copy to Eventbrite, Givebutter, GoFundMe, Squarespace, WordPress, or your own website.',
  'Use flyer copy in Canva or a printed handout.',
  'Send the press release to local newspapers, newsletters, radio, schools, churches, or partners.',
  'Share the posting schedule with staff or volunteers.'
];

export function UseAnywhere() {
  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Editable delivery</p>
            <h3 className="mt-4 font-heading text-2xl font-semibold text-foreground">A practical handoff, not another dashboard.</h3>
            <dl className="mt-6 grid gap-4">
              <div className="rounded-xl bg-secondary/40 p-4">
                <dt className="text-sm font-semibold text-foreground">Organized by channel</dt>
                <dd className="mt-1 text-sm text-muted-foreground">Find the email, social, page, print, and schedule material quickly.</dd>
              </div>
              <div className="rounded-xl bg-secondary/40 p-4">
                <dt className="text-sm font-semibold text-foreground">Facts stay aligned</dt>
                <dd className="mt-1 text-sm text-muted-foreground">Dates, links, prices, and calls to action come from one confirmed source.</dd>
              </div>
              <div className="rounded-xl bg-secondary/40 p-4">
                <dt className="text-sm font-semibold text-foreground">Ready for your tools</dt>
                <dd className="mt-1 text-sm text-muted-foreground">Copy, paste, adapt, print, or hand the package to your team.</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <h2 className="text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Use your package anywhere you already promote your work.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            {PRODUCT_NAME} is connective tissue, not another platform to learn. Drop the materials straight into the
            tools and channels you already use.
          </p>
          <ul className="mt-6 space-y-3">
            {uses.map((use) => (
              <li key={use} className="flex items-start gap-3 text-sm text-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span className="leading-relaxed">{use}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
