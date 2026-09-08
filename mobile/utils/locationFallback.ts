import * as SecureStore from "expo-secure-store";

/**
 * What every location-aware list does when the active city turns out to have
 * nothing in it.
 *
 * The active city is a reverse-geocoded name, so it only ever matches content
 * tagged with that exact string. Somewhere like "Obafemi-Owode" has none of its
 * own while being minutes from places that do — so rather than showing a dead
 * end, each list re-asks with a progressively wider filter and stops at the
 * first that returns anything.
 *
 * The device's state/country/coordinates are resolved once (on the home feed,
 * which owns the GPS and IP prompts) and persisted here so the vendors and
 * best-of tabs can widen too without each running their own location flow.
 */

const STORAGE_KEY = "devicePlace";

export interface DevicePlace {
  lat?: number;
  lng?: number;
  state?: string | null;
  /** Full name ("Nigeria"), not an ISO code — that's what the API matches on. */
  country?: string | null;
}

export async function saveDevicePlace(place: DevicePlace): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(place));
  } catch {
    // Best-effort — a failed write just means the next resolve tries again.
  }
}

export async function loadDevicePlace(): Promise<DevicePlace | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DevicePlace) : null;
  } catch {
    return null;
  }
}

/** Which filter produced the results, so callers can say so honestly. */
export type FallbackScope = "state" | "country" | "global";

export interface FallbackResult<T> {
  scope: FallbackScope;
  items: T[];
}

export interface LocationFilter {
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Re-run `fetchPage` with successively wider filters until one returns results.
 *
 * The city tier is deliberately absent — the caller has already tried it and
 * come up empty, which is why we're here. A tier whose value equals the city
 * that already failed is skipped rather than re-fetched.
 *
 * Returns null when even the unfiltered request is empty, which means there is
 * genuinely no content of this kind anywhere.
 */
export async function widenUntilFound<T>(
  city: string | null,
  place: DevicePlace | null,
  fetchPage: (filter: LocationFilter) => Promise<T[]>
): Promise<FallbackResult<T> | null> {
  const alreadyTried = (value?: string | null) =>
    !value || value.toLowerCase() === (city ?? "").toLowerCase();

  const tiers: { scope: FallbackScope; filter: LocationFilter }[] = [
    ...(alreadyTried(place?.state) ? [] : [{ scope: "state" as const, filter: { state: place!.state! } }]),
    ...(alreadyTried(place?.country)
      ? []
      : [{ scope: "country" as const, filter: { country: place!.country! } }]),
    { scope: "global", filter: {} },
  ];

  for (const tier of tiers) {
    try {
      const items = await fetchPage(tier.filter);
      if (items.length > 0) return { scope: tier.scope, items };
    } catch {
      // A tier failing shouldn't sink the broader ones behind it.
    }
  }
  return null;
}

/** `LocationFilter` as a query-string fragment, for callers building URLs by hand. */
export function filterQuery(filter: LocationFilter): string {
  return (["city", "state", "country"] as const)
    .filter((k) => filter[k])
    .map((k) => `&${k}=${encodeURIComponent(filter[k]!)}`)
    .join("");
}

/** Subtitle copy for a fallback row, so the three screens stay consistent. */
export function fallbackSubtitle(scope: FallbackScope, city: string | null): string {
  const where = city ? `in ${city}` : "here";
  switch (scope) {
    case "state":
      return `Nothing ${where} yet — showing nearby`;
    case "country":
      return `Nothing ${where} yet — showing elsewhere in your country`;
    default:
      return `Nothing ${where} yet — showing what's popular`;
  }
}
