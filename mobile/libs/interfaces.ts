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
}

export interface GuideSection {
  title: string;
  rank: number;
  description: string;
}

export interface Guide {
  _id: string;
  title: string;
  author: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
  authorName: string;
  description: string;
  price: number;
  city: City | string; // Can be populated City object or just ID string
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

export const CITIES = [
  { name: "Boston", state: "Massachusetts" },
  { name: "New York City", state: "New York" },
  { name: "Atlanta", state: "Georgia" },
  { name: "Los Angeles", state: "California" },
  { name: "Houston", state: "Texas" },
  { name: "Chicago", state: "Illinois" },
  { name: "Washington", state: "DC" },
  { name: "Miami", state: "Florida" },
  { name: "New Orleans", state: "Louisiana" },
  { name: "Detroit", state: "Michigan" },
  { name: "San Francisco", state: "California" }
];

