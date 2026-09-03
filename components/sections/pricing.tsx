import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FIT_CHECK_CTA, FIT_CHECK_MAILTO, PRODUCT_EXCLUSIONS_DISCLAIMER } from "@/lib/site"

const includes = [
  "3-email sequence",
  "10 social posts",
  "Landing / event page copy",
  "Flyer copy",
  "Press release",
  "Subject line bank",
  "CTA bank",
  "Posting schedule",
  "Human review",
  "Normally delivered within 48 hours after Racoben confirms the order following any required payment and receives a complete intake",
]

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Pricing
          </span>
          <h2 className="mt-3 text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            One simple price. One complete package.
          </h2>
          <p className="mt-3 text-muted-foreground">Introductory price for early customers.</p>
        </div>

        <div className="mx-auto mt-10 max-w-xl">
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/50 p-8 text-center">
              <p className="font-heading text-lg font-semibold text-foreground">Campaign Execution Package</p>
              <p className="mt-2">
                <span className="font-heading text-5xl font-semibold text-foreground">$99</span>
                <span className="ml-2 text-sm text-muted-foreground">one-time</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Not a subscription.</p>
            </div>

            <div className="p-8">
              <ul className="grid gap-3 sm:grid-cols-2">
                {includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="mt-8 h-11 w-full text-base"
                nativeButton={false}
                render={<a href={FIT_CHECK_MAILTO}>{FIT_CHECK_CTA}</a>}
              />

              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                {PRODUCT_EXCLUSIONS_DISCLAIMER}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
