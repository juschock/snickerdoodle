import { PRODUCT_NAME } from './site';
import { PUBLIC_SAMPLE_SLUGS } from './campaign-templates';

export type SampleEmail = {
  label: string;
  subject: string;
  preview: string;
  timing: string;
  body: string;
  cta: string;
};

export type SampleSocialPost = {
  platform: 'Facebook' | 'Instagram' | 'LinkedIn' | 'X';
  label: string;
  copy: string;
};

export type SampleKit = {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  campaignType: string;
  goal: string;
  audience: string[];
  primaryCta: string;
  secondaryCta: string;
  tone: string[];
  emails: SampleEmail[];
  socialPosts: SampleSocialPost[];
  landingPageCopy: {
    headline: string;
    subhead: string;
    body: string;
    details: string[];
    faq: { q: string; a: string }[];
  };
  ctas: string[];
  postingSchedule: { timing: string; asset: string; purpose: string }[];
  followUpCopy: string;
  usageNotes: string[];
};

export const sampleKits: SampleKit[] = [
  {
    slug: 'adoption-event',
    title: 'Animal Rescue Adoption Event',
    eyebrow: 'Fictional campaign template',
    campaignType: 'Adoption event',
    summary:
      'A fictional campaign template for a local animal rescue hosting a weekend adoption event and asking the community to attend, share, foster, or donate.',
    goal: 'Drive event attendance, increase pet visibility, and create secondary support from people who cannot adopt right now.',
    audience: ['local families', 'animal lovers', 'past adopters', 'foster volunteers', 'rescue supporters'],
    primaryCta: 'Attend the adoption event',
    secondaryCta: 'Share, foster, or donate if you cannot attend',
    tone: ['warm', 'hopeful', 'community-centered', 'specific', 'not guilt-heavy'],
    emails: [
      {
        label: 'Announcement',
        subject: 'Meet your next best friend this Saturday',
        preview: 'Join us for an adoption event full of second chances.',
        timing: 'Send 7–10 days before the event',
        body:
          'This Saturday, Meadowline Animal Rescue is bringing adoptable pets, foster volunteers, and future families together for one hopeful afternoon. If you have been thinking about adopting — or know someone who has — this is a simple way to meet animals who are ready for a safe, loving home. Stop by, ask questions, meet the team, and help one more pet get seen by the right person.',
        cta: 'Reserve your visit'
      },
      {
        label: 'Story / Reason to Care',
        subject: 'Meet Milo, a friendly three-year-old looking for a home',
        preview: 'Milo is the fictional featured pet in this example campaign.',
        timing: 'Send 3–5 days before the event',
        body:
          'For this fictional campaign, Milo is a three-year-old mixed-breed dog with a gentle, curious personality. He enjoys relaxed walks, settles comfortably near people, and will be among the adoptable pets at Saturday’s event. Come meet Milo, talk with the Meadowline team, and learn whether his needs fit your home.',
        cta: 'Meet Milo and other adoptable pets'
      },
      {
        label: 'Last Call',
        subject: "Last call for Saturday's adoption event",
        preview: 'We would love to see you — and so would the pets still waiting.',
        timing: 'Send 24–48 hours before the event',
        body:
          'Our adoption event is almost here. If you are planning to stop by, now is the time to save the details, invite a friend, and come ready to meet animals who are waiting for their next chapter. Not adopting right now? You can still help by sharing the event or making a small gift to support food, transport, and care.',
        cta: 'Attend or support the event'
      }
    ],
    socialPosts: [
      {
        platform: 'Facebook',
        label: 'Launch post',
        copy:
          'We are hosting an adoption event this Saturday, and we would love to introduce you to some incredible pets looking for a fresh start. Come meet adoptable dogs and cats, talk with our team, and help one more animal find home.'
      },
      {
        platform: 'Facebook',
        label: 'Share ask',
        copy:
          'Not adopting right now? You can still help. Share our adoption event with a friend, neighbor, coworker, or family member who has been thinking about adding a pet to the family.'
      },
      {
        platform: 'Instagram',
        label: 'Countdown caption',
        copy:
          'New beginnings start here. Join us this Saturday to meet adoptable pets and help us turn "still waiting" into "finally home."'
      },
      {
        platform: 'Instagram',
        label: 'Featured pet caption',
        copy:
          'Meet Milo, the fictional featured pet in this example campaign. He is a gentle, curious three-year-old who enjoys relaxed walks and will be at Saturday’s Meadowline adoption event. Stop by and say hello.'
      },
      {
        platform: 'LinkedIn',
        label: 'Community frame',
        copy:
          'This weekend, Meadowline Animal Rescue is hosting an adoption event to connect local families with animals ready for permanent homes. Community turnout matters: every share, visit, and introduction helps more people discover the event.'
      },
      {
        platform: 'LinkedIn',
        label: 'Volunteer appreciation',
        copy:
          'Adoption events are built by volunteers, fosters, donors, and neighbors who decide that local animal welfare is worth showing up for. We are grateful to everyone helping make this weekend possible.'
      },
      {
        platform: 'X',
        label: 'Short launch',
        copy: 'Adoption event this Saturday. Come meet pets looking for home — and help us spread the word.'
      },
      {
        platform: 'X',
        label: 'Day-before reminder',
        copy:
          'Tomorrow is adoption day. Save the details, invite a friend, and come meet animals waiting for a fresh start.'
      }
    ],
    landingPageCopy: {
      headline: 'Meet adoptable pets this Saturday',
      subhead: 'Join Meadowline Animal Rescue for a fictional community adoption-event example.',
      body:
        'If you have been thinking about adopting, fostering, volunteering, or simply helping local rescue animals get seen, this event is for you. You will be able to meet adoptable pets, talk with volunteers, learn about the adoption process, and support the care that makes each placement possible.',
      details: [
        'Date: Saturday, October 15',
        'Time: 11:00 AM – 4:00 PM',
        'Location: Meadowline Park Pavilion, 400 Lantern Lane, Brookhaven (fictional)',
        'Primary action: Reserve a visit or attend during event hours',
        'Secondary action: Share the event or donate to support adoption-day care'
      ],
      faq: [
        {
          q: 'Do I need to be ready to adopt that day?',
          a: 'No. You are welcome to attend, ask questions, meet the team, and learn more about the process.'
        },
        {
          q: 'Can I help if I cannot adopt?',
          a: 'Yes. Sharing the event, fostering, volunteering, or donating all help pets get closer to home.'
        }
      ]
    },
    ctas: [
      'Reserve your visit',
      'Meet adoptable pets',
      'Help a pet get seen',
      'Share the event',
      'Support adoption-day care',
      'Come meet your match',
      "Can't attend? Donate today",
      'Invite a friend who loves animals'
    ],
    postingSchedule: [
      { timing: '10 days before', asset: 'Announcement email + Facebook launch post', purpose: 'Start awareness' },
      { timing: '7 days before', asset: 'Featured pet story', purpose: 'Create emotional connection' },
      { timing: '5 days before', asset: 'Instagram countdown + LinkedIn community post', purpose: 'Broaden reach' },
      { timing: '2 days before', asset: 'Reminder email + share ask', purpose: 'Prompt action' },
      { timing: 'Day of', asset: 'Today post + short X updates', purpose: 'Drive final turnout' },
      { timing: 'Day after', asset: 'Thank-you post/email', purpose: 'Steward supporters and invite next action' }
    ],
    followUpCopy:
      'Thank you for showing up for the animals this weekend. Whether you attended, adopted, shared the event, donated, or encouraged a friend to stop by, you helped more pets get seen. If you are still looking for a way to help, fostering, volunteering, and monthly support all keep this work moving after adoption day ends.',
    usageNotes: [
      'Replace all fictional organization, date, time, and location details before use.',
      'Use pet stories only when they are verified and approved by the organization.',
      'Avoid extreme sadness or guilt-heavy language; keep the tone hopeful and community-centered.'
    ]
  },
  {
    slug: 'year-end-appeal',
    title: 'Nonprofit Year-End Appeal',
    eyebrow: 'Fictional campaign template',
    campaignType: 'Year-end fundraising appeal',
    summary:
      'A fictional campaign template for a small nonprofit asking supporters to make a year-end gift before December 31.',
    goal: 'Raise year-end donations, remind existing supporters why the work matters, and invite recurring support.',
    audience: ['past donors', 'newsletter subscribers', 'volunteers', 'lapsed supporters', 'community partners'],
    primaryCta: 'Make a year-end gift',
    secondaryCta: 'Become a monthly donor',
    tone: ['grateful', 'mission-centered', 'specific', 'donor-respecting', 'deadline-aware'],
    emails: [
      {
        label: 'Launch',
        subject: 'Before the year ends, help us keep this work going',
        preview: 'A year-end gift today helps us begin January ready, not behind.',
        timing: 'Send 3–4 weeks before December 31',
        body:
          'As the year comes to a close, Copper Lantern Community Aid is asking its community to help carry this fictional mission into the next one. In this example, the organization runs a weekly grocery pickup and a resource-navigation desk. A year-end gift helps cover grocery supplies, translated resource guides, and local transit passes so the program can begin January ready to serve.',
        cta: 'Make your year-end gift'
      },
      {
        label: 'Story / Impact',
        subject: 'What one gift can do before we turn the calendar',
        preview: 'See how an illustrative $50 gift connects to a defined program cost.',
        timing: 'Send 10–14 days before December 31',
        body:
          'In this fictional campaign, a $50 gift is described as helping cover one grocery box and two local transit passes for a scheduled community pickup. The example gives supporters a concrete view of how one gift could support the Community Resource Desk without presenting an invented beneficiary or guaranteed outcome.',
        cta: 'Give before December 31'
      },
      {
        label: 'Final Days',
        subject: 'We are in the final days of the year',
        preview: 'If you have been meaning to give, now is the moment.',
        timing: 'Send in the final 3–5 days of the year',
        body:
          'We are now in the final stretch of the year-end campaign. If this mission matters to you, please make your gift before the calendar turns. If you would rather support this work month after month, you can also become a recurring donor and help us start the year with dependable momentum.',
        cta: 'Give now or become a monthly donor'
      }
    ],
    socialPosts: [
      {
        platform: 'Facebook',
        label: 'Launch post',
        copy:
          'The final weeks of the year are here, and we are asking our community to help us finish strong. Your year-end gift supports work that continues long after the holidays are over.'
      },
      {
        platform: 'Facebook',
        label: 'Impact post',
        copy:
          'In this fictional campaign, a $50 year-end gift helps cover one grocery box and two local transit passes for a scheduled community pickup. Every gift moves the Community Resource Desk closer to its winter campaign goal.'
      },
      {
        platform: 'Instagram',
        label: 'Mission caption',
        copy:
          'Year-end giving is here. If this mission has mattered to you this year, this is the moment to help carry it into the next one.'
      },
      {
        platform: 'Instagram',
        label: 'Countdown caption',
        copy:
          'We are in the final days of the year-end campaign. If you have been meaning to give, we would be grateful for your support today.'
      },
      {
        platform: 'LinkedIn',
        label: 'Professional frame',
        copy:
          'Year-end giving is a crucial moment for many nonprofits because it helps determine how strongly they enter the new year. We are inviting our community to help us start January ready to serve.'
      },
      {
        platform: 'LinkedIn',
        label: 'Recurring donor frame',
        copy:
          'Recurring donors provide something every nonprofit values: predictability. If a one-time gift is not the best fit, monthly support can be even more useful over time.'
      },
      {
        platform: 'X',
        label: 'Short launch',
        copy:
          'Our year-end campaign is underway. If this mission matters to you, now is the time to help carry it into next year.'
      },
      {
        platform: 'X',
        label: 'Final reminder',
        copy: 'Final days before year-end. Help us finish strong and begin the new year ready to serve.'
      }
    ],
    landingPageCopy: {
      headline: 'Help us start the new year ready to serve',
      subhead: 'Your year-end gift helps sustain practical care, steady support, and community-centered service.',
      body:
        'Copper Lantern Community Aid is a fictional nonprofit offering a weekly grocery pickup and resource-navigation desk. This example campaign invites supporters to help fund winter pickup appointments, translated resource guides, and local transit passes before December 31.',
      details: [
        'Illustrative gift: $50 helps cover one grocery box and two local transit passes',
        'Fictional program: Community Resource Desk and weekly grocery pickup',
        'Campaign goal: fund 120 winter grocery-pickup appointments',
        'Monthly giving example: recurring gifts help replenish weekly grocery supplies'
      ],
      faq: [
        {
          q: 'Can I give after December 31?',
          a: 'Yes, but gifts made before year-end help us close the current campaign and begin January with more clarity.'
        },
        {
          q: 'Can I become a monthly donor?',
          a: 'Yes. Monthly support helps provide dependable momentum throughout the year.'
        }
      ]
    },
    ctas: [
      'Give before December 31',
      'Make your year-end gift',
      'Help us start strong',
      'Fuel this work for the months ahead',
      'Become a monthly supporter',
      'Help close the gap before year-end',
      'Give today so this work continues tomorrow',
      'Turn one gift into year-round momentum'
    ],
    postingSchedule: [
      {
        timing: '4 weeks before Dec. 31',
        asset: 'Launch email + Facebook/Instagram post',
        purpose: 'Open the campaign'
      },
      { timing: '2 weeks before Dec. 31', asset: 'Story/impact email', purpose: 'Deepen emotional connection' },
      { timing: '1 week before Dec. 31', asset: 'Reminder email + social countdown', purpose: 'Drive action' },
      { timing: 'Final 3 days', asset: 'Final-days email + short social posts', purpose: 'Create real deadline urgency' },
      { timing: 'After campaign closes', asset: 'Thank-you email + recap post', purpose: 'Steward donors and supporters' }
    ],
    followUpCopy:
      'Thank you for being part of this year-end campaign. Your support helps us begin the new year with momentum, clarity, and the ability to keep showing up for the people who count on this work. We are grateful for every gift, every share, and every person who chose to stand with this mission.',
    usageNotes: [
      'Replace fictional organization details with verified facts before use.',
      'Verify every illustrative amount, program detail, and impact statement against organization-approved evidence; remove anything unsupported.',
      'Avoid guilt-based framing; the tone should be grateful, specific, and donor-respecting.'
    ]
  },
  {
    slug: 'restaurant-local-discovery',
    title: 'Restaurant Local Discovery Campaign',
    eyebrow: 'Fictional campaign template',
    campaignType: 'Local discovery / first-visit offer',
    summary:
      'A fictional campaign template for Juniper Spoon Thai Kitchen — a local restaurant example built around a weekday lunch special, review ask, and referral prompt.',
    goal: 'Bring first-time and nearby diners in the door with one clear local offer and a simple visit or order action.',
    audience: [
      'nearby residents',
      'office workers at lunch',
      'first-time diners',
      'families looking for a local spot',
      'regulars who have not visited recently'
    ],
    primaryCta: 'Try the weekday lunch special',
    secondaryCta: 'Leave a review or refer a neighbor',
    tone: ['local', 'welcoming', 'specific', 'offer-focused', 'not corporate'],
    emails: [
      {
        label: 'Local discovery launch',
        subject: 'Still haven’t tried us? Your weekday lunch spot is right here',
        preview: 'A simple lunch special for neighbors who live or work nearby.',
        timing: 'Send at campaign launch',
        body:
          'If you live or work near Juniper Spoon Thai Kitchen and have not stopped in yet, this fictional campaign is your invitation. The example features a $14 weekday basil stir-fry lunch set with jasmine rice and a choice of tofu or chicken, available Monday through Friday from 11:30 AM to 2:30 PM.',
        cta: 'See the lunch special'
      },
      {
        label: 'Signature dish spotlight',
        subject: 'Meet a featured lunch dish this week',
        preview: 'One signature plate, one simple reason to visit this week.',
        timing: 'Send 5–7 days after launch',
        body:
          'This fictional menu spotlight features Juniper Spoon’s basil stir-fry: crisp vegetables, Thai basil, jasmine rice, and a choice of tofu or chicken. It is the centerpiece of the example $14 weekday lunch set and a simple reason to plan a first visit.',
        cta: 'Plan your visit'
      },
      {
        label: 'Review & refer reminder',
        subject: 'Loved your visit? A quick review helps neighbors find us',
        preview: 'If we earned it, a review or referral goes a long way for a local restaurant.',
        timing: 'Send after visit window or to recent customers',
        body:
          'Local restaurants grow through word of mouth. If you enjoyed your meal at Juniper Spoon Thai Kitchen, a short, honest review helps other neighbors discover us. Know someone nearby who still needs a lunch spot? Send them our way.',
        cta: 'Leave a review or refer a friend'
      }
    ],
    socialPosts: [
      {
        platform: 'Facebook',
        label: 'Local discovery post',
        copy:
          'Neighbors: if you have not tried Juniper Spoon Thai Kitchen yet, this fictional campaign offers an easy first-visit invitation — a $14 basil stir-fry lunch set, weekdays from 11:30 AM to 2:30 PM.'
      },
      {
        platform: 'Facebook',
        label: 'Local group version',
        copy:
          'Sharing for anyone nearby: in this fictional example, Juniper Spoon Thai Kitchen serves a $14 weekday lunch set at 18 Juniper Row in Brookhaven, with dine-in and pickup available from 11:30 AM to 2:30 PM.'
      },
      {
        platform: 'Instagram',
        label: 'Food caption',
        copy:
          'Your weekday lunch spot might be closer than you think. This fictional Juniper Spoon campaign pairs a basil stir-fry lunch set with a simple invitation for nearby diners: stop in weekdays from 11:30 AM to 2:30 PM.'
      },
      {
        platform: 'Instagram',
        label: 'Signature dish caption',
        copy:
          'Basil stir-fry, crisp vegetables, and jasmine rice — the fictional signature dish in this example campaign. Choose tofu or chicken, then make it your next weekday lunch.'
      },
      {
        platform: 'LinkedIn',
        label: 'Office lunch frame',
        copy:
          'Local lunch matters for small teams and solo workdays. In this fictional example, Juniper Spoon Thai Kitchen offers a weekday lunch option for professionals nearby.'
      },
      {
        platform: 'LinkedIn',
        label: 'Community note',
        copy:
          'Small local restaurants depend on nearby regulars. This fictional post invites people who live or work close to Juniper Spoon Thai Kitchen to make a first weekday visit.'
      },
      {
        platform: 'X',
        label: 'Short local post',
        copy: 'Fictional example: a $14 weekday lunch set at Juniper Spoon Thai Kitchen, served from 11:30 AM to 2:30 PM.'
      },
      {
        platform: 'X',
        label: 'Review ask',
        copy: 'Tried Juniper Spoon Thai Kitchen? An honest review helps other locals find us.'
      }
    ],
    landingPageCopy: {
      headline: 'A weekday lunch spot for nearby diners',
      subhead: 'Fresh Thai dishes for nearby residents, office workers, and first-time diners.',
      body:
        'In this fictional example, Juniper Spoon Thai Kitchen invites nearby diners to try a $14 basil stir-fry lunch set with jasmine rice and a choice of tofu or chicken. The weekday offer is available for dine-in or pickup at the example Brookhaven location.',
      details: [
        'Offer: $14 basil stir-fry lunch set with jasmine rice; choose tofu or chicken (fictional)',
        'Best for: neighbors, office lunch, first-time visits',
        'Primary action: Visit for lunch or order for pickup',
        'Location: 18 Juniper Row, Brookhaven (fictional)',
        'Hours: Monday–Friday, 11:30 AM–2:30 PM (fictional)',
        'Terms: Dine-in and pickup only in this fictional example; availability may vary'
      ],
      faq: [
        {
          q: 'Is this only for first-time customers?',
          a: 'The campaign is aimed at nearby people who have not visited yet, but everyone is welcome.'
        },
        {
          q: 'Can I order ahead?',
          a: 'Yes. In this fictional example, pickup orders can be placed at juniperspoon.example during lunch hours.'
        }
      ]
    },
    ctas: [
      'Try the weekday lunch special',
      'Plan your first visit',
      'Order lunch for pickup',
      'See the menu',
      'Plan a local visit',
      'Leave a review',
      'Refer a neighbor',
      'Make us your lunch spot'
    ],
    postingSchedule: [
      { timing: 'Week 1', asset: 'Launch email + Facebook/Instagram local post', purpose: 'Open discovery campaign' },
      { timing: 'Week 2', asset: 'Signature dish spotlight + local group post', purpose: 'Give a concrete reason to visit' },
      { timing: 'Week 3', asset: 'Counter-card / table-tent in store', purpose: 'Convert walk-ins' },
      { timing: 'Week 4', asset: 'Review + referral reminder', purpose: 'Turn visitors into advocates' },
      { timing: 'Ongoing', asset: 'Google Business Profile update', purpose: 'Capture local search intent' }
    ],
    followUpCopy:
      'Thank you for giving Juniper Spoon Thai Kitchen a try. Local restaurants grow through repeat visits, honest reviews, and referrals. If we earned your support, we would appreciate a review — and if you know someone nearby who still needs a lunch spot, send them our way.',
    usageNotes: [
      'Replace the fictional business with the restaurant-approved name, offer, hours, and links before use.',
      'Do not invent prices, discounts, or review claims.',
      'Offer terms and exclusions must match what the client can honor.',
      'Do not reference real businesses or neighborhoods without permission.'
    ]
  }
];

/** Public proof samples only — three in V1. See lib/campaign-templates.ts */
export const publicSampleKits = sampleKits.filter((kit) => PUBLIC_SAMPLE_SLUGS.includes(kit.slug));

export function getSampleKit(slug: string): SampleKit | undefined {
  return sampleKits.find((kit) => kit.slug === slug);
}

export function getPublicSampleKit(slug: string): SampleKit | undefined {
  return publicSampleKits.find((kit) => kit.slug === slug);
}

export function sampleKitTitle(slug: string): string {
  return getSampleKit(slug)?.title ?? `${PRODUCT_NAME} sample`;
}
