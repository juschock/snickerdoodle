import {
  Mail,
  Share2,
  LayoutTemplate,
  Printer,
  Newspaper,
  Type,
  MousePointerClick,
  CalendarClock,
  UserCheck,
} from "lucide-react"

const deliverables = [
  {
    icon: Mail,
    title: "Email Sequence",
    body: "A 3-email sequence you can paste into your email tool: announcement, reminder, and final call.",
  },
  {
    icon: Share2,
    title: "Social Media Posts",
    body: "10 ready-to-use text posts adapted for the channels you select — Facebook, Instagram, LinkedIn, X, and local communities.",
  },
  {
    icon: LayoutTemplate,
    title: "Landing / Event Page Copy",
    body: "A clean page structure with headline, subheadline, event details, why it matters, what to expect, and a call-to-action.",
  },
  {
    icon: Printer,
    title: "Flyer Copy",
    body: "Short, printable copy for a flyer, poster, handout, or counter sign. This is copy, not custom graphic design.",
  },
  {
    icon: Newspaper,
    title: "Press Release",
    body: "A simple local press release for newspapers, community calendars, radio stations, newsletters, or partner organizations.",
  },
  {
    icon: Type,
    title: "Subject Line Bank",
    body: "10–15 subject lines so you are never stuck trying to name the campaign email.",
  },
  {
    icon: MousePointerClick,
    title: "CTA Bank",
    body: "Clear calls-to-action for donations, tickets, sign-ups, attendance, visits, bookings, or inquiries.",
  },
  {
    icon: CalendarClock,
    title: "Posting Schedule",
    body: "A simple suggested schedule showing when to send emails and post reminders, from announcement to follow-up.",
  },
  {
    icon: UserCheck,
    title: "Human Review",
    body: "Every package is prepared and reviewed by Racoben before delivery for clarity, tone, accuracy, and usability.",
  },
]

export function WhatYouGet() {
  return (
    <section id="what-you-get" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="max-w-2xl">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            What you get
          </span>
          <h2 className="mt-3 text-balance font-heading text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Everything you need to start promoting.
          </h2>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {deliverables.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-card p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
                <item.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
