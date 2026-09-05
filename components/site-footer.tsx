import Link from "next/link"
import { FitCheckFallback } from "@/components/fit-check-fallback"
import { SnickerdoodleMark } from "@/components/snickerdoodle-mark"
import { FIT_CHECK_CTA, FIT_CHECK_MAILTO, INTAKE_EMAIL, PRODUCT_EXCLUSIONS_DISCLAIMER, PRODUCT_HOLD_DISCLAIMER, PRODUCT_NAME, PRODUCT_QUESTIONS_MAILTO } from "@/lib/site"

const commercialFooterLinks = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "What You Get", href: "/#what-you-get" },
  { label: "Examples", href: "/#examples" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
]

const holdFooterLinks = [
  { label: "Fictional Samples", href: "/samples" },
  { label: "FAQ", href: "/faq" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
]

export function SiteFooter({ commercialReady }: { commercialReady: boolean }) {
  const footerLinks = commercialReady ? commercialFooterLinks : holdFooterLinks

  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-secondary/80 ring-1 ring-border/60">
                <SnickerdoodleMark className="size-5" />
              </span>
              <span className="font-heading text-lg font-semibold text-foreground">
                {PRODUCT_NAME}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">by Racoben</span>
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {commercialReady
                ? "You have something to promote. We give you the words, structure, and campaign materials to promote it professionally."
                : "Snickerdoodle is not accepting orders yet. Payment, private intake, and fulfillment are unavailable."}
            </p>
          </div>

          <nav className="flex flex-col gap-3" aria-label="Footer">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Explore
            </span>
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-foreground transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {commercialReady ? "Get started" : "Product status"}
            </span>
            <a
              href={commercialReady ? FIT_CHECK_MAILTO : PRODUCT_QUESTIONS_MAILTO}
              className="text-sm text-foreground transition-colors hover:text-primary"
            >
              {commercialReady ? FIT_CHECK_CTA : "Ask a product question"}
            </a>
            {commercialReady ? <FitCheckFallback className="max-w-56" /> : null}
            {commercialReady ? (
              <Link
                href="/#what-you-get"
                className="text-sm text-foreground transition-colors hover:text-primary"
              >
                See What&apos;s Included
              </Link>
            ) : (
              <Link href="/samples" className="text-sm text-foreground transition-colors hover:text-primary">
                View fictional samples
              </Link>
            )}
            <Link href="/privacy" className="text-sm text-foreground transition-colors hover:text-primary">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm text-foreground transition-colors hover:text-primary">
              Terms
            </Link>
            <a
              href={`mailto:${INTAKE_EMAIL}`}
              className="text-sm text-foreground transition-colors hover:text-primary"
            >
              {commercialReady ? "Contact support" : "Contact site support"}
            </a>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {commercialReady ? PRODUCT_EXCLUSIONS_DISCLAIMER : PRODUCT_HOLD_DISCLAIMER}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Racoben. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
