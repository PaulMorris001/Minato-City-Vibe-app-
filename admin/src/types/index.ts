export interface AdminUser {
  _id: string;
  username: string;
  email: string;
  isVendor: boolean;
  profilePicture?: string;
  businessName?: string;
  businessDescription?: string;
  vendorType?: string;
  location?: { city?: string; state?: string; country?: string; address?: string };
  contactInfo?: { phone?: string; website?: string };
  verified?: boolean;
  createdAt: string;
}

export interface City {
  _id: string;
  name: string;
  state: string;
  country?: string;
}

export interface VendorType {
  _id: string;
  name: string;
  icon: string;
}

export interface GuideTopic {
  _id: string;
  name: string;
  emoji?: string;
  createdAt?: string;
}

export interface AdminVendor {
  _id: string;
  name: string;
  description?: string;
  images?: string[];
  city: City;
  vendorType: VendorType;
  priceRange: number;
  rating: number;
  contact: { phone: string; instagram?: string; website?: string };
  verified: boolean;
  user?: { _id: string; username: string; email: string };
  createdAt: string;
}

/** A further venue an event runs at in parallel; the event's own location is venue #1. */
export interface EventVenue {
  location: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface AdminEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  additionalLocations?: EventVenue[];
  image?: string;
  description?: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  isActive: boolean;
  createdBy?: { _id: string; username: string; email: string };
  createdAt: string;
}

/** One venue a person is attending, and how many of their passes are for it. */
export interface SignupLocation {
  index: number;
  name: string;
  city: string;
  count: number;
}

/** Per-venue headcount for an event. Empty for a single-venue event. */
export interface VenueSummary {
  index: number;
  location: string;
  address: string;
  city: string;
  state: string;
  country: string;
  total: number;
  rsvpCount: number;
  ticketCount: number;
  attendedCount: number;
}

export interface EventSignup {
  userId: string;
  username: string;
  profilePicture?: string;
  isGuest: boolean;
  type: "rsvp" | "ticket";
  ticketCount: number;
  tiers: string[];
  locations: SignupLocation[];
  checkedIn: boolean;
  attendedAt: string | null;
  joinedAt: string | null;
}

/** GET /admin/events/:id/signups — who is going, and to which venue. */
export interface EventSignups {
  event: { id: string; title: string; date: string };
  total: number;
  rsvpCount: number;
  ticketCount: number;
  ticketsIssued: number;
  attendedCount: number;
  venues: VenueSummary[];
  unspecifiedVenue: {
    total: number;
    rsvpCount: number;
    ticketCount: number;
    attendedCount: number;
  };
  attendees: EventSignup[];
}

export interface AdminGuide {
  _id: string;
  title: string;
  author?: { _id: string; username: string; email: string };
  authorName?: string;
  description?: string;
  price: number;
  city: string;
  topic: string;
  isDraft: boolean;
  isActive: boolean;
  views?: number;
  createdAt: string;
}

export interface AdminDiscountCode {
  _id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  isActive: boolean;
  disabledByCreator: boolean;
  event: { _id: string; title: string; date?: string; currency: string };
  createdByAdmin: string;
  createdAt: string;
}

export interface AdminCouponTransaction {
  _id: string;
  user: { _id: string; username: string; email?: string } | null;
  type: "earned" | "spent" | "refunded" | "expired" | "adjusted";
  amount: number;
  currency: "NGN" | "USD";
  description: string;
  order: { _id: string; total: number; currency: string } | null;
  createdAt: string;
}

export interface Stats {
  totalUsers: number;
  totalVendors: number;
  totalEvents: number;
  totalGuides: number;
  newUsersToday: number;
  recentUsers: AdminUser[];
}

/** Dashboard "Action Items" — pending counts across every admin review queue. */
export interface ActionItems {
  verifications: number;
  payouts: number;
  eventEdits: number;
  reports: number;
  paidEvents: number;
  cancellations: number;
  newUsersToday: number;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  data?: T[];
}

export interface AnalyticsLog {
  _id: string;
  userId?: { _id: string; username: string; email: string };
  event: string;
  properties: Record<string, any>;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  timestamp: string;
}

export interface AnalyticsSummary {
  totalEvents: number;
  eventBreakdown: { _id: string; count: number }[];
  dailySeries: { date: string; count: number }[];
  topUsers: { _id: string; count: number; username: string; email: string }[];
}

export interface AdminRaffleEntry {
  eventId: string;
  title: string;
  date: string;
  createdAt: string;
  host: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
    // So the admin can sanity-check a winner's location before assigning
    // them a NGN/USD-locked vendor prize.
    location?: { country?: string; state?: string; city?: string };
  } | null;
  // rsvpUsers count — the live "going" toggle, not the one-way invited list.
  verifiedRsvps: number;
  totalInvites: number;
  eligibilityScore: number;
  // Whether this host has cleared the campaign's minReferrals bar. Informational
  // only — the server doesn't block assigning a place to an ineligible entry.
  isEligible: boolean;
  // 1..N where N is the campaign's prize-tier count.
  winnerRank: number | null;
}

export interface RafflePrize {
  rank: number;
  // There is no cash prize — the coupon amount IS the reward, in OurCityVibe
  // credit (1 credit = ₦1 = $1, no exchange rate between the two). A tier
  // needs a value in Naira, Dollars, or both.
  couponNGN?: number;
  couponUSD?: number;
  // Optional, region-agnostic non-cash bonus shown alongside the coupon
  // amount (e.g. "Premium Event Pass").
  extraPerk?: string;
}

// The vendor a currency's credit is redeemable at — a user account with
// isVendor:true, populated by the server wherever a campaign is returned.
export interface AssignedVendor {
  _id: string;
  username: string;
  businessName?: string;
  businessPicture?: string;
  profilePicture?: string;
  location?: { country?: string };
}

export interface AdminRaffleCampaign {
  // null when no campaign row exists yet — the server returns a synthetic
  // default from the old hardcoded deadline until the seed script runs.
  _id: string | null;
  name: string;
  startDate: string;
  endDate: string;
  status: "active" | "ended";
  // Ordered prize tiers; length is the winner count.
  prizes: RafflePrize[];
  // Verified RSVPs a birthday event needs before its host is prize-eligible.
  // No ceiling — ranking is by highest verified RSVPs, so more always helps.
  minReferrals: number;
  // The vendor each currency's credit is redeemable at — null/absent means
  // spendable at any vendor.
  vendorNGN?: AssignedVendor | null;
  vendorUSD?: AssignedVendor | null;
  createdByAdmin?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminAnnouncement {
  _id: string;
  title: string;
  body: string;
  audience: "all" | "city" | "targeted";
  city?: string | null;
  targets?: {
    countries: string[];
    states: { country: string; state: string }[];
    cities: { country: string; state: string; city: string }[];
    userIds: string[];
    groupIds: string[];
    summary?: string;
  };
  deepLink?: string;
  sentBy?: string;
  /** Accounts addressed, and how many of them we held a push token for. */
  recipientCount: number;
  pushedCount: number;
  createdAt: string;
}

export interface AnnouncementGroup {
  _id: string;
  name: string;
  memberCount: number;
}
