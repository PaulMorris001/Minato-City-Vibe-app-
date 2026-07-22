import { APP_STORE_URL, PLAY_STORE_URL } from "../lib/app";

type Variant = "default" | "ticket" | "profile" | "vendor";

const COPY: Record<Variant, { title: string; body: string; points: string[] }> = {
  default: {
    title: "Do more in the CityVibe app",
    body: "The website is just the front door. Everything that happens around an event lives in the app.",
    points: [
      "Event group chats with everyone who's going",
      "Follow hosts and vendors, get notified when they post",
      "Book vendors and pay in-app",
    ],
  },
  ticket: {
    title: "Your ticket is in the app 🎟️",
    body: "Download CityVibe and log in with the same account — your ticket QR code, the guest list and the event group chat are all waiting there.",
    points: [
      "Scannable ticket QR for entry",
      "Group chat with the host and other guests",
      "Reminders and last-minute updates from the organizer",
    ],
  },
  profile: {
    title: "Get the full profile experience",
    body: "Posts, followers, saved events and messages live in the mobile app.",
    points: [
      "Message hosts, guests and vendors",
      "Follow people and see what they're attending",
      "Create and manage your own events",
    ],
  },
  vendor: {
    title: "Book this vendor in the app",
    body: "Browse their full catalogue, chat about your event and pay securely — all inside CityVibe.",
    points: [
      "Full catalogue with prices and photos",
      "Chat directly and get a custom quote",
      "Pay securely, with the order tracked end to end",
    ],
  },
};

/**
 * Cross-sell banner pushing visitors to the mobile app. Rendered on the events
 * feed, profile pages and — most importantly — right after a successful ticket
 * purchase, since the ticket QR and event chat only exist in the app.
 */
export default function AppPromo({
  variant = "default",
  compact = false,
}: {
  variant?: Variant;
  compact?: boolean;
}) {
  const { title, body, points } = COPY[variant];
  return (
    <section className="cv-promo">
      <h3>{title}</h3>
      <p>{body}</p>
      {!compact && (
        <ul>
          {points.map((p) => (
            <li key={p}>
              <span aria-hidden="true">✦</span>
              {p}
            </li>
          ))}
        </ul>
      )}
      <div className="cv-stores">
        <a className="cv-store" href={APP_STORE_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true"></span> Download on iOS
        </a>
        <a className="cv-store cv-store-alt" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true">▶</span> Get it on Google Play
        </a>
      </div>
    </section>
  );
}
