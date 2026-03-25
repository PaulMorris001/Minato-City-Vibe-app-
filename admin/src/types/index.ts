export interface AdminUser {
  _id: string;
  username: string;
  email: string;
  isVendor: boolean;
  profilePicture?: string;
  businessName?: string;
  businessDescription?: string;
  vendorType?: string;
  location?: { city?: string; address?: string };
  contactInfo?: { phone?: string; website?: string };
  verified?: boolean;
  createdAt: string;
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
