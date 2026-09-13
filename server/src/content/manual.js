/**
 * The in-app / on-web how-to manual.
 *
 * Authored once here and served to both clients (mobile renders it natively,
 * the website renders it as pages) so a copy edit never needs an app store
 * release and the two surfaces can't drift apart.
 *
 * Structured data rather than HTML on purpose: each client styles it in its own
 * idiom. Keep `body` plain prose — no markup, no links that only make sense on
 * one platform.
 */

const TOPICS = [
  {
    slug: "events",
    title: "Creating an event",
    summary: "From your first listing to selling tickets, checking guests in, and getting paid.",
    sections: [
      {
        heading: "Start with the basics",
        body:
          "Tap the + button on the home screen to create an event. You'll need a title, a date and a location — everything else can be added later. Add photos: listings with a cover image get far more attention than ones without.",
        bullets: [
          "Give it a real end time if it runs across days — otherwise we treat it as a single date.",
          "Virtual events don't need a venue; add the meeting link instead and only attendees will see it.",
          "The title and location are locked to real words — placeholder text gets rejected.",
        ],
      },
      {
        heading: "Public or invite-only",
        body:
          "A public event shows up in Discover for anyone browsing your city. An invite-only event is visible only to people you invite or who have your share link, and strangers can request to join.",
        bullets: [
          "Pick carefully: visibility can't be switched after the event is created.",
          "Anyone who joins gets a QR entry pass automatically, free event or not.",
        ],
      },
      {
        heading: "Selling tickets",
        body:
          "Turn on ticketing for a public event and set a price, or create up to ten named tiers (Early Bird, General, VIP) each with its own price and allocation. Buyers pick a tier at checkout.",
        bullets: [
          "Set a capacity so the event can sell out — per tier, or one shared pool.",
          "Prices are in your local currency, which also decides how buyers pay.",
          "You can close ticket sales at any time from the event screen, and reopen them just as easily.",
        ],
      },
      {
        heading: "Why paid events get reviewed",
        body:
          "Every public paid event is reviewed before it goes on sale — not just your first one. Ticket prices and capacity are uncapped, so review is what stands in for a limit. You'll be asked to upload proof the venue is real: a booking confirmation, a signed contract or a screenshot of the reservation.",
        bullets: [
          "Reviews are usually quick. You'll get a notification either way.",
          "Later edits to price, capacity or date go through the same review; photos, description and title update immediately.",
        ],
      },
      {
        heading: "On the day",
        body:
          "Open the event and use Check in to scan guests' QR passes at the door. Each pass scans once, so a screenshot passed around won't get two people in.",
      },
      {
        heading: "Cancelling",
        body:
          "If you have to call it off, cancel from the event screen. If nobody has bought a ticket, it's cancelled straight away. If tickets have sold, your request goes to our team first and ticket sales pause immediately — once it's approved every buyer is refunded in full and emailed automatically.",
      },
      {
        heading: "Getting paid",
        body:
          "Ticket money is held until after the event, then released for review before it's paid out to you. Add your payout details before you start selling — Earnings in Settings walks you through it. Where you are decides the rail: bank transfer in Nigeria, card payouts elsewhere we support.",
      },
    ],
  },
  {
    slug: "guides",
    title: "Writing and selling guides",
    summary: "Turn what you know about your city into something people can buy.",
    sections: [
      {
        heading: "What a guide is",
        body:
          "A city guide is a curated list of places worth going — bars, restaurants, venues, neighbourhoods — written by someone who actually knows them. Readers buy it once and keep it.",
      },
      {
        heading: "Writing one",
        body:
          "Start from Guides in your profile. Pick a city and a topic, then add entries one at a time: a name, a photo, and a few honest sentences about why it's worth the trip. Specificity is what people pay for — 'great cocktails' sells nothing, 'the back room does a rotating negroni list on Thursdays' sells.",
        bullets: [
          "Save as a draft and come back to it — nothing is published until you say so.",
          "Ten to twenty strong entries beats fifty thin ones.",
        ],
      },
      {
        heading: "Pricing and publishing",
        body:
          "Set a price when you publish, or leave it free. You keep the large majority of every sale; the platform fee is shown before you confirm. As with events, you'll need payout details on file before money can reach you.",
      },
      {
        heading: "After it's live",
        body:
          "Your guide appears in its city's guide list and in search. Sales and payouts show up under Earnings. You can keep editing a published guide — buyers always see the current version.",
      },
    ],
  },
  {
    slug: "vendors",
    title: "Setting up as a vendor",
    summary: "List your business, take orders and bookings, and get paid through the app.",
    sections: [
      {
        heading: "Becoming a vendor",
        body:
          "Switch on a business account from Settings. You'll pick the city you operate in and the kind of business you run — that's how customers find you, browsing from city to category to business.",
        bullets: [
          "Your personal and business accounts stay separate, with their own inboxes.",
          "Switch between them any time from Settings.",
        ],
      },
      {
        heading: "Getting verified",
        body:
          "Submit a verification request from your vendor account. A verified badge tells customers the business is real, and it's the single biggest thing you can do to get enquiries.",
      },
      {
        heading: "Building your catalogue",
        body:
          "Your catalogue has two levels: categories, and the products or services inside them. Give each item a clear name, a price and a photo. Prices are always re-checked against your live catalogue at checkout, so customers can never pay a stale price.",
      },
      {
        heading: "Orders and bookings",
        body:
          "A customer adds items to a cart and sends you an order. It arrives as a card in your business inbox, where you quote a final price. Once they confirm and pay, it becomes a booking you can track.",
        bullets: [
          "Customers can message you directly from your profile without following you first.",
          "Reply quickly — response time is what turns an enquiry into a booking.",
        ],
      },
      {
        heading: "Getting paid",
        body:
          "Add your payout details from Earnings before you take your first order. Money from a completed booking is held briefly, reviewed and then paid out. Earnings shows every sale and the status of every payout.",
      },
    ],
  },
];

/** Index view — enough to render a list without shipping the whole manual. */
export const manualIndex = () =>
  TOPICS.map(({ slug, title, summary }) => ({ slug, title, summary }));

/** One topic in full, or undefined when the slug is unknown. */
export const manualTopic = (slug) => TOPICS.find((t) => t.slug === slug);
