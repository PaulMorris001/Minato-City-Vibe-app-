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
  createCity: (data: { name: string; state: string }) =>
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
    client.patch<{ status: string }>(`/admin/verifications/${id}/approve`),
  rejectVerification: (id: string, reviewNotes: string) =>
    client.patch<{ status: string }>(`/admin/verifications/${id}/reject`, { reviewNotes }),

  // Analytics (shorter TTL — data changes frequently)
  getAnalyticsSummary: () =>
    cachedGet<AnalyticsSummary>("/admin/analytics/summary", { ttl: 30_000 }),
  getAnalyticsEvents: (params?: { event?: string; page?: number; limit?: number }) =>
    cachedGet<{ logs: AnalyticsLog[]; total: number; page: number; limit: number }>(
      "/admin/analytics/events",
      { params, ttl: 30_000 }
    ),
};
