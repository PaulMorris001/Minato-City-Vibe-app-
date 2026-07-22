import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import AppPromo from "../components/AppPromo";
import EventCard from "../components/EventCard";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { EventItem, PublicUser, Ticket } from "../lib/types";
import { formatDateTime, money } from "../lib/format";

interface FullProfile extends PublicUser {
  email?: string;
  location?: string;
  emailVerifiedAt?: string | null;
  createdAt?: string;
}

/**
 * The signed-in user's own profile: who they are, the tickets they've bought
 * and the events they host. Deliberately read-only — editing, posts, chats and
 * the ticket QR codes live in the mobile app, which we push throughout.
 */
export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [hosted, setHosted] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login", { state: { from: "/profile" }, replace: true });
      return;
    }
    document.title = "Your profile – OurCityvibe";
    Promise.all([
      api<{ user: FullProfile }>("/profile"),
      api<{ tickets: Ticket[] }>("/tickets").catch(() => ({ tickets: [] })),
    ])
      .then(async ([p, t]) => {
        setProfile(p.user);
        setTickets(t.tickets || []);
        const id = p.user._id || p.user.id;
        if (id) {
          const own = await api<{ events: EventItem[] }>(`/users/${id}/events`).catch(() => ({
            events: [],
          }));
          setHosted(own.events || []);
        }
      })
      .catch((err) => setError(err.message || "Couldn't load your profile"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <Layout>
        <div className="cv-skel" style={{ height: 180, marginBottom: 24 }} />
        <div className="cv-skel" style={{ height: 240 }} />
      </Layout>
    );
  }
  if (error || !profile) {
    return (
      <Layout>
        <div className="cv-error">{error || "Profile unavailable"}</div>
      </Layout>
    );
  }

  const upcoming = tickets.filter((t) => t.event && +new Date(t.event.date) >= Date.now());
  const past = tickets.filter((t) => t.event && +new Date(t.event.date) < Date.now());

  return (
    <Layout>
      {/* ── Identity ─────────────────────────────────────── */}
      <section className="cv-panel cv-section">
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar src={profile.profilePicture} name={profile.username} size="lg" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="cv-h1" style={{ marginBottom: 2 }}>
              {profile.businessName || profile.username}
              {profile.verified ? " ✓" : ""}
            </h1>
            <p className="cv-muted">
              @{profile.username}
              {profile.location ? ` · ${profile.location}` : ""}
            </p>
            {profile.bio && (
              <p className="cv-dim" style={{ marginTop: 10, fontSize: 14.5 }}>
                {profile.bio}
              </p>
            )}
          </div>
          <button
            className="cv-btn cv-btn-ghost cv-btn-inline"
            onClick={() => {
              logout();
              navigate("/events");
            }}
          >
            Log out
          </button>
        </div>

        <div className="cv-stats" style={{ marginTop: 22 }}>
          <Stat n={profile.followersCount ?? 0} label="Followers" />
          <Stat n={profile.followingCount ?? 0} label="Following" />
          <Stat n={tickets.length} label="Tickets" />
          <Stat n={hosted.length} label="Events hosted" />
        </div>

        {profile.isVendor && profile.vendorId && (
          <Link
            to={`/vendors/${profile.vendorId}`}
            className="cv-btn cv-btn-ghost cv-btn-inline"
            style={{ marginTop: 18 }}
          >
            View your vendor page →
          </Link>
        )}
      </section>

      {/* ── Tickets ──────────────────────────────────────── */}
      <section className="cv-section">
        <h3 className="cv-h3">Your tickets</h3>
        {tickets.length === 0 ? (
          <div className="cv-panel">
            <p className="cv-muted" style={{ marginBottom: 14 }}>
              You haven't bought any tickets yet.
            </p>
            <Link to="/events" className="cv-btn cv-btn-inline">
              Browse events
            </Link>
          </div>
        ) : (
          <div className="cv-panel">
            {upcoming.map((t) => (
              <TicketRow key={t._id} ticket={t} />
            ))}
            {past.length > 0 && (
              <>
                <p className="cv-eyebrow" style={{ marginTop: 18 }}>
                  Past
                </p>
                {past.map((t) => (
                  <TicketRow key={t._id} ticket={t} past />
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Hosted events ────────────────────────────────── */}
      {hosted.length > 0 && (
        <section className="cv-section">
          <h3 className="cv-h3">Events you're hosting</h3>
          <div className="cv-grid">
            {hosted.map((e) => (
              <EventCard key={e._id} ev={{ ...e, kind: "native" }} />
            ))}
          </div>
        </section>
      )}

      <AppPromo variant={tickets.length ? "ticket" : "profile"} />
    </Layout>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="cv-stat-n">{n}</div>
      <div className="cv-stat-l">{label}</div>
    </div>
  );
}

function TicketRow({ ticket, past = false }: { ticket: Ticket; past?: boolean }) {
  const ev = ticket.event;
  if (!ev) return null;
  return (
    <Link to={`/events/${ev._id}`} className="cv-list-row" style={{ opacity: past ? 0.6 : 1 }}>
      <Avatar src={ev.image || ev.images?.[0]} name={ev.title} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 650 }}>{ev.title}</span>
        <span className="cv-muted">
          {formatDateTime(ev.date)}
          {ticket.tierName ? ` · ${ticket.tierName}` : ""}
        </span>
      </span>
      {ticket.price ? (
        <span className="cv-pill cv-pill-accent">{money(ticket.price, ticket.currency)}</span>
      ) : null}
    </Link>
  );
}
