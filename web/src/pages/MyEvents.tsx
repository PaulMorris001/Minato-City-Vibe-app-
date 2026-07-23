import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, money } from "../lib/format";
import type { EventItem } from "../lib/types";

/**
 * The signed-in creator's public events, with an edit entry point. Edits to
 * pricing/capacity/date are held for admin approval (shown here as a badge);
 * minor edits go live immediately (see EditEvent).
 */
export default function MyEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login", { state: { from: "/my-events" }, replace: true });
      return;
    }
    document.title = "My events – OurCityvibe";
    api<{ events: EventItem[] }>("/events?createdOnly=1&publicOnly=1&limit=50")
      .then((r) => setEvents(r.events || []))
      .catch((err) => setError(err.message || "Couldn't load your events"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <Layout>
        <p className="cv-muted">Loading your events…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1 className="cv-h1">My events</h1>
      <p className="cv-h2" style={{ marginBottom: 24 }}>
        The public events you host. Edit details anytime — price, capacity and date changes go live
        once an admin approves them.
      </p>

      {error && <div className="cv-error">{error}</div>}

      {!error && events.length === 0 && (
        <div className="cv-panel">
          <p className="cv-muted">
            You haven't created any public events yet. Events are created in the CityVibe app.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {events.map((ev) => {
          const pending = ev.pendingEdits?.status === "pending";
          const rejected = ev.pendingEdits?.status === "rejected";
          return (
            <div key={ev._id} className="cv-panel">
              <div className="cv-row" style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 17 }}>{ev.title}</strong>
                <span className="cv-chips">
                  {pending && <span className="cv-pill cv-pill-accent">Edits pending review</span>}
                  {rejected && <span className="cv-pill">Edits not approved</span>}
                  <span className={`cv-pill ${ev.isPaid ? "cv-pill-accent" : "cv-pill-free"}`}>
                    {ev.isPaid ? "Ticketed" : "Free"}
                  </span>
                </span>
              </div>
              <p className="cv-muted" style={{ marginBottom: 12 }}>
                {formatDateTime(ev.date)} · {ev.isVirtual ? "Online" : ev.location}
                {ev.isPaid ? ` · from ${money(
                  ev.ticketTiers?.length
                    ? Math.min(...ev.ticketTiers.map((t) => t.price))
                    : ev.ticketPrice || 0,
                  ev.currency
                )}` : ""}
              </p>
              {rejected && ev.pendingEdits?.rejectReason && (
                <p className="cv-muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Reviewer note: {ev.pendingEdits.rejectReason}
                </p>
              )}
              <div className="cv-chips">
                <Link className="cv-btn cv-btn-inline" to={`/my-events/${ev._id}/edit`}>
                  Edit
                </Link>
                <Link className="cv-btn cv-btn-ghost cv-btn-inline" to={`/events/${ev._id}`}>
                  View public page
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
