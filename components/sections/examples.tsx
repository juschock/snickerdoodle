import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/site';

const examples = [
  {
    title: "Animal Rescue Adoption Drive",
    goal: "Get families to attend a weekend adoption event.",
    includes: "Warm emails, social posts featuring adoptable animals, flyer copy, press release, and reminders.",
  },
  {
    title: "Community Fundraiser",
    goal: "Raise $5,000 for a local cause.",
    includes: "Donor emails, social posts, landing page copy, CTAs, and a posting schedule.",
  },
  {
    title: "Local Business Open House",
    goal: "Bring local customers into the store.",
    includes: "Announcement copy, Facebook and Instagram posts, flyer copy, and reminder messages.",
  },
  {
    title: "Comedy Show Tonight",
    goal: "Sell remaining tickets quickly.",
    includes: "Urgent social posts, email copy, short CTAs, and day-of reminders.",
  },
  {
    title: "Class or Workshop",
    goal: "Get sign-ups before registration closes.",
    includes: "Educational positioning, email sequence, social posts, landing page copy, and a final reminder.",
  },
]

export function Examples() {
  return (
    <section id="examples" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="max-w-2xl">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Examples
          </span>
          <h2 className="mt-3 text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Example campaigns {PRODUCT_NAME} can support.
          </h2>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {examples.map((example) => (
            <article
              key={example.title}
              className="flex flex-col rounded-2xl border border-border bg-card p-6"
            >
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {example.title}
              </h3>
              <p className="mt-3 text-sm font-medium text-foreground">
                Goal:{" "}
                <span className="font-normal text-muted-foreground">{example.goal}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Kit includes: </span>
                {example.includes}
              </p>
            </article>
          ))}
        </div>

        <p className="mt-10">
          <Link
            href="/samples"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Explore sample campaign templates →
          </Link>
        </p>
      </div>
    </section>
  )
}
