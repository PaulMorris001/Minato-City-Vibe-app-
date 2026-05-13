import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

/**
 * Moderation API Service
 * Report content (events, guides, users) and block/unblock users.
 * Apple Guideline 1.2 compliance.
 */

export type ReportTargetType = "user" | "event" | "guide";
export type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "other";

export interface BlockedUser {
  _id: string;
  username: string;
  profilePicture?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function reportContent(params: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/reports`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "Failed to submit report");
  }
  return data;
}

export async function blockUser(userId: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/blocks`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "Failed to block user");
  }
  return data;
}

export async function unblockUser(userId: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/blocks/${userId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "Failed to unblock user");
  }
  return data;
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const res = await fetch(`${BASE_URL}/blocks`, {
    method: "GET",
    headers: await authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || "Failed to load blocked users");
  }
  return data.blockedUsers || [];
}
