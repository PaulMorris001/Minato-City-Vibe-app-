import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import AppPromo from "../components/AppPromo";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { EventItem } from "../lib/types";
import { fallbackGradient, formatDateTime, money, relativeDay } from "../lib/format";

export default function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ev, setEv] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Free-event RSVP state
  const [rsvping, setRsvping] = useState(false);
  const [rsvpError, setRsvpError] = useState("");
  const [justJoined, setJustJoined] = useState(false);

  function loadEvent() {
    // The detail endpoint wraps the event: { event: {...} }.
    return api<{ event: EventItem }>(`/events/${eventId}`).then(({ event }) => {
      setEv(event);
      document.title = `${event.title} – OurCityvibe`;
      if (event.ticketTiers && event.ticketTiers.length === 1) {
        setSelectedTier(event.ticketTiers[0]._id);
      }
      return event;
    });
  }

  useEffect(() => {
    setLoading(true);
    loadEvent()
      .catch((err) => setError(err.message || "Couldn't load this event"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function goToPay() {
    // No login gate — checkout supports guests (they confirm an email with an OTP
    // on the Pay page). A pre-selected tier is passed through as the builder's
    // starting point.
    const tiers = ev?.ticketTiers || [];
    const q = tiers.length > 1 && selectedTier ? `?tier=${selectedTier}` : "";
    navigate(`/events/${eventId}/pay${q}`);
  }

  async function rsvpFree() {
    if (!user) {
      navigate("/login", { state: { from: `/events/${eventId}` } });
      return;
    }
    setRsvpError("");
    setRsvping(true);
    try {
      await api(`/events/${eventId}/join`, { method: "POST" });
      setJustJoined(true);
      loadEvent().catch(() => {});
    } catch (err: any) {
      // "already joined" → treat as success so the UI reflects reality.
      if (/already joined/i.test(err.message || "")) setJustJoined(true);
      else setRsvpError(err.message || "Couldn't RSVP. Please try again.");
    } finally {
      setRsvping(false);
    }
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: ev?.title, url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
  const tiers = ev.ticketTiers || [];
  const host = ev.createdBy;
  const going =
    justJoined || ev.userRsvp || ev.userStatus === "accepted" || ev.userStatus === "creator";
  const attending = ev.rsvpCount ?? ev.invitedUsers?.length ?? 0;
  const soon = relativeDay(ev.date);

  return (
    <Layout>
      <Link to="/events" className="cv-muted" style={{ display: "inline-block", marginBottom: 16 }}>
        ← All events
      </Link>

      {/* ── Hero ─────────────────────────────────────────── */}
      <div
        className="cv-hero"
        style={cover ? undefined : { background: fallbackGradient(ev._id), minHeight: 260 }}
      >
        {cover && <img src={cover} alt={ev.title} />}
        <div className="cv-hero-scrim" />
        <div className="cv-hero-text">
          <div className="cv-chips" style={{ marginBottom: 10 }}>
            <span className={`cv-pill ${ev.isPaid ? "cv-pill-accent" : "cv-pill-free"}`}>
              {ev.isPaid ? "Ticketed" : "Free event"}
            </span>
            {ev.isVirtual && <span className="cv-pill">Online</span>}
            {soon && <span className="cv-pill">{soon}</span>}
            {going && <span className="cv-pill cv-pill-free">You're going</span>}
          </div>
          <h1 className="cv-h1" style={{ marginBottom: 4 }}>
            {ev.title}
          </h1>
          <p className="cv-dim" style={{ fontSize: 15 }}>
            {formatDateTime(ev.date)} · {ev.isVirtual ? "Online" : ev.location}
          </p>
        </div>
      </div>

      <div className="cv-detail">
        {/* ── Main column ───────────────────────────────── */}
        <div>
          {/* Host */}
          {host && (
            <section className="cv-panel cv-section">
              <p className="cv-eyebrow">Hosted by</p>
              <Link to={`/u/${host._id}`} style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Avatar src={host.profilePicture} name={host.username} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>
                    {host.businessName || host.username}
                    {host.verified ? " ✓" : ""}
                  </span>
                  <span className="cv-muted">
                    @{host.username}
                    {host.hostedEventsCount
                      ? ` · ${host.hostedEventsCount} event${
                          host.hostedEventsCount === 1 ? "" : "s"
                        } hosted`
                      : ""}
                  </span>
                </span>
              </Link>

              {!!ev.cohosts?.length && (
                <div style={{ marginTop: 16 }}>
                  <p className="cv-eyebrow">Co-hosts</p>
                  {ev.cohosts.map((c) => (
                    <Link key={c._id} to={`/u/${c._id}`} className="cv-list-row">
                      <Avatar src={c.profilePicture} name={c.username} size="sm" />
                      <span>@{c.username}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Stats */}
          <section className="cv-panel cv-section">
            <div className="cv-stats">
              <div>
                <div className="cv-stat-n">{attending}</div>
                <div className="cv-stat-l">Going</div>
              </div>
              {ev.isPaid && ev.ticketsSold !== undefined && (
                <div>
                  <div className="cv-stat-n">{ev.ticketsSold}</div>
                  <div className="cv-stat-l">Tickets sold</div>
                </div>
              )}
              {ev.isPaid && ev.ticketsRemaining !== undefined && !!ev.maxGuests && (
                <div>
                  <div className="cv-stat-n">{ev.ticketsRemaining}</div>
                  <div className="cv-stat-l">Left</div>
                </div>
              )}
              {!!ev.friendsGoing && (
                <div>
                  <div className="cv-stat-n">{ev.friendsGoing}</div>
                  <div className="cv-stat-l">Friends going</div>
                </div>
              )}
              {!!ev.seenCount && (
                <div>
                  <div className="cv-stat-n">{ev.seenCount}</div>
                  <div className="cv-stat-l">Views</div>
                </div>
              )}
            </div>
          </section>

          {/* About */}
          {ev.description && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">About this event</h3>
              <p className="cv-body-text">{ev.description}</p>
            </section>
          )}

          {/* Where / when */}
          <section className="cv-panel cv-section">
            <h3 className="cv-h3">Details</h3>
            <div className="cv-facts">
              <Fact icon="📅" label="Date & time" value={formatDateTime(ev.date)} />
              <Fact
                icon={ev.isVirtual ? "💻" : "📍"}
                label={ev.isVirtual ? "Where" : "Location"}
                value={
                  ev.isVirtual
                    ? "Online — link shared with attendees"
                    : [ev.location, ev.address].filter(Boolean).join(" · ")
                }
                href={
                  ev.isVirtual
                    ? undefined
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [ev.address, ev.location].filter(Boolean).join(", ")
                      )}`
                }
              />
              {ev.meetingLink && (
                <Fact icon="🔗" label="Meeting link" value={ev.meetingLink} href={ev.meetingLink} />
              )}
              {!ev.meetingLink && ev.hasMeetingLink && (
                <Fact icon="🔗" label="Meeting link" value="Shared with attendees once you join" />
              )}
              <Fact
                icon="🎟️"
                label="Entry"
                value={
                  ev.isPaid
                    ? `Tickets from ${money(
                        tiers.length ? Math.min(...tiers.map((t) => t.price)) : ev.ticketPrice || 0,
                        ev.currency
                      )}`
                    : "Free — RSVP to join the guest list"
                }
              />
              {!!ev.maxGuests && <Fact icon="👥" label="Capacity" value={`${ev.maxGuests} guests`} />}
            </div>
          </section>

          {/* Vendors */}
          {!!ev.vendors?.length && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">Vendors at this event</h3>
              {ev.vendors.map((v) => (
                <Link key={v._id} to={`/vendors/${v._id}`} className="cv-list-row">
                  <Avatar src={v.images?.[0]} name={v.name} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 650 }}>
                      {v.name}
                      {v.verified ? " ✓" : ""}
                    </span>
                    <span className="cv-muted">
                      {typeof v.vendorType === "object" ? v.vendorType?.name : "Vendor"}
                      {v.rating ? ` · ★ ${v.rating}` : ""}
                    </span>
                  </span>
                  <span className="cv-muted">→</span>
                </Link>
              ))}
            </section>
          )}

          {/* Guest list */}
          {!!ev.rsvpUsers?.length && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">Who's going</h3>
              <div className="cv-avatar-stack" style={{ marginBottom: 12 }}>
                {ev.rsvpUsers.slice(0, 10).map((u) => (
                  <Avatar key={u._id} src={u.profilePicture} name={u.username} size="sm" />
                ))}
              </div>
              <p className="cv-muted">
                {ev.rsvpUsers
                  .slice(0, 3)
                  .map((u) => `@${u.username}`)
                  .join(", ")}
                {ev.rsvpUsers.length > 3 ? ` and ${ev.rsvpUsers.length - 3} more` : ""} are going.
              </p>
            </section>
          )}

          {/* Gallery */}
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

          <AppPromo variant={going || ev.userHasPurchased ? "ticket" : "default"} />
        </div>

        {/* ── Ticket sidebar ────────────────────────────── */}
        <aside className="cv-sticky">
          <div className="cv-panel">
            <TicketBox
              ev={ev}
              user={user}
              going={going}
              tiers={tiers}
              selectedTier={selectedTier}
              setSelectedTier={setSelectedTier}
              rsvping={rsvping}
              rsvpError={rsvpError}
              onRsvp={rsvpFree}
              onPay={goToPay}
            />
            <button className="cv-btn cv-btn-ghost" style={{ marginTop: 10 }} onClick={share}>
              {copied ? "Link copied ✓" : "Share this event"}
            </button>
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

/** The purchase / RSVP call to action — the one thing the sidebar exists for. */
function TicketBox({
  ev,
  user,
  going,
  tiers,
  selectedTier,
  setSelectedTier,
  rsvping,
  rsvpError,
  onRsvp,
  onPay,
}: {
  ev: EventItem;
  user: { username: string } | null;
  going: boolean;
  tiers: NonNullable<EventItem["ticketTiers"]>;
  selectedTier: string | null;
  setSelectedTier: (id: string) => void;
  rsvping: boolean;
  rsvpError: string;
  onRsvp: () => void;
  onPay: () => void;
}) {
  const multiTier = tiers.length > 1;
  const soldOut = ev.ticketsRemaining !== undefined && ev.ticketsRemaining <= 0;

  if (!ev.isPaid) {
    return going ? (
      <>
        <h3 className="cv-h3">You're going 🎉</h3>
        <p className="cv-muted">
          You're on the guest list. Open the CityVibe app for the group chat and updates.
        </p>
      </>
    ) : (
      <>
        <h3 className="cv-h3">Free event</h3>
        <p className="cv-muted" style={{ marginBottom: 16 }}>
          RSVP to join the guest list — no charge.
        </p>
        {rsvpError && <div className="cv-error">{rsvpError}</div>}
        <button className="cv-btn" onClick={onRsvp} disabled={rsvping}>
          {rsvping ? "Joining…" : user ? "RSVP — I'm going" : "Log in to RSVP"}
        </button>
      </>
    );
  }

  if (ev.userHasPurchased) {
    // Already have a ticket — you can still buy more (e.g. to bring or gift to
    // friends); each extra pass is emailed to whoever you choose at checkout.
    const canBuyMore = !soldOut && ev.ticketingReady !== false;
    return (
      <>
        <h3 className="cv-h3">You're going 🎉</h3>
        <p className="cv-muted" style={{ marginBottom: canBuyMore ? 16 : 0 }}>
          Your ticket is on your account — open the app to show the QR code at the door.
        </p>
        {canBuyMore && (
          <>
            <p className="cv-muted" style={{ marginBottom: 12 }}>
              Bringing friends? Grab more tickets and send each pass straight to their email.
            </p>
            <button className="cv-btn" onClick={onPay}>
              Buy more tickets
            </button>
          </>
        )}
      </>
    );
  }
  if (soldOut) {
    return (
      <>
        <h3 className="cv-h3">Sold out</h3>
        <p className="cv-muted">There are no tickets left for this event.</p>
      </>
    );
  }
  if (ev.ticketingReady === false) {
    return (
      <>
        <h3 className="cv-h3">Tickets aren't on sale yet</h3>
        <p className="cv-muted">Check back soon — the organizer is still setting up.</p>
      </>
    );
  }

  return (
    <>
      <h3 className="cv-h3">Get your ticket</h3>
      <p className="cv-muted" style={{ marginBottom: 16 }}>
        Prices in {ev.currency || "USD"}.
        {ev.ticketsRemaining !== undefined && !!ev.maxGuests
          ? ` Only ${ev.ticketsRemaining} left.`
          : ""}
      </p>

      {multiTier ? (
        <div style={{ marginBottom: 16 }}>
          {tiers.map((t) => {
            const tierSoldOut = t.remaining !== undefined && t.remaining <= 0;
            return (
              <label
                key={t._id}
                className={`cv-tier${selectedTier === t._id ? " cv-tier-on" : ""}`}
                style={tierSoldOut ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="radio"
                    name="tier"
                    checked={selectedTier === t._id}
                    disabled={tierSoldOut}
                    onChange={() => setSelectedTier(t._id)}
                  />
                  <span>
                    {t.name}
                    {tierSoldOut ? (
                      <span className="cv-muted" style={{ display: "block", fontSize: 12 }}>
                        Sold out
                      </span>
                    ) : t.remaining !== undefined ? (
                      <span className="cv-muted" style={{ display: "block", fontSize: 12 }}>
                        {t.remaining} left
                      </span>
                    ) : null}
                  </span>
                </span>
                <strong>{money(t.price, ev.currency)}</strong>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="cv-row" style={{ marginBottom: 16 }}>
          <span className="cv-muted">
            {tiers[0]?.name || "General admission"}
            {tiers[0]?.remaining !== undefined ? ` · ${tiers[0].remaining} left` : ""}
          </span>
          <strong style={{ fontSize: 20 }}>
            {money(tiers[0]?.price ?? ev.ticketPrice ?? 0, ev.currency)}
          </strong>
        </div>
      )}

      <button className="cv-btn" onClick={onPay} disabled={multiTier && !selectedTier}>
        Continue to payment
      </button>
    </>
  );
}
