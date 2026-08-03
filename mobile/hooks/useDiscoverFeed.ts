import { useCallback, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";
import type { PublicEvent } from "@/components/shared/PublicEventCard";

/**
 * The public events browse feed — native events merged with promoted
 * third-party (Ticketmaster etc.) listings, date-ordered.
 *
 * A hook rather than a component because two screens render the same feed with
 * different chrome: the search page's empty-query state, and the full
 * public-events browser with its category/sort/favourites controls.
 */

export type DiscoverItem =
  | { _kind: "native"; _id: string; sort: number; data: PublicEvent }
  | { _kind: "external"; _id: string; sort: number; data: ExternalEvent };

export interface NearbyDiscover {
  city: string;
  state?: string | null;
  country?: string | null;
  events: PublicEvent[];
}

const DISCOVER_LIMIT = 10;

/** Merge the two sources into one date-ordered list. */
function mergeFeed(native: PublicEvent[], external: ExternalEvent[]): DiscoverItem[] {
  const items: DiscoverItem[] = [
    ...native.map((e) => ({
      _kind: "native" as const,
      _id: e._id,
      sort: new Date(e.date).getTime(),
      data: e,
    })),
    ...external.map((e) => ({
      _kind: "external" as const,
      _id: e._id,
      sort: new Date(e.date).getTime(),
      data: e,
    })),
  ];
  return items.sort((a, b) => a.sort - b.sort);
}

export function useDiscoverFeed({
  city,
  online = false,
  limit = DISCOVER_LIMIT,
}: {
  city: string | null;
  online?: boolean;
  limit?: number;
}) {
  const [native, setNative] = useState<PublicEvent[]>([]);
  const [external, setExternal] = useState<ExternalEvent[]>([]);
  const [nearby, setNearby] = useState<NearbyDiscover | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Cancels an in-flight fetch when the filters change, so a slow response for
  // the previous city can't land after a fast one for the new city.
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (pageNum: number, isRefresh = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        // Discover is guest-accessible — the explore routes use optionalAuth,
        // so only attach a token when one exists.
        const token = await SecureStore.getItemAsync("token");

        const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) });
        if (online) params.append("online", "true");
        else if (city) params.append("city", city);

        // Both feeds in parallel. External events are page-1 only — they're
        // upcoming listings without pagination needs here — and skipped
        // entirely for the Online filter, since those are always physical.
        const [nativeRes, externalRes] = await Promise.allSettled([
          fetch(`${BASE_URL}/events/public/explore?${params.toString()}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          }),
          pageNum === 1 && !online
            ? externalEventService.explore({ city: city || undefined, limit: 20 })
            : Promise.resolve({ events: [], nextCursor: null }),
        ]);

        if (controller.signal.aborted) return;

        if (nativeRes.status === "fulfilled" && nativeRes.value.ok) {
          const data = await nativeRes.value.json();
          const incoming: PublicEvent[] = data.events || [];
          setNative((prev) => (pageNum === 1 || isRefresh ? incoming : [...prev, ...incoming]));
          setPage(pageNum);
          setHasMore(incoming.length === limit);
          if (pageNum === 1) setNearby(data.nearby || null);
        }

        // Only refresh externals on page 1 so they don't flicker while
        // paginating natives.
        if (pageNum === 1 || isRefresh) {
          if (externalRes.status === "fulfilled") {
            setExternal(externalRes.value.events || []);
          } else {
            // An upstream hiccup should never break the feed.
            console.warn("[Discover] external events fetch failed:", externalRes.reason);
            setExternal([]);
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") console.warn("[Discover] fetch failed:", err?.message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [city, online, limit]
  );

  useEffect(() => {
    fetchPage(1, true);
    return () => abortRef.current?.abort();
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchPage(page + 1);
  }, [hasMore, loadingMore, loading, page, fetchPage]);

  const refresh = useCallback(() => fetchPage(1, true), [fetchPage]);

  return {
    items: mergeFeed(native, external),
    nearby,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  };
}

export default useDiscoverFeed;
