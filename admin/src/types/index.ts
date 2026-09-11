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

export interface AdminEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  description?: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  isActive: boolean;
  createdBy?: { _id: string; username: string; email: string };
  createdAt: string;
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

export interface Stats {
  totalUsers: number;
  totalVendors: number;
  totalEvents: number;
  totalGuides: number;
  recentUsers: AdminUser[];
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
  host: { _id: string; username: string; email: string; profilePicture?: string } | null;
  // rsvpUsers count — the live "going" toggle, not the one-way invited list.
  verifiedRsvps: number;
  totalInvites: number;
  eligibilityScore: number;
  // 1..N where N is the campaign's prize-tier count.
  winnerRank: number | null;
}

export interface RafflePrize {
  rank: number;
  reward: string;
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
