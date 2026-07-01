import client, { cachedGet, bustCache } from "./client";
import type {
  Stats,
  AdminUser,
  AdminVendor,
  AdminEvent,
  AdminGuide,
  City,
  VendorType,
  AnalyticsLog,
  AnalyticsSummary,
} from "../types";

export const adminApi = {
  login: (username: string, password: string) =>
    client.post<{ token: string }>("/admin/login", { username, password }),

  getStats: () => cachedGet<Stats>("/admin/stats"),

  // Users
  getUsers: (params?: { search?: string; page?: number; limit?: number }) =>
    cachedGet<{ users: AdminUser[]; total: number; page: number; limit: number }>(
      "/admin/users",
      { params }
    ),
  deleteUser: (id: string) =>
    client.delete(`/admin/users/${id}`).then((r) => { bustCache("/admin/users"); bustCache("/admin/stats"); return r; }),

  // Vendors
  getVendors: (params?: { search?: string; page?: number; limit?: number }) =>
    cachedGet<{ vendors: AdminVendor[]; total: number; page: number; limit: number }>(
      "/admin/vendors",
      { params }
    ),
  toggleVendorVerified: (id: string) =>
    client.patch<{ verified: boolean }>(`/admin/vendors/${id}/verify`).then((r) => { bustCache("/admin/vendors"); return r; }),
  deleteVendor: (id: string) =>
    client.delete(`/admin/vendors/${id}`).then((r) => { bustCache("/admin/vendors"); bustCache("/admin/stats"); return r; }),

  // Cities
  getCities: () => cachedGet<City[]>("/admin/cities"),
  createCity: (data: { name: string; state: string; country?: string }) =>
    client.post<City>("/admin/cities", data).then((r) => { bustCache("/admin/cities"); return r; }),
  deleteCity: (id: string) =>
    client.delete(`/admin/cities/${id}`).then((r) => { bustCache("/admin/cities"); return r; }),

  // Vendor Types
  getVendorTypes: () => cachedGet<VendorType[]>("/admin/vendor-types"),
  createVendorType: (data: { name: string; icon: string }) =>
    client.post<VendorType>("/admin/vendor-types", data).then((r) => { bustCache("/admin/vendor-types"); return r; }),
  deleteVendorType: (id: string) =>
    client.delete(`/admin/vendor-types/${id}`).then((r) => { bustCache("/admin/vendor-types"); return r; }),

  // Events
  getEvents: (params?: { search?: string; page?: number; limit?: number }) =>
    cachedGet<{ events: AdminEvent[]; total: number; page: number; limit: number }>(
      "/admin/events",
      { params }
    ),
  toggleEventActive: (id: string) =>
    client.patch<{ isActive: boolean }>(`/admin/events/${id}/toggle`).then((r) => { bustCache("/admin/events"); return r; }),
  deleteEvent: (id: string) =>
    client.delete(`/admin/events/${id}`).then((r) => { bustCache("/admin/events"); bustCache("/admin/stats"); return r; }),

  // Guides
  getGuides: (params?: { search?: string; page?: number; limit?: number }) =>
    cachedGet<{ guides: AdminGuide[]; total: number; page: number; limit: number }>(
      "/admin/guides",
      { params }
    ),
  toggleGuideActive: (id: string) =>
    client.patch<{ isActive: boolean }>(`/admin/guides/${id}/toggle`).then((r) => { bustCache("/admin/guides"); return r; }),
  deleteGuide: (id: string) =>
    client.delete(`/admin/guides/${id}`).then((r) => { bustCache("/admin/guides"); bustCache("/admin/stats"); return r; }),

  // Verifications
  getVerifications: (params?: { status?: string; page?: number; limit?: number }) =>
    client.get<{ requests: any[]; total: number; page: number; limit: number }>(
      "/admin/verifications",
      { params }
    ),
  approveVerification: (id: string) =>
    client.patch<{ status: string }>(`/admin/verifications/${id}/approve`, {}),
  rejectVerification: (id: string, reviewNotes: string) =>
    client.patch<{ status: string }>(`/admin/verifications/${id}/reject`, { reviewNotes }),

  // Paid Event Approval Queue (trust system)
  getPaidEvents: (params?: { status?: string; page?: number; limit?: number }) =>
    client.get<{ events: any[]; total: number; page: number; limit: number }>(
      "/admin/paid-events",
      { params }
    ),
  approvePaidEvent: (id: string) =>
    client.patch<{ status: string }>(`/admin/paid-events/${id}/approve`, {}),
  rejectPaidEvent: (id: string, reason: string) =>
    client.patch<{ status: string }>(`/admin/paid-events/${id}/reject`, { reason }),

  // Payout Approval Queue — release held vendor funds
  getPayouts: (params?: { status?: string; page?: number; limit?: number }) =>
    client.get<{
      payouts: AdminPayout[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>("/admin/payouts", { params }),
  approvePayout: (id: string) =>
    client.post<{ message: string; payout: AdminPayout }>(`/admin/payouts/${id}/approve`, {}),
  rejectPayout: (id: string, reason: string) =>
    client.post<{ message: string; payout: AdminPayout }>(`/admin/payouts/${id}/reject`, { reason }),

  // Analytics (shorter TTL — data changes frequently)
  getAnalyticsSummary: () =>
    cachedGet<AnalyticsSummary>("/admin/analytics/summary", { ttl: 30_000 }),
  getAnalyticsEvents: (params?: { event?: string; page?: number; limit?: number }) =>
    cachedGet<{ logs: AnalyticsLog[]; total: number; page: number; limit: number }>(
      "/admin/analytics/events",
      { params, ttl: 30_000 }
    ),

  // Reports (Apple Guideline 1.2 moderation queue)
  getReports: (params?: { status?: string; page?: number; limit?: number }) =>
    client.get<{
      reports: AdminReport[];
      total: number;
      openCount: number;
      page: number;
      limit: number;
    }>("/admin/reports", { params }),
  getReportTarget: (id: string) =>
    client.get<{ report: AdminReport; target: any }>(`/admin/reports/${id}/target`),
  resolveReport: (id: string, action: "dismiss" | "remove_content" | "ban_user") =>
    client.patch<{ report: AdminReport }>(`/admin/reports/${id}`, { action }),
};

export interface AdminReport {
  _id: string;
  reporter: { _id: string; username: string; email: string; profilePicture?: string };
  targetType: "user" | "event" | "guide";
  targetId: string;
  targetUser: { _id: string; username: string; email: string; profilePicture?: string; isBanned?: boolean };
  reason: string;
  details?: string;
  status: "open" | "resolved" | "dismissed";
  action?: string | null;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminPayout {
  _id: string;
  vendor?: {
    _id: string;
    username?: string;
    email?: string;
    businessName?: string;
    location?: { country?: string };
  };
  relatedType: "ticket" | "guide" | "booking";
  relatedId: string;
  provider: "stripe" | "flutterwave" | "wise";
  amount: number;
  currency: string;
  displayAmount?: number;
  displayCurrency?: string;
  status: "awaiting_approval" | "processing" | "paid" | "failed" | "rejected";
  reference: string;
  transferId?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  error?: string;
  createdAt: string;
}
