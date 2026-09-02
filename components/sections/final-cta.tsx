import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FIT_CHECK_CTA, FIT_CHECK_MAILTO } from "@/lib/site"

export function FinalCta() {
  return (
    <section className="bg-primary">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 md:py-24">
        <h2 className="text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-primary-foreground sm:text-4xl">
          Tell us what you&apos;re promoting. We&apos;ll turn it into a polished campaign execution package.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-primary-foreground">
          Tell us the campaign, deadline, audience, and primary action. We&apos;ll confirm whether the fixed-scope package fits before asking for a survey.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            variant="secondary"
            className="h-11 px-6 text-base"
            nativeButton={false}
            render={<a href={FIT_CHECK_MAILTO}>{FIT_CHECK_CTA}</a>}
          />
          <Button
            size="lg"
            nativeButton={false}
            className="h-11 border border-primary-foreground/30 bg-transparent px-6 text-base text-primary-foreground hover:bg-primary-foreground/10"
            render={<Link href="/samples">View a Full Sample</Link>}
          />
        </div>
      </div>
    </section>
  )
}
