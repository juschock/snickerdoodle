import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SampleKit } from '@/lib/sample-kits';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-5 space-y-5 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</div>
    </section>
  );
}

export function SampleKitPreview({ kit }: { kit: SampleKit }) {
  return (
    <div className="bg-secondary/30">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16">
        <Link href="/samples" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← All samples
        </Link>

        <div className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{kit.eyebrow}</p>
          <h1 className="mt-4 text-balance font-heading text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {kit.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{kit.summary}</p>
        </div>

        <div className="mt-6 max-w-3xl rounded-xl border border-primary/30 bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Fictional demonstration:</strong> every organization, event, person,
          offer, schedule, and outcome shown below is illustrative—not a real client or verified result. This is not an
          offer or a promise of service capacity. Do not use the sample as-is.
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</p>
            <p className="mt-2 font-medium text-foreground">{kit.campaignType}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary CTA</p>
            <p className="mt-2 font-medium text-foreground">{kit.primaryCta}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Secondary CTA</p>
            <p className="mt-2 font-medium text-foreground">{kit.secondaryCta}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tone</p>
            <p className="mt-2 font-medium text-foreground">{kit.tone.join(', ')}</p>
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            <Section title="Campaign goal">
              <p>{kit.goal}</p>
            </Section>

            <Section title="Audience">
              <ul className="grid gap-2 sm:grid-cols-2">
                {kit.audience.map((item) => (
                  <li key={item} className="rounded-xl bg-secondary/60 px-4 py-3 text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Email sequence preview">
              <div className="space-y-5">
                {kit.emails.map((email) => (
                  <article key={email.label} className="rounded-2xl border border-border bg-background p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {email.label} · {email.timing}
                    </p>
                    <h3 className="mt-3 font-heading text-xl font-semibold text-foreground">{email.subject}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{email.preview}</p>
                    <p className="mt-4">{email.body}</p>
                    <p className="mt-4 font-medium text-foreground">CTA: {email.cta}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Social post preview">
              <div className="grid gap-4 sm:grid-cols-2">
                {kit.socialPosts.map((post) => (
                  <article
                    key={`${post.platform}-${post.label}`}
                    className="rounded-2xl border border-border bg-background p-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{post.platform}</p>
                    <h3 className="mt-2 font-medium text-foreground">{post.label}</h3>
                    <p className="mt-3">{post.copy}</p>
                  </article>
                ))}
              </div>
            </Section>

            <Section title="Landing / event page copy preview">
              <article className="rounded-2xl border border-border bg-background p-5">
                <h3 className="font-heading text-2xl font-semibold text-foreground">{kit.landingPageCopy.headline}</h3>
                <p className="mt-2 text-lg text-muted-foreground">{kit.landingPageCopy.subhead}</p>
                <p className="mt-5">{kit.landingPageCopy.body}</p>

                <div className="mt-6">
                  <h4 className="font-medium text-foreground">Details</h4>
                  <ul className="mt-3 list-disc space-y-2 pl-5">
                    {kit.landingPageCopy.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  <h4 className="font-medium text-foreground">FAQ</h4>
                  <div className="mt-3 space-y-3">
                    {kit.landingPageCopy.faq.map((item) => (
                      <div key={item.q} className="rounded-xl bg-secondary/60 p-4">
                        <p className="font-medium text-foreground">{item.q}</p>
                        <p className="mt-1 text-muted-foreground">{item.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </Section>

            <Section title="Thank-you / follow-up copy">
              <p>{kit.followUpCopy}</p>
            </Section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-primary/30 bg-card p-6 shadow-sm">
              <h2 className="font-heading text-xl font-semibold text-foreground">CTA bank</h2>
              <ul className="mt-4 space-y-2">
                {kit.ctas.map((cta) => (
                  <li key={cta} className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-foreground">
                    {cta}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-heading text-xl font-semibold text-foreground">Posting schedule</h2>
              <div className="mt-4 space-y-4">
                {kit.postingSchedule.map((item) => (
                  <div key={`${item.timing}-${item.asset}`} className="border-l-2 border-primary pl-4">
                    <p className="font-medium text-foreground">{item.timing}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.asset}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.purpose}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-secondary/40 p-6">
              <h2 className="font-heading text-xl font-semibold text-foreground">Usage notes</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {kit.usageNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
