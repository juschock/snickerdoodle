"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { SnickerdoodleMark } from "@/components/snickerdoodle-mark"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FIT_CHECK_CTA, FIT_CHECK_MAILTO, PRODUCT_NAME, PRODUCT_QUESTIONS_MAILTO } from "@/lib/site"

const commercialNavLinks = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "What You Get", href: "/#what-you-get" },
  { label: "Examples", href: "/#examples" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
]

const holdNavLinks = [
  { label: "Fictional Samples", href: "/samples" },
  { label: "FAQ", href: "/faq" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
]

export function SiteHeader({ commercialReady = false }: { commercialReady?: boolean }) {
  const [open, setOpen] = useState(false)
  const navLinks = commercialReady ? commercialNavLinks : holdNavLinks
  const primaryHref = commercialReady ? FIT_CHECK_MAILTO : "/samples"
  const primaryLabel = commercialReady ? FIT_CHECK_CTA : "View fictional samples"

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary/80 ring-1 ring-border/60">
            <SnickerdoodleMark className="size-5" />
          </span>
          <span className="font-heading text-xl font-semibold leading-none text-foreground sm:text-2xl">
            {PRODUCT_NAME}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground sm:text-sm">by Racoben</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button
            size="lg"
            nativeButton={false}
            render={commercialReady
              ? <a href={primaryHref}>{primaryLabel}</a>
              : <Link href={primaryHref}>{primaryLabel}</Link>}
          />
        </div>

        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg text-foreground md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={cn(
          "border-t border-border/70 bg-background md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="Mobile">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
          <Button
            size="lg"
            className="mt-2"
            nativeButton={false}
            render={commercialReady
              ? <a href={primaryHref} onClick={() => setOpen(false)}>{primaryLabel}</a>
              : <Link href={primaryHref} onClick={() => setOpen(false)}>{primaryLabel}</Link>}
          />
          {!commercialReady && (
            <a
              href={PRODUCT_QUESTIONS_MAILTO}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-center text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Ask a product question
            </a>
          )}
        </nav>
      </div>
    </header>
  )
}
