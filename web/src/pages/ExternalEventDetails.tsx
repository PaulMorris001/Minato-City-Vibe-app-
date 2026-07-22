import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Layout from "../components/Layout";
import AppPromo from "../components/AppPromo";
import { api } from "../lib/api";
import type { ExternalEventItem } from "../lib/types";
import {
  fallbackGradient,
  formatDateTime,
  money,
  relativeDay,
  sourceLabel,
} from "../lib/format";

/**
 * Detail page for a third-party event (Ticketmaster / Bandsintown). We're not
 * the merchant of record for these, so the CTA hands off to the provider's own
 * ticket page — same behaviour as the mobile app's external-event card.
 */
export default function ExternalEventDetails() {
  const { eventId } = useParams();
  const [ev, setEv] = useState<ExternalEventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api<{ event: ExternalEventItem }>(`/external-events/${eventId}`)
      .then(({ event }) => {
        setEv(event);
        document.title = `${event.title} – OurCityvibe`;
      })
      .catch((err) => setError(err.message || "Couldn't load this event"))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <Layout>
        <div className="cv-skel" style={{ height: 300, marginBottom: 24 }} />
        <div className="cv-skel" style={{ height: 200 }} />
      </Layout>
    );
  }
  if (error || !ev) {
    return (
      <Layout>
        <div className="cv-error">{error || "Event not found"}</div>
        <Link to="/events" className="cv-link">
          ← Back to all events
        </Link>
      </Layout>
    );
  }

  const cover = ev.image || ev.images?.[0];
  const gallery = (ev.images || []).filter((img) => img !== cover);
  const soon = relativeDay(ev.date);
  const place = [ev.venueName, ev.city, ev.state].filter(Boolean).join(", ") || ev.location;
  // Ticketmaster sends the literal string "Undefined" for unclassified shows.
  const genre = [ev.genre, ev.subGenre]
    .filter((g) => g && !/^undefined$/i.test(g))
    .join(" · ");
  const priceText =
    ev.priceMin == null && ev.priceMax == null
      ? "See provider for pricing"
      : ev.priceMin != null && ev.priceMax != null && ev.priceMax > ev.priceMin
      ? `${money(ev.priceMin, ev.currency)} – ${money(ev.priceMax, ev.currency)}`
      : `From ${money((ev.priceMin ?? ev.priceMax) as number, ev.currency)}`;

  return (
    <Layout>
      <Link to="/events" className="cv-muted" style={{ display: "inline-block", marginBottom: 16 }}>
        ← All events
      </Link>

      <div
        className="cv-hero"
        style={cover ? undefined : { background: fallbackGradient(ev._id), minHeight: 260 }}
      >
        {cover && <img src={cover} alt={ev.title} />}
        <div className="cv-hero-scrim" />
        <div className="cv-hero-text">
          <div className="cv-chips" style={{ marginBottom: 10 }}>
            <span className="cv-pill cv-pill-ext">{sourceLabel(ev)}</span>
            {ev.category && <span className="cv-pill">{ev.category}</span>}
            {soon && <span className="cv-pill">{soon}</span>}
          </div>
          <h1 className="cv-h1" style={{ marginBottom: 4 }}>
            {ev.title}
          </h1>
          <p className="cv-dim" style={{ fontSize: 15 }}>
            {formatDateTime(ev.date)} · {place}
          </p>
        </div>
      </div>

      <div className="cv-detail">
        <div>
          {ev.description && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">About</h3>
              <p className="cv-body-text">{ev.description}</p>
            </section>
          )}

          {!!ev.performers?.length && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">Lineup</h3>
              <div className="cv-chips">
                {ev.performers.map((p) => (
                  <span key={p} className="cv-pill cv-pill-accent">
                    {p}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="cv-panel cv-section">
            <h3 className="cv-h3">Details</h3>
            <div className="cv-facts">
              <Fact icon="📅" label="Starts" value={formatDateTime(ev.date)} />
              {ev.endDate && <Fact icon="🏁" label="Ends" value={formatDateTime(ev.endDate)} />}
              <Fact
                icon="📍"
                label="Venue"
                value={[ev.venueName, ev.address, ev.city, ev.state, ev.country]
                  .filter(Boolean)
                  .join(", ")}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [ev.venueName, ev.address, ev.city].filter(Boolean).join(", ")
                )}`}
              />
              <Fact icon="🎟️" label="Tickets" value={priceText} />
              {genre && <Fact icon="🎵" label="Genre" value={genre} />}
              {!!ev.additionalDates && (
                <Fact
                  icon="🔁"
                  label="More dates"
                  value={`${ev.additionalDates} other date${
                    ev.additionalDates === 1 ? "" : "s"
                  } at this venue`}
                />
              )}
              <Fact icon="🤝" label="Sold by" value={sourceLabel(ev)} />
            </div>
          </section>

          {!!gallery.length && (
            <section className="cv-section">
              <h3 className="cv-h3">Photos</h3>
              <div className="cv-gallery">
                {gallery.map((img) => (
                  <img key={img} src={img} alt="" loading="lazy" />
                ))}
              </div>
            </section>
          )}

          <AppPromo />
        </div>

        <aside className="cv-sticky">
          <div className="cv-panel">
            <h3 className="cv-h3">Tickets</h3>
            <p className="cv-muted" style={{ marginBottom: 6 }}>
              {priceText}
            </p>
            <p className="cv-muted" style={{ marginBottom: 16, fontSize: 13 }}>
              This event is sold by {sourceLabel(ev)}. You'll finish checkout on their site.
            </p>
            <a
              className="cv-btn"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
              href={ev.ticketUrl}
              target="_blank"
              rel="noreferrer"
            >
              Get tickets on {sourceLabel(ev)} ↗
            </a>
          </div>
        </aside>
      </div>
    </Layout>
  );
}

function Fact({
  icon,
  label,
  value,
  href,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <span style={{ minWidth: 0 }}>
      <span className="cv-fact-label" style={{ display: "block" }}>
        {label}
      </span>
      <span className="cv-fact-value" style={{ wordBreak: "break-word" }}>
        {value}
      </span>
    </span>
  );
  return (
    <div className="cv-fact">
      <span className="cv-fact-icon" aria-hidden="true">
        {icon}
      </span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}
