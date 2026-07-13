import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

/**
 * Events ingested from third-party providers (Ticketmaster today; more later).
 *
 * Shape mirrors the server `ExternalEvent` model, kept distinct from the
 * native `Event` shape so the feed can render them with a provider badge and
 * route the CTA to the external ticket URL instead of the in-app Stripe flow.
 */
export interface ExternalEvent {
  _id: string;
  source: "ticketmaster" | "bandsintown";
  sourceId: string;
  title: string;
  description: string;
  image: string;
  /** false when provider only had a generic placeholder image */
  hasRealImage?: boolean;
  /** When `explore` deduped this card, how many other dates exist for the same show */
  additionalDates?: number;
  images: string[];
  date: string; // ISO
  endDate?: string;
  timezone?: string;
  location: string;
  venueName?: string;
  address?: string;
  city: string;
  state?: string;
  country: string;
  geo?: { type: "Point"; coordinates: [number, number] };
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  ticketUrl: string; // where the CTA sends the user
  category?: string;
  genre?: string;
  subGenre?: string;
  performers?: string[];
}

export interface ExploreResponse {
  events: ExternalEvent[];
  nextCursor: string | null;
}

export interface ExploreParams {
  city?: string;
  country?: string;
  source?: "ticketmaster" | "bandsintown";
  category?: string;
  limit?: number;
  cursor?: string; // ISO date — paginate by passing the prior nextCursor back
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

class ExternalEventService {
  /**
   * Paginated feed. The caller passes back `nextCursor` from the previous
   * response to get the next page.
   */
  async explore(params: ExploreParams = {}): Promise<ExploreResponse> {
    const headers = await authHeader();
    const url = `${BASE_URL}/external-events/explore${buildQuery(params)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`external-events/explore ${res.status}`);
    }
    return res.json();
  }

  /** "Near me" geo search — events within `radiusKm` of (lat, lng). */
  async nearby(
    lat: number,
    lng: number,
    radiusKm = 50,
    limit = 20
  ): Promise<{ events: ExternalEvent[] }> {
    const headers = await authHeader();
    const url = `${BASE_URL}/external-events/nearby${buildQuery({
      lat,
      lng,
      radiusKm,
      limit,
    })}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`external-events/nearby ${res.status}`);
    }
    return res.json();
  }

  /** Detail for a single external event. */
  async getById(id: string): Promise<{ event: ExternalEvent }> {
    const headers = await authHeader();
    const url = `${BASE_URL}/external-events/${id}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`external-events/${id} ${res.status}`);
    }
    return res.json();
  }
}

export const externalEventService = new ExternalEventService();
