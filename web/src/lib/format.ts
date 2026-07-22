import type { EventItem, ExternalEventItem, FeedEvent } from "./types";

const SYMBOL: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
  CAD: "CA$",
};

export function money(amount: number, currency = "USD") {
  const sym = SYMBOL[currency?.toUpperCase()] || `${currency} `;
  return `${sym}${Math.round(amount).toLocaleString()}`;
}

/** Cheapest ticket price for a native event (tiers win over the flat price). */
export function fromPrice(ev: EventItem): number {
  if (ev.ticketTiers && ev.ticketTiers.length) {
    return Math.min(...ev.ticketTiers.map((t) => t.price));
  }
  return ev.ticketPrice || 0;
}

/** Short price label for a feed card: "Free", "From $25", "$25 – $80". */
export function priceLabel(ev: FeedEvent): string {
  if (ev.kind === "external") {
    const { priceMin, priceMax, currency } = ev;
    if (priceMin == null && priceMax == null) return "Tickets";
    if (priceMin != null && priceMax != null && priceMax > priceMin) {
      return `${money(priceMin, currency)} – ${money(priceMax, currency)}`;
    }
    return `From ${money((priceMin ?? priceMax) as number, currency)}`;
  }
  if (!ev.isPaid) return "Free";
  return `From ${money(fromPrice(ev), ev.currency)}`;
}

export function eventPlace(ev: FeedEvent): string {
  if (ev.kind === "external") {
    return ev.venueName || ev.location || [ev.city, ev.state].filter(Boolean).join(", ") || "TBA";
  }
  return ev.isVirtual ? "Online" : ev.location;
}

export function formatDate(iso?: string) {
  if (!iso) return "Date TBA";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso?: string) {
  if (!iso) return "Date TBA";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Sat 14" style stacked date badge used on the feed cards. */
export function dateBadge(iso?: string) {
  if (!iso) return { month: "TBA", day: "" };
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}

/** "in 3 days" / "today" — used to add urgency on cards + detail pages. */
export function relativeDay(iso?: string): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days < 0) return "Past event";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 30) return `In ${Math.round(days / 7)} weeks`;
  return "";
}

const SOURCE_LABEL: Record<string, string> = {
  ticketmaster: "Ticketmaster",
  bandsintown: "Bandsintown",
};

export function sourceLabel(ev: ExternalEventItem) {
  return SOURCE_LABEL[ev.source] || ev.source;
}

/** Deterministic gradient for events with no cover art. */
export function fallbackGradient(seed: string) {
  const palettes = [
    ["#7c3aed", "#ec4899"],
    ["#22d3ee", "#7c3aed"],
    ["#ec4899", "#f59e0b"],
    ["#06b6d4", "#10b981"],
    ["#6366f1", "#22d3ee"],
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = palettes[hash % palettes.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function initials(name?: string) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}
