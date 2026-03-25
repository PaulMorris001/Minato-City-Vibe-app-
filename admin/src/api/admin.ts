import client from "./client";
import type { Stats, AdminUser, AdminVendor, AdminEvent, AdminGuide, City, VendorType } from "../types";

export const adminApi = {
  login: (username: string, password: string) =>
    client.post<{ token: string }>("/admin/login", { username, password }),

  getStats: () => client.get<Stats>("/admin/stats"),

  // Users
  getUsers: (params?: { search?: string; page?: number; limit?: number }) =>
    client.get<{ users: AdminUser[]; total: number; page: number; limit: number }>("/admin/users", { params }),
  deleteUser: (id: string) => client.delete(`/admin/users/${id}`),

  // Vendors (from Vendor collection)
  getVendors: (params?: { search?: string; page?: number; limit?: number }) =>
    client.get<{ vendors: AdminVendor[]; total: number; page: number; limit: number }>("/admin/vendors", { params }),
  toggleVendorVerified: (id: string) =>
    client.patch<{ verified: boolean }>(`/admin/vendors/${id}/verify`),
  deleteVendor: (id: string) => client.delete(`/admin/vendors/${id}`),

  // Cities
  getCities: () => client.get<City[]>("/admin/cities"),
  createCity: (data: { name: string; state: string }) =>
    client.post<City>("/admin/cities", data),
  deleteCity: (id: string) => client.delete(`/admin/cities/${id}`),

  // Vendor Types
  getVendorTypes: () => client.get<VendorType[]>("/admin/vendor-types"),
  createVendorType: (data: { name: string; icon: string }) =>
    client.post<VendorType>("/admin/vendor-types", data),
  deleteVendorType: (id: string) => client.delete(`/admin/vendor-types/${id}`),

  // Events
  getEvents: (params?: { search?: string; page?: number; limit?: number }) =>
    client.get<{ events: AdminEvent[]; total: number; page: number; limit: number }>("/admin/events", { params }),
  toggleEventActive: (id: string) =>
    client.patch<{ isActive: boolean }>(`/admin/events/${id}/toggle`),
  deleteEvent: (id: string) => client.delete(`/admin/events/${id}`),

  // Guides
  getGuides: (params?: { search?: string; page?: number; limit?: number }) =>
    client.get<{ guides: AdminGuide[]; total: number; page: number; limit: number }>("/admin/guides", { params }),
  toggleGuideActive: (id: string) =>
    client.patch<{ isActive: boolean }>(`/admin/guides/${id}/toggle`),
  deleteGuide: (id: string) => client.delete(`/admin/guides/${id}`),
};
