import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import AppPromo from "../components/AppPromo";
import EventCard from "../components/EventCard";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { EventItem, PublicUser } from "../lib/types";

/**
 * Public profile for anyone who hosts or attends events — reached from the
 * "Hosted by" card on an event page.
 *
 * The backend gates `/users/:id` and `/users/:id/events` behind `authenticate`,
 * so logged-out visitors get a sign-in prompt rather than a broken page.
 */
export default function UserProfile() {
  const { userId } = useParams();
  const { user: me } = useAuth();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api<{ user: PublicUser }>(`/users/${userId}`),
      api<{ events: EventItem[] }>(`/users/${userId}/events`).catch(() => ({ events: [] })),
      api<{ followers: number; following: number }>(`/follow/${userId}/counts`).catch(() => null),
    ])
      .then(([u, ev, c]) => {
        setProfile(u.user);
        setEvents(ev.events || []);
        if (c) setCounts(c);
        document.title = `@${u.user.username} – OurCityvibe`;
      })
      .catch((err) => setError(err.message || "Couldn't load this profile"))
      .finally(() => setLoading(false));
  }, [userId, me]);

  if (!me) {
    return (
      <Layout>
        <div className="cv-card">
          <h1>Log in to view profiles</h1>
          <p className="sub">
            CityVibe profiles are visible to members. Log in — or create an account — to see who's
            hosting.
          </p>
          <Link
            className="cv-btn"
            style={{ display: "block", textAlign: "center" }}
            to="/login"
            state={{ from: `/u/${userId}` }}
          >
            Log in
          </Link>
          <p className="cv-muted cv-center" style={{ marginTop: 14 }}>
            New here? <Link className="cv-link" to="/signup">Create an account</Link>
          </p>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="cv-skel" style={{ height: 180, marginBottom: 24 }} />
        <div className="cv-skel" style={{ height: 220 }} />
      </Layout>
    );
  }
  if (error || !profile) {
    return (
      <Layout>
        <div className="cv-error">{error || "Profile not found"}</div>
        <Link to="/events" className="cv-link">
          ← Back to all events
        </Link>
      </Layout>
    );
  }

  const upcoming = events.filter((e) => +new Date(e.date) >= Date.now());
  const past = events.filter((e) => +new Date(e.date) < Date.now());

  return (
    <Layout>
      <section className="cv-panel cv-section">
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar src={profile.profilePicture} name={profile.username} size="lg" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="cv-eyebrow">{profile.isVendor ? "Vendor & host" : "Host"}</p>
            <h1 className="cv-h1" style={{ marginBottom: 2 }}>
              {profile.businessName || profile.username}
              {profile.verified ? " ✓" : ""}
            </h1>
            <p className="cv-muted">@{profile.username}</p>
            {profile.bio && (
              <p className="cv-dim" style={{ marginTop: 10, fontSize: 14.5 }}>
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <div className="cv-stats" style={{ marginTop: 22 }}>
          {counts && (
            <>
              <div>
                <div className="cv-stat-n">{counts.followers}</div>
                <div className="cv-stat-l">Followers</div>
              </div>
              <div>
                <div className="cv-stat-n">{counts.following}</div>
                <div className="cv-stat-l">Following</div>
              </div>
            </>
          )}
          <div>
            <div className="cv-stat-n">{events.length}</div>
            <div className="cv-stat-l">Public events</div>
          </div>
        </div>

        {profile.vendorId && (
          <Link
            to={`/vendors/${profile.vendorId}`}
            className="cv-btn cv-btn-ghost cv-btn-inline"
            style={{ marginTop: 18 }}
          >
            See {profile.vendorName || "their"} vendor page →
          </Link>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="cv-section">
          <h3 className="cv-h3">Upcoming events</h3>
          <div className="cv-grid">
            {upcoming.map((e) => (
              <EventCard key={e._id} ev={{ ...e, kind: "native" }} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="cv-section">
          <h3 className="cv-h3">Past events</h3>
          <div className="cv-grid" style={{ opacity: 0.65 }}>
            {past.slice(0, 6).map((e) => (
              <EventCard key={e._id} ev={{ ...e, kind: "native" }} />
            ))}
          </div>
        </section>
      )}

      {events.length === 0 && (
        <div className="cv-panel cv-section">
          <p className="cv-muted">No public events from this host yet.</p>
        </div>
      )}

      <AppPromo variant="profile" />
    </Layout>
  );
}
