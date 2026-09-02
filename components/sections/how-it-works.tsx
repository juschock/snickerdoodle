import { Button } from "@/components/ui/button"
import { FIT_CHECK_CTA, FIT_CHECK_MAILTO } from "@/lib/site"

const steps = [
  {
    step: "01",
    title: "Request a fit check",
    body: "Tell us the campaign, deadline, audience, and primary action. We will confirm whether the fixed scope fits.",
    meta: "No payment or sales call required.",
  },
  {
    step: "02",
    title: "Complete the private survey",
    body: "Qualified projects receive a private survey link for the facts and materials Racoben needs.",
  },
  {
    step: "03",
    title: "Confirm and pay once",
    body: "Racoben reviews the intake, confirms the fixed scope, and sends the approved project through secure checkout for one $99 USD payment.",
  },
  {
    step: "04",
    title: "You receive a human-reviewed package",
    body: "The normal 48-hour window starts after successful payment, Racoben order confirmation, and a complete usable intake.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">
              How it works
            </span>
            <h2 className="mt-3 text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              One survey in. A complete campaign execution package out.
            </h2>
          </div>
          <Button size="lg" nativeButton={false} render={<a href={FIT_CHECK_MAILTO}>{FIT_CHECK_CTA}</a>} />
        </div>

        <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.step} className="relative rounded-2xl border border-border bg-card p-6">
              <span className="font-heading text-2xl font-semibold text-primary">{step.step}</span>
              <h3 className="mt-3 font-heading text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {step.meta ? (
                <p className="mt-3 text-xs font-medium text-accent-foreground">{step.meta}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
