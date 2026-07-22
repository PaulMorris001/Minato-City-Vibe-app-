import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import EventCard from "../components/EventCard";
import AppPromo from "../components/AppPromo";
import { api } from "../lib/api";
import type { EventItem, ExternalEventItem, FeedEvent } from "../lib/types";
import { eventPlace } from "../lib/format";

// Re-exported so older imports (`import { money } from "./Events"`) keep
// working now that the helpers live in lib/format.
export { money, fromPrice } from "../lib/format";
export type { EventItem } from "../lib/types";

const PAGE_SIZE = 24;

type Filter = "all" | "cityvibe" | "external" | "free" | "online";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "cityvibe", label: "CityVibe events" },
  { key: "external", label: "Around town" },
  { key: "free", label: "Free" },
  { key: "online", label: "Online" },
];

export default function Events() {
  const [native, setNative] = useState<EventItem[]>([]);
  const [external, setExternal] = useState<ExternalEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Pagination cursors: native events page by number, external ones by date.
  const page = useRef(1);
  const cursor = useRef<string | null>(null);
  const [nativeMore, setNativeMore] = useState(false);
  const [externalMore, setExternalMore] = useState(false);

  const load = useCallback(async (initial: boolean) => {
    // Both feeds are optional — if one fails we still show the other.
    const nativeReq = api<{ events: EventItem[]; total: number }>(
      `/events/public/explore?limit=${PAGE_SIZE}&page=${page.current}`
    ).catch(() => null);
    const externalReq = api<{ events: ExternalEventItem[]; nextCursor: string | null }>(
      `/external-events/explore?limit=${PAGE_SIZE}${
        cursor.current ? `&cursor=${encodeURIComponent(cursor.current)}` : ""
      }`
    ).catch(() => null);

    const [nat, ext] = await Promise.all([nativeReq, externalReq]);

    if (!nat && !ext && initial) {
      throw new Error("Couldn't load events right now. Please try again.");
    }

    if (nat) {
      const rows = nat.events || [];
      setNative((prev) => dedupe(initial ? rows : [...prev, ...rows]));
      setNativeMore(rows.length >= PAGE_SIZE);
    } else if (initial) {
      setNativeMore(false);
    }

    if (ext) {
      const rows = ext.events || [];
      setExternal((prev) => dedupe(initial ? rows : [...prev, ...rows]));
      cursor.current = ext.nextCursor;
      setExternalMore(!!ext.nextCursor);
    } else if (initial) {
      setExternalMore(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Events – OurCityvibe";
    load(true)
      .catch((err) => setError(err.message || "Couldn't load events"))
      .finally(() => setLoading(false));
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    page.current += 1;
    try {
      await load(false);
    } catch {
      /* keep whatever is already on screen */
    } finally {
      setLoadingMore(false);
    }
  }

  // One feed, but CityVibe's own events always come first — they're the ones
  // people can actually buy, RSVP to and chat about here. Ticketed shows from
  // Ticketmaster/Bandsintown follow. Each block is sorted soonest-first.
  const feed: FeedEvent[] = useMemo(() => {
    const byDate = (a: FeedEvent, b: FeedEvent) => +new Date(a.date) - +new Date(b.date);
    return [
      ...native.map((e) => ({ ...e, kind: "native" as const })).sort(byDate),
      ...external.map((e) => ({ ...e, kind: "external" as const })).sort(byDate),
    ];
  }, [native, external]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feed.filter((ev) => {
      if (filter === "cityvibe" && ev.kind !== "native") return false;
      if (filter === "external" && ev.kind !== "external") return false;
      if (filter === "free" && !(ev.kind === "native" && !ev.isPaid)) return false;
      if (filter === "online" && !(ev.kind === "native" && ev.isVirtual)) return false;
      if (!q) return true;
      const haystack = [
        ev.title,
        eventPlace(ev),
        ev.city,
        ev.kind === "native" ? ev.createdBy?.username : ev.category,
        ev.kind === "external" ? (ev.performers || []).join(" ") : "",
        ev.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [feed, filter, query]);

  const visibleNative = visible.filter((ev) => ev.kind === "native");
  const visibleExternal = visible.filter((ev) => ev.kind === "external");

  return (
    <Layout wide>
      <header className="cv-section">
        <p className="cv-eyebrow">What's on</p>
        <h1 className="cv-h1">
          Find your next <span className="cv-gradient-text">night out</span>
        </h1>
        <p className="cv-h2">
          {loading
            ? "Loading everything happening near you…"
            : `${native.length} CityVibe event${native.length === 1 ? "" : "s"} and ${
                external.length
              } ticketed show${external.length === 1 ? "" : "s"} — all in one feed.`}
        </p>

        <input
          className="cv-input"
          style={{ maxWidth: 420, marginBottom: 16 }}
          placeholder="Search events, cities, artists, hosts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="cv-chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`cv-chip${filter === f.key ? " cv-chip-on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="cv-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cv-skel" style={{ height: 320 }} />
          ))}
        </div>
      ) : error ? (
        <div className="cv-error">{error}</div>
      ) : visible.length === 0 ? (
        <div className="cv-empty">
          <div className="cv-empty-emoji">🌃</div>
          <h3 className="cv-h3">Nothing matches that yet</h3>
          <p className="cv-muted">
            Try a different search or filter — new events get added every day.
          </p>
        </div>
      ) : (
        <>
          {/* Two labelled blocks whenever both kinds are on screen, so the
              CityVibe-first ordering reads as intentional. */}
          {visibleNative.length > 0 && (
            <section className="cv-section">
              {visibleExternal.length > 0 && (
                <>
                  <p className="cv-eyebrow">On CityVibe</p>
                  <h3 className="cv-h3">Events you can book right here</h3>
                </>
              )}
              <div className="cv-grid">
                {visibleNative.map((ev) => (
                  <EventCard key={`native-${ev._id}`} ev={ev} />
                ))}
              </div>
            </section>
          )}

          {visibleExternal.length > 0 && (
            <section className="cv-section">
              {visibleNative.length > 0 && (
                <>
                  <p className="cv-eyebrow" style={{ marginTop: 34 }}>
                    Around town
                  </p>
                  <h3 className="cv-h3">Ticketed shows near you</h3>
                </>
              )}
              <div className="cv-grid">
                {visibleExternal.map((ev) => (
                  <EventCard key={`external-${ev._id}`} ev={ev} />
                ))}
              </div>
            </section>
          )}

          {(nativeMore || externalMore) && (
            <div className="cv-center" style={{ marginTop: 32 }}>
              <button
                className="cv-btn cv-btn-ghost cv-btn-inline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more events"}
              </button>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 48 }}>
        <AppPromo />
      </div>
    </Layout>
  );
}

/** Guards against duplicate rows when a page boundary shifts between fetches. */
function dedupe<T extends { _id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r._id) ? false : (seen.add(r._id), true)));
}
