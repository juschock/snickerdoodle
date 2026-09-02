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
    eyebrow: 'Sample campaign package',
    campaignType: 'Adoption event',
    summary:
      'A fictional sample package for a local animal rescue hosting a weekend adoption event and asking the community to attend, share, foster, or donate.',
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
        subject: '[Verified pet name] is ready for a fresh start',
        preview: 'Use one approved, factual detail to introduce an adoptable pet.',
        timing: 'Send 3–5 days before the event',
        body:
          'Insert a customer-approved pet profile here: verified name, age, temperament, adoption status, and one concrete detail supplied by the rescue. Connect that factual profile to the event without inventing history, behavior, or outcomes.',
        cta: 'Meet [verified pet name] and other adoptable pets'
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
          '[Verified pet name] update: add one approved temperament detail and confirm attendance before publishing. Invite readers to the adoption event this weekend.'
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
        'Location placeholder: Meadowline Park Pavilion',
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
    eyebrow: 'Sample campaign package',
    campaignType: 'Year-end fundraising appeal',
    summary:
      'A fictional sample package for a small nonprofit asking supporters to make a year-end gift before December 31.',
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
          'As the year comes to a close, we are asking our community to help carry this mission into the next one. Insert an organization-approved summary of this year’s work here using verified program facts and no invented beneficiaries or outcomes. A year-end gift today helps make sure we can begin January ready to keep going.',
        cta: 'Make your year-end gift'
      },
      {
        label: 'Story / Impact',
        subject: 'What one gift can do before we turn the calendar',
        preview: 'Your support helps real people receive help at the right moment.',
        timing: 'Send 10–14 days before December 31',
        body:
          'Insert one customer-approved impact example here using verified program facts, consented details, and no identifying information. Explain what support was provided and how a year-end gift connects to that work without inventing a beneficiary or outcome.',
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
          'Use one verified, customer-approved program fact here to show why the year-end campaign matters. Do not invent a beneficiary, statistic, or outcome.'
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
        "In this fictional example, Copper Lantern Community Aid invites supporters to help sustain customer-verified programs into the new year. A real package would replace this sentence with the organization's approved mission, need, and campaign facts.",
      details: [
        'Impact placeholder: insert only a customer-substantiated giving amount and use',
        'Program placeholder: identify the specific verified service the appeal supports',
        'Proof placeholder: add an approved statistic or remove this line',
        'Recurring-gift placeholder: confirm that monthly giving is available before use'
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
      'Replace every impact placeholder with organization-approved evidence or remove it.',
      'Avoid guilt-based framing; the tone should be grateful, specific, and donor-respecting.'
    ]
  },
  {
    slug: 'restaurant-local-discovery',
    title: 'Restaurant Local Discovery Campaign',
    eyebrow: 'Sample campaign package',
    campaignType: 'Local discovery / first-visit offer',
    summary:
      'A fictional sample package for Juniper Spoon Thai Kitchen — a local restaurant example built around a weekday lunch special, review ask, and referral prompt.',
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
          'If you live or work near Juniper Spoon Thai Kitchen and have not stopped in yet, this is your invitation. In this fictional example, the restaurant offers a weekday lunch special for nearby diners. Replace the cuisine, offer, and availability with verified restaurant facts before use.',
        cta: 'See the lunch special'
      },
      {
        label: 'Signature dish spotlight',
        subject: 'Meet a featured lunch dish this week',
        preview: 'One signature plate, one simple reason to visit this week.',
        timing: 'Send 5–7 days after launch',
        body:
          'Feature one verified menu item here using the restaurant-approved name, ingredients, availability, and description. If you have been meaning to try Juniper Spoon Thai Kitchen, use the confirmed weekday offer as a clear first-visit invitation.',
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
          'Neighbors: if you have not tried Juniper Spoon Thai Kitchen yet, this fictional example uses a weekday lunch special as an easy first-visit invitation. Replace every offer detail with verified facts.'
      },
      {
        platform: 'Facebook',
        label: 'Local group version',
        copy:
          'Sharing for anyone nearby — Juniper Spoon Thai Kitchen is running a weekday lunch special in this fictional example. Confirm the offer, service format, location, and hours before use.'
      },
      {
        platform: 'Instagram',
        label: 'Food caption',
        copy:
          'Your weekday lunch spot might be closer than you think. Juniper Spoon Thai Kitchen — a fictional local-discovery example with an offer that must be verified before use.'
      },
      {
        platform: 'Instagram',
        label: 'Signature dish caption',
        copy:
          'Basil stir-fry + jasmine rice — a fictional signature-dish example. Replace the dish and description with verified menu facts before use. First visit? We would love to cook for you.'
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
          'Small local restaurants depend on nearby regulars. If you work or live close to Juniper Spoon Thai Kitchen, this example invites one verified first visit.'
      },
      {
        platform: 'X',
        label: 'Short local post',
        copy: 'Fictional example: weekday lunch special at Juniper Spoon Thai Kitchen — verify the offer before use.'
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
        'In this fictional example, Juniper Spoon Thai Kitchen uses a verified weekday offer to invite a first visit. Replace the location, menu, service, and offer language with restaurant-approved facts before publishing.',
      details: [
        'Offer: Weekday lunch special — see in-store or online menu for current details',
        'Best for: neighbors, office lunch, first-time visits',
        'Primary action: Visit for lunch or order for pickup',
        'Location placeholder: add the verified Juniper Spoon Thai Kitchen address',
        'Hours placeholder: add verified lunch-service hours',
        'Terms: Dine-in and pickup only unless online ordering is listed on the fact ledger'
      ],
      faq: [
        {
          q: 'Is this only for first-time customers?',
          a: 'The campaign is aimed at nearby people who have not visited yet, but everyone is welcome.'
        },
        {
          q: 'Can I order ahead?',
          a: 'Use the ordering link or phone number provided by the restaurant in the fact ledger.'
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
      'Fictional business — replace with verified restaurant name, offer, hours, and links from the fact ledger.',
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
