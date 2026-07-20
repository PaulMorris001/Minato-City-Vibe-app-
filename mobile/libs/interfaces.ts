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

export interface Service {
  _id: string;
  vendor: string;
  name: string;
  description: string;
  category: string;
  /** Optional grouping label organising the catalogue (e.g. "Foods", "Drinks"). */
  section?: string;
  price: number;
  currency: string;
  images: string[];
  duration?: {
    value: number;
    unit: "hours" | "days" | "weeks" | "months";
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

