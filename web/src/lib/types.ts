/**
 * Shapes returned by the CityVibe backend, trimmed to the fields the website
 * actually renders. Native events come from `/events/...` (Event model) and
 * external ones from `/external-events/...` (ExternalEvent model) — two
 * separate collections server-side, so we keep two types here and unify them
 * only at the feed-card level (see `FeedEvent`).
 */

export interface PublicUser {
  _id: string;
  id?: string;
  username: string;
  profilePicture?: string;
  bio?: string;
  verified?: boolean;
  isVendor?: boolean;
  businessName?: string;
  /** Only on the event-detail payload (derived server-side). */
  hostedEventsCount?: number;
  followersCount?: number;
  followingCount?: number;
  /** Set by /users/:id when the user has a published vendor listing. */
  vendorId?: string;
  vendorName?: string;
}

export interface EventTier {
  _id: string;
  name: string;
  price: number;
}

export interface VendorSummary {
  _id: string;
  name: string;
  images?: string[];
  rating?: number;
  verified?: boolean;
  vendorType?: { _id: string; name: string; icon?: string } | string;
  city?: { _id: string; name: string; state?: string; country?: string } | string;
}

export interface Vendor extends VendorSummary {
  description?: string;
  priceRange?: number;
  contact?: {
    phone?: string;
    website?: string;
    instagram?: string;
    twitter?: string;
    tiktok?: string;
    facebook?: string;
  };
  user?: string;
}

export interface Review {
  _id: string;
  rating: number;
  review?: string;
  createdAt: string;
  user?: PublicUser;
}

/** Native CityVibe event (Event model). */
export interface EventItem {
  _id: string;
  title: string;
  description?: string;
  date: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  image?: string;
  images?: string[];
  isPaid?: boolean;
  ticketPrice?: number;
  ticketTiers?: EventTier[];
  currency?: string;
  isVirtual?: boolean;
  maxGuests?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  userHasPurchased?: boolean;
  createdBy?: PublicUser;
  cohosts?: PublicUser[];
  vendors?: VendorSummary[];
  rsvpUsers?: PublicUser[];
  invitedUsers?: PublicUser[];
  rsvpCount?: number;
  seenCount?: number;
  friendsGoing?: number;
  hasMeetingLink?: boolean;
  meetingLink?: string;
  shareToken?: string;
  // Present on the detail endpoint (GET /events/:id).
  userRsvp?: boolean;
  userStatus?: "creator" | "accepted" | "pending" | "requested" | "none";
  ticketingReady?: boolean;
}

/** Third-party event ingested from Ticketmaster / Bandsintown. */
export interface ExternalEventItem {
  _id: string;
  source: "ticketmaster" | "bandsintown";
  title: string;
  description?: string;
  image?: string;
  images?: string[];
  date: string;
  endDate?: string;
  location?: string;
  venueName?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string;
  ticketUrl: string;
  category?: string;
  genre?: string;
  subGenre?: string;
  performers?: string[];
  additionalDates?: number;
}

/**
 * One card in the events feed. `kind` tells the card (and the router) which
 * collection the row came from — native events open the in-site ticket flow,
 * external ones open the provider's page.
 */
export type FeedEvent =
  | ({ kind: "native" } & EventItem)
  | ({ kind: "external" } & ExternalEventItem);

export interface Ticket {
  _id: string;
  event?: EventItem;
  purchaseDate?: string;
  price?: number;
  currency?: string;
  tierName?: string;
  ticketCode?: string;
}
