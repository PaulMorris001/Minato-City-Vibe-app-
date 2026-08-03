import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import type { PublicEvent } from "@/components/shared/PublicEventCard";
import type { ExternalEvent } from "./externalEvent.service";
import type { GuideCardItem } from "@/components/shared/GuideCard";
import type { VendorRowItem } from "@/components/shared/VendorRow";
import type { UserRowItem } from "@/components/shared/UserRow";

/**
 * Unified search across events, guides, vendors and users.
 *
 * The server returns per-type BUCKETS rather than one ranked list — see
 * server/src/controllers/search.controller.js for why. The client renders them
 * as sections and uses each bucket's `total` for its filter-chip counts.
 */

export type SearchType = "events" | "guides" | "vendors" | "users";

/** Native events carry `kind: "native"`, promoted third-party ones `"external"`. */
export type SearchEventItem =
  | (PublicEvent & { kind: "native" })
  | (ExternalEvent & { kind: "external" });

export interface SearchBucket<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  /** users only — true for guests, who can't search people. */
  requiresAuth?: boolean;
}

export interface SearchResponse {
  q: string;
  buckets: {
    events: SearchBucket<SearchEventItem>;
    guides: SearchBucket<GuideCardItem>;
    vendors: SearchBucket<VendorRowItem>;
    users: SearchBucket<UserRowItem>;
  };
}

export const EMPTY_BUCKET = { items: [], total: 0, hasMore: false };

export const emptySearchResponse = (q = ""): SearchResponse => ({
  q,
  buckets: {
    events: { ...EMPTY_BUCKET, items: [] },
    guides: { ...EMPTY_BUCKET, items: [] },
    vendors: { ...EMPTY_BUCKET, items: [] },
    users: { ...EMPTY_BUCKET, items: [] },
  },
});

/**
 * Run a search. Pass an AbortSignal so a superseded request is cancelled —
 * debouncing alone doesn't stop an earlier slow response from landing after a
 * later fast one and overwriting it.
 */
export async function search({
  q,
  types,
  city,
  page = 1,
  limit = 10,
  signal,
}: {
  q: string;
  types?: SearchType[];
  city?: string | null;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  if (types && types.length > 0) params.append("types", types.join(","));
  if (city) params.append("city", city);

  const token = await SecureStore.getItemAsync("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/search?${params.toString()}`, { headers, signal });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Search failed");
  return data as SearchResponse;
}

export default { search, emptySearchResponse };
