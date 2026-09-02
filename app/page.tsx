import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Hero } from "@/components/sections/hero"
import { Problem } from "@/components/sections/problem"
import { WhoItsFor } from "@/components/sections/who-its-for"
import { CampaignTypes } from "@/components/sections/campaign-types"
import { WhatYouGet } from "@/components/sections/what-you-get"
import { HowItWorks } from "@/components/sections/how-it-works"
import { Examples } from "@/components/sections/examples"
import { UseAnywhere } from "@/components/sections/use-anywhere"
import { WhyDifferent } from "@/components/sections/why-different"
import { TrustLimitations } from "@/components/sections/trust-limitations"
import { Pricing } from "@/components/sections/pricing"
import { Faq } from "@/components/sections/faq"
import { FinalCta } from "@/components/sections/final-cta"
import { CommercialHold } from "@/components/commercial-hold"
import { readPageCommercialReadiness } from "@/lib/commercial-runtime"
import { PARENT_BRAND, PRODUCT_META_DESCRIPTION, PRODUCT_NAME, TAGLINE, publicUrl } from "@/lib/site"

export const metadata: Metadata = {
  alternates: { canonical: publicUrl('/') },
  openGraph: {
    type: 'website',
    url: publicUrl('/'),
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} by ${PARENT_BRAND} — ${TAGLINE}`,
    description: PRODUCT_META_DESCRIPTION
  }
}

export default async function Page() {
  const commercialReady = await readPageCommercialReadiness()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex-1">
        {commercialReady ? (
          <>
            <Hero />
            <Problem />
            <WhoItsFor />
            <CampaignTypes />
            <WhatYouGet />
            <HowItWorks />
            <Examples />
            <UseAnywhere />
            <WhyDifferent />
            <TrustLimitations />
            <Pricing />
            <Faq />
            <FinalCta />
          </>
        ) : (
          <CommercialHold />
        )}
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  )
}
