export interface Vendor {
  _id: string;
  name: string;
  description: string;
  vendorType: string;
  city: string;
  images: string[];
  priceRange: number;
  rating: number;
  contact: {
    phone: string;
    instagram: string;
    website: string;
  };
  user?: string;
  verified: boolean;
}

export interface City {
  _id: string;
  name: string;
  state: string;
  country?: string;
}

// CSC API picker types (from the /locations proxy)
export interface CountryOption {
  name: string;
  iso2: string;
}

export interface StateOption {
  name: string;
  iso2: string;
}

export interface CityOption {
  name: string;
}

// A location that has published guides (browse list)
export interface GuideLocation {
  city: string;
  state: string;
  country: string;
  count: number;
}

// A resolved location selection from the cascading picker
export interface LocationSelection {
  country: string;
  countryIso?: string;
  state: string;
  stateIso?: string;
  city: string;
}

export interface VendorType {
  _id: string;
  name: string;
  icon: string;
}

/** A catalogue item is either a product (a good sold by a unit) or a service
 *  (work rendered over a duration). Set by the parent category. */
export type CatalogueKind = "product" | "service";

export type DurationUnit = "hours" | "days" | "weeks" | "months";

// A top-level catalogue category owned by a vendor (e.g. "Catering").
// The `kind` is locked at creation and decides the fields its items expose.
export interface CatalogueCategory {
  _id: string;
  vendor: string;
  name: string;
  description?: string;
  kind: CatalogueKind;
  images?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  _id: string;
  vendor: string;
  name: string;
  description: string;
  category: string;
  /** Parent catalogue category id (set for all post-migration items). */
  catalogueCategory?: string;
  /** Product vs service — derived server-side from the parent category. */
  kind?: CatalogueKind;
  /** Optional grouping label organising the catalogue (e.g. "Foods", "Drinks"). */
  section?: string;
  price: number;
  currency: string;
  // ── Product-kind fields ──
  /** Selling unit shown next to the price, e.g. "per plate", "per kg". */
  unit?: string;
  /** Smallest quantity a client may order. */
  minOrderQty?: number;
  /** Units in stock; null/undefined = untracked / made-to-order. */
  stock?: number | null;
  images: string[];
  // ── Service-kind fields ──
  duration?: {
    value: number;
    unit: DurationUnit;
  };
  /** How long before the vendor can deliver the service. */
  leadTime?: {
    value: number;
    unit: DurationUnit;
  };
  availability: "available" | "unavailable" | "coming_soon";
  features: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// A single line in the client-side cart. One cart is scoped to one vendor.
export interface CartItem {
  serviceId: string;
  name: string;
  price: number;
  currency: string;
  image?: string;
  section?: string;
  quantity: number;
  note?: string;
}

export type OrderStatus =
  | "requested"
  | "quoted"
  | "paid"
  | "cancelled"
  | "declined";

export interface OrderItem {
  service: string | { _id: string; name: string; images?: string[] };
  name: string;
  priceSnapshot: { amount: number; currency: string };
  quantity: number;
  note?: string;
  /** True when the vendor added this line from their catalogue at quote time. */
  addedByVendor?: boolean;
}

export interface OrderFee {
  label: string;
  amount: number;
}

// The server-side, payable counterpart of a cart (see server/models/order.model.js).
export interface Order {
  _id: string;
  client: string | { _id: string; username?: string; profilePicture?: string };
  vendor: string | { _id: string; username?: string; businessName?: string };
  chat?: string;
  items: OrderItem[];
  itemsSubtotal: number;
  additionalFees: OrderFee[];
  total: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: "unpaid" | "paid" | "refunded";
  requestMessage?: string;
  invoiceMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VendorStats {
  totalServices: number;
  activeServices: number;
  unavailableServices: number;
  averagePrice: string;
  recentServices: Service[];
  servicesByCategory: {
    category: string;
    count: number;
  }[];
  rating?: number;
  ratingCount?: number;
  bookingsThisMonth?: number;
  earningsThisMonth?: number;
  earningsLastMonth?: number;
  dailyEarnings?: number[];
}

export interface GuideSection {
  title: string;
  rank: number;
  description: string;
  image?: string;
}

export interface Guide {
  _id: string;
  title: string;
  coverImage?: string;
  author: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
  authorName: string;
  description: string;
  price: number;
  currency?: string; // Selling currency (defaults to USD for legacy guides)
  city: string; // City name
  cityState: string; // State / region name
  country?: string; // Country name (defaults to United States for legacy guides)
  topic: string;
  sections: GuideSection[];
  isDraft: boolean;
  isPurchased: boolean;
  purchasedBy: string[];
  views: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const GUIDE_TOPICS = [
  "Chefs",
  "Food and Restaurants",
  "Music and Bands",
  "Bars and Clubs",
  "Casinos",
  "Concerts",
  "Events",
  "Transportation",
  "Venues",
  "Florists",
  "Decorations",
  "Desserts",
  "Beverages",
  "Grocery stores",
  "Museums",
  "Parks",
  "Hotels",
  "Spas",
  "Hair and Nail Salons",
  "Barber Shops"
];

