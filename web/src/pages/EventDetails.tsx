import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import AppPromo from "../components/AppPromo";
import VenueChoice, { venueCount } from "../components/VenueChoice";
import ProgrammePicker, { eventStops, selectionTotal } from "../components/ProgrammePicker";
import { api } from "../lib/api";
import { storeUrlForDevice } from "../lib/app";
import { isVideoUrl, videoPosterUrl } from "../lib/media";
import { useAuth } from "../context/AuthContext";
import type { EventItem, EventSubEvent } from "../lib/types";
import { fallbackGradient, formatDateTime, money, nativePlace, relativeDay } from "../lib/format";

export default function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ev, setEv] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Shareable QR. Rendered server-side (GET /events/:id/qr) so the code is
  // identical everywhere it appears — app, web, printed flyer — and the web
  // bundle doesn't ship a QR encoder.
  const [qr, setQr] = useState<{ url: string; qr: string } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrError, setQrError] = useState("");

  // Free-event RSVP state
  const [rsvping, setRsvping] = useState(false);
  const [rsvpError, setRsvpError] = useState("");
  const [justJoined, setJustJoined] = useState(false);

  // Multi-venue events ask which venue the attendee is going to, so the
  // organizer knows who to expect at each door. The index is what the server
  // stores; the order below must stay "venue #1, then additionalLocations".
  const [venueIndex, setVenueIndex] = useState<number | null>(null);

  // Which stops of a programme the viewer is picking. Seeded from the server so
  // someone already going sees their own picks; a guest starts with none ticked.
  const [selectedStops, setSelectedStops] = useState<(string | null)[]>([]);

  // A private event the viewer isn't on the guest list for yet, loaded through
  // the share-link endpoint: holding the link is the invite, same as the app's
  // share screen. RSVPing goes through the share-link join, which also adds them
  // to the event's group chat (which only exists in the app).
  const [viaInvite, setViaInvite] = useState(false);

  function loadEvent() {
    // The detail endpoint wraps the event: { event: {...} }.
    return api<{ event: EventItem }>(`/events/${eventId}`)
      .then((res) => {
        setViaInvite(false);
        return res;
      })
      .catch((err) => {
        if (err.status !== 401 && err.status !== 403) throw err;
        return api<{ event: EventItem }>(`/events/share/${eventId}`, { auth: false }).then((res) => {
          setViaInvite(true);
          return res;
        });
      })
      .then(({ event }) => {
        setEv(event);
        document.title = `${event.title} – OurCityvibe`;
        if (event.ticketTiers && event.ticketTiers.length === 1) {
          setSelectedTier(event.ticketTiers[0]._id);
        }
        // Seeded from the server so someone already going sees their own pick.
        setVenueIndex(event.userLocationIndex ?? null);
        setSelectedStops(event.userSubEvents ?? []);
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

  // Back from login/signup after tapping RSVP: complete it. Skipped when the
  // guest still has a choice to make (venue, programme stops) — they land on
  // the event with the picker and one tap left.
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeRsvp = searchParams.get("rsvp") === "1";
  useEffect(() => {
    if (!resumeRsvp || !user || !ev) return;
    setSearchParams({}, { replace: true });
    const alreadyGoing = ev.userRsvp || ev.userStatus === "accepted" || ev.userStatus === "creator";
    const needsPick = !!ev.subEvents?.length || venueCount(ev) > 1;
    const over = ev.salesClosedReason === "cancelled" || ev.salesClosedReason === "ended";
    if (alreadyGoing || needsPick || ev.isPaid || over) return;
    rsvpFree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeRsvp, user, ev]);

  function goToPay() {
    // No login gate — checkout supports guests (they confirm an email with an OTP
    // on the Pay page). A pre-selected tier is passed through as the builder's
    // starting point.
    const tiers = ev?.ticketTiers || [];
    const params = new URLSearchParams();
    if (tiers.length > 1 && selectedTier) params.set("tier", selectedTier);
    // Seeds every ticket in the builder; each one can still be re-pointed there.
    if (venueIndex !== null) params.set("venue", String(venueIndex));
    // A programme: hand Pay the exact stops ticked here, main event as "main"
    // (URLSearchParams can't carry a literal null through a query string).
    if (ev?.subEvents?.length) {
      params.set("stops", selectedStops.map((id) => id ?? "main").join(","));
    }
    const q = params.toString();
    navigate(`/events/${eventId}/pay${q ? `?${q}` : ""}`);
  }

  async function rsvpFree() {
    if (!user) {
      // `?rsvp=1` finishes the RSVP on the way back (see the effect below), so
      // signing up doesn't end with a second tap. A private invite mostly
      // reaches people with no account yet, so it opens on signup; that page
      // links to login and carries `from` across.
      navigate(ev?.isPublic === false ? "/signup" : "/login", {
        state: { from: `/events/${eventId}?rsvp=1` },
      });
      return;
    }
    setRsvpError("");
    setRsvping(true);
    try {
      if (viaInvite) {
        // Puts them on the guest list and in the group chat; /rsvp would 403
        // until they're on it. Programme picks follow once they are.
        await api(`/events/share/${eventId}/join`, {
          method: "POST",
          body: venueIndex !== null ? { locationIndex: venueIndex } : {},
        });
        if (ev?.subEvents?.length) {
          await api(`/events/${ev._id}/rsvp`, {
            method: "POST",
            body: { subEvents: selectedStops },
          });
        }
      } else if (ev?.subEvents?.length) {
        // The multi-select reconcile: `selectedStops` is the guest's full,
        // authoritative pick (main event as null), resent on every change —
        // /join has no notion of "which stops" and only ever allows one join.
        await api(`/events/${eventId}/rsvp`, {
          method: "POST",
          body: { subEvents: selectedStops },
        });
      } else {
        await api(`/events/${eventId}/join`, {
          method: "POST",
          body: venueIndex !== null ? { locationIndex: venueIndex } : {},
        });
      }
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

  function toggleQr() {
    const next = !qrOpen;
    setQrOpen(next);
    if (!next || qr) return;
    setQrError("");
    api<{ url: string; qr: string }>(`/events/${eventId}/qr`)
      .then(setQr)
      .catch(() => setQrError("Couldn't load the QR code."));
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

  const coverMedia = ev.image || ev.images?.[0];
  // The hero has the title and date laid over it, so a video there is shown as
  // its still frame — it plays in the gallery below instead. A video we can't
  // derive a poster from falls through to the gradient placeholder.
  const cover = isVideoUrl(coverMedia) ? videoPosterUrl(coverMedia) : coverMedia;
  const gallery = (ev.images || []).filter((item) => item !== coverMedia);
  const tiers = ev.ticketTiers || [];
  const host = ev.createdBy;
  const going =
    justJoined || ev.userRsvp || ev.userStatus === "accepted" || ev.userStatus === "creator";
  const soon = relativeDay(ev.date);

  // Headcount and capacity reach the organizer always, and everyone else only
  // when the host turned on `showAttendance`. The API strips the fields in
  // every other case (see applyAttendanceVisibility on the server), so their
  // presence IS the permission check — no separate role lookup, co-hosts are
  // covered, and the opt-in needs no extra branch here. Same rule mobile
  // applies in app/event/[id].tsx.
  const attending = ev.rsvpCount;
  const canSeeAttendance =
    attending !== undefined || ev.ticketsSold !== undefined || ev.maxGuests !== undefined;

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
              {ev.isPaid ? "Ticketed" : ev.isPublic === false ? "Private invite" : "Free event"}
            </span>
            {ev.isVirtual && <span className="cv-pill">Online</span>}
            {soon && <span className="cv-pill">{soon}</span>}
            {going && <span className="cv-pill cv-pill-free">You're going</span>}
          </div>
          <h1 className="cv-h1" style={{ marginBottom: 4 }}>
            {ev.title}
          </h1>
          <p className="cv-dim" style={{ fontSize: 15 }}>
            {formatDateTime(ev.date)} · {nativePlace(ev)}
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

          {/* Stats — attendance numbers are organizer-only unless the host
              opted in. View counts are deliberately not shown on the website
              at all (mobile's Event Dashboard is the organizer-only place
              for that number). */}
          {canSeeAttendance && (
          <section className="cv-panel cv-section">
            <div className="cv-stats">
              {attending !== undefined && (
                <div>
                  <div className="cv-stat-n">{attending}</div>
                  <div className="cv-stat-l">Going</div>
                </div>
              )}
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
            </div>
          </section>
          )}

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
              {ev.isVirtual ? (
                <Fact icon="💻" label="Where" value="Online — link shared with attendees" />
              ) : (
                // Venue #1 is the event's own fields; one ticket covers every venue.
                [ev, ...(ev.additionalLocations ?? [])].map((venue, i, all) => (
                  <Fact
                    key={i}
                    icon="📍"
                    label={all.length > 1 ? `Location ${i + 1} of ${all.length}` : "Location"}
                    value={[venue.location, venue.address].filter(Boolean).join(" · ")}
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      [venue.address, venue.location].filter(Boolean).join(", ")
                    )}`}
                  />
                ))
              )}
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
                  ev.hidePrice ? "Price on request" : ev.isPaid
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

          {/* Programme — the stops of a multi-part event, already time-ordered
              by the server. */}
          {!!ev.subEvents?.length && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">Programme</h3>
              <p className="cv-muted" style={{ marginBottom: 12 }}>
                {ev.subEvents.length} sub-event{ev.subEvents.length === 1 ? "" : "s"} — come to
                whichever you like.
              </p>
              {ev.subEvents.map((stop) => (
                <div key={stop._id} className="cv-list-row">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 650 }}>{stop.title}</span>
                    <span className="cv-muted" style={{ display: "block" }}>
                      {formatDateTime(stop.date)}
                    </span>
                    <span className="cv-muted" style={{ display: "block" }}>
                      {[stop.address, stop.location].filter(Boolean).join(" · ")}
                    </span>
                    {!!stop.description && (
                      <span className="cv-muted" style={{ display: "block", marginTop: 4 }}>
                        {stop.description}
                      </span>
                    )}
                  </span>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <strong>{stopPriceText(stop, ev.currency)}</strong>
                    {/* Availability survives the organiser's attendance
                        opt-out; the numbers behind it don't. */}
                    {stop.salesClosed ? (
                      <span className="cv-muted" style={{ display: "block" }}>
                        {stop.salesClosedReason === "ended" ? "Over" : "Closed"}
                      </span>
                    ) : stop.soldOut ? (
                      <span className="cv-muted" style={{ display: "block" }}>
                        Full
                      </span>
                    ) : typeof stop.remaining === "number" ? (
                      <span className="cv-muted" style={{ display: "block" }}>
                        {stop.remaining} left
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </section>
          )}

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
              <h3 className="cv-h3">{gallery.some(isVideoUrl) ? "Photos & videos" : "Photos"}</h3>
              <div className="cv-gallery">
                {gallery.map((item) =>
                  isVideoUrl(item) ? (
                    <video
                      key={item}
                      src={item}
                      controls
                      playsInline
                      preload="metadata"
                      poster={videoPosterUrl(item) || undefined}
                    />
                  ) : (
                    <img key={item} src={item} alt="" loading="lazy" />
                  )
                )}
              </div>
            </section>
          )}

          <AppPromo
            variant={
              ev.isPublic === false ? "invite" : going || ev.userHasPurchased ? "ticket" : "default"
            }
          />
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
              venueIndex={venueIndex}
              setVenueIndex={setVenueIndex}
              selectedStops={selectedStops}
              setSelectedStops={setSelectedStops}
            />
            <button className="cv-btn cv-btn-ghost" style={{ marginTop: 10 }} onClick={share}>
              {copied ? "Link copied ✓" : "Share this event"}
            </button>
            {/* The QR endpoint only serves viewers already on the guest list. */}
            {!viaInvite && (
              <button
                className="cv-btn cv-btn-ghost"
                style={{ marginTop: 10 }}
                onClick={toggleQr}
                aria-expanded={qrOpen}
              >
                {qrOpen ? "Hide QR code" : "Show QR code"}
              </button>
            )}

            {qrOpen && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                {qrError ? (
                  <div className="cv-error">{qrError}</div>
                ) : qr ? (
                  <>
                    {/* Fixed white plate in both themes — QR contrast is a
                        scanning requirement, not a styling choice. */}
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: 16,
                        padding: 12,
                        display: "inline-block",
                        lineHeight: 0,
                      }}
                    >
                      <img
                        src={qr.qr}
                        alt={`QR code linking to ${ev.title}`}
                        style={{ width: "100%", maxWidth: 220, height: "auto" }}
                      />
                    </div>
                    <p className="cv-muted" style={{ marginTop: 10, fontSize: 13 }}>
                      Scan to open this event in the OurCityvibe app — or here on the
                      web if the app isn't installed.
                    </p>
                  </>
                ) : (
                  <div className="cv-skel" style={{ height: 220 }} />
                )}
              </div>
            )}
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
/** Buyer-facing copy per `salesClosedReason` from the API. */
const SALES_CLOSED_COPY: Record<string, { heading: string; detail: string }> = {
  cancelled: {
    heading: "This event was cancelled",
    detail: "The organizer called it off. If you bought a ticket, you've been refunded.",
  },
  cancellation_pending: {
    heading: "Tickets are on hold",
    detail: "This event is under review. Sales are paused until it's resolved.",
  },
  ended: {
    heading: "This event has ended",
    detail: "Tickets are no longer on sale. Have a look at what's on next.",
  },
  closed_by_organizer: {
    heading: "Ticket sales are closed",
    detail: "The organizer has stopped selling tickets for this event.",
  },
  not_approved: {
    heading: "Tickets aren't on sale yet",
    detail: "Check back soon — this event is still being reviewed.",
  },
};

/**
 * Shown once a guest is on a private event's list. RSVPing put them in the
 * event's group chat, but that chat only exists in the app — without this they
 * leave the website not knowing it's there.
 */
function GroupChatNudge() {
  return (
    <div className="cv-success" style={{ marginTop: 16 }}>
      <strong>💬 You've been added to the event's group chat.</strong>
      <p style={{ margin: "6px 0 12px" }}>
        The chat with the host and other guests is only in the CityVibe app. Download it and log
        in with this same account to join the conversation.
      </p>
      <a className="cv-btn" href={storeUrlForDevice()} target="_blank" rel="noreferrer">
        Get the app to open the group chat
      </a>
    </div>
  );
}

/** "Free" / "$5" / "From $5" for one stop of a programme. */
function stopPriceText(stop: EventSubEvent, currency?: string) {
  if (stop.priceOnRequest) return "Price on request";
  const tiers = stop.ticketTiers ?? [];
  const price = tiers.length ? Math.min(...tiers.map((t) => t.price)) : stop.ticketPrice ?? 0;
  if (!price) return "Free";
  const amount = money(price, currency);
  return tiers.length > 1 ? `From ${amount}` : amount;
}

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
  venueIndex,
  setVenueIndex,
  selectedStops,
  setSelectedStops,
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
  venueIndex: number | null;
  setVenueIndex: (i: number) => void;
  selectedStops: (string | null)[];
  setSelectedStops: (stops: (string | null)[]) => void;
}) {
  const multiTier = tiers.length > 1;
  // The server sends soldOut to every viewer precisely because ticketsRemaining
  // is now withheld from non-organizers; fall back for older API responses.
  const soldOut =
    ev.soldOut ?? (ev.ticketsRemaining !== undefined && ev.ticketsRemaining <= 0);

  if (ev.hidePrice && (ev.isPaid || ev.subEvents?.some((stop) => stop.priceOnRequest || (stop.ticketPrice ?? 0) > 0))) {
    return <>
      <h3 className="cv-h3">Price on request</h3>
      <p className="cv-muted" style={{ marginBottom: 16 }}>
        Send an offer to the organizer’s chat in the app, settle on a price,
        then review and pay their final invoice.
      </p>
      {ev.salesClosed || soldOut ? <p className="cv-muted">{soldOut ? "Sold out" : "Ticket sales are closed."}</p> :
        <a className="cv-btn" href={`mobile://negotiate-ticket/${ev._id}`}>Negotiate price in the app</a>}
      <AppPromo />
    </>;
  }

  // A programme overrides the ordinary paid/free branching below entirely —
  // what matters is the PRICE OF WHAT'S TICKED, not the main event's own
  // isPaid flag. A free main event with one priced stop still needs the
  // picker shown before anything is confirmed, exactly like a fully paid one.
  if (ev.subEvents?.length) {
    const stops = eventStops(ev);
    const total = selectionTotal(stops, selectedStops);
    const nothingTicked = selectedStops.length === 0;
    return (
      <>
        <h3 className="cv-h3">{going ? "You're going 🎉" : "Pick what you're going to"}</h3>
        <p className="cv-muted" style={{ marginBottom: 16 }}>
          {going
            ? "Change your picks any time before the event."
            : "Tick as many stops as you like — one checkout covers all of them."}
        </p>
        <ProgrammePicker ev={ev} value={selectedStops} onChange={setSelectedStops} currency={ev.currency} />
        {rsvpError && <div className="cv-error">{rsvpError}</div>}
        <button
          className="cv-btn"
          onClick={total > 0 ? onPay : onRsvp}
          disabled={rsvping || nothingTicked}
        >
          {!user
            ? "Log in to continue"
            : nothingTicked
              ? "Pick at least one"
              : rsvping
                ? "Saving…"
                : total > 0
                  ? `Continue to payment · ${money(total, ev.currency)}`
                  : "Confirm — it's free"}
        </button>
        {going && ev.isPublic === false && <GroupChatNudge />}
      </>
    );
  }

  if (!ev.isPaid) {
    return going ? (
      <>
        <h3 className="cv-h3">You're going 🎉</h3>
        {ev.isPublic === false ? (
          <GroupChatNudge />
        ) : (
          <p className="cv-muted">
            You're on the guest list. Open the CityVibe app for the group chat and updates.
          </p>
        )}
      </>
    ) : ev.salesClosedReason === "cancelled" || ev.salesClosedReason === "ended" ? (
      // The server refuses these joins too; this just says so before the click.
      <>
        <h3 className="cv-h3">
          {ev.salesClosedReason === "cancelled" ? "This event was cancelled" : "This event has ended"}
        </h3>
        <p className="cv-muted">RSVPs are closed.</p>
      </>
    ) : (
      <>
        <h3 className="cv-h3">{ev.isPublic === false ? "You're invited" : "Free event"}</h3>
        <p className="cv-muted" style={{ marginBottom: 16 }}>
          RSVP to join the guest list — no charge.
        </p>
        <VenueChoice ev={ev} value={venueIndex} onChange={setVenueIndex} />
        {rsvpError && <div className="cv-error">{rsvpError}</div>}
        <button
          className="cv-btn"
          onClick={onRsvp}
          disabled={rsvping || (venueCount(ev) > 1 && venueIndex === null)}
        >
          {rsvping ? "Joining…" : user ? "RSVP — I'm going" : "Log in or sign up to RSVP"}
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
  // Sales can be shut for reasons that have nothing to do with capacity — the
  // event is over, the organizer paused it, a cancellation is being reviewed.
  // The server names the reason so the buyer sees the one that's actually true.
  if (ev.salesClosed) {
    const copy = SALES_CLOSED_COPY[ev.salesClosedReason ?? ""] ?? {
      heading: "Tickets aren't available",
      detail: "Ticket sales are closed for this event.",
    };
    return (
      <>
        <h3 className="cv-h3">{copy.heading}</h3>
        <p className="cv-muted">{copy.detail}</p>
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
            const tierSoldOut = t.soldOut ?? (t.remaining !== undefined && t.remaining <= 0);
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

      <VenueChoice ev={ev} value={venueIndex} onChange={setVenueIndex} />

      <button
        className="cv-btn"
        onClick={onPay}
        disabled={
          (multiTier && !selectedTier) || (venueCount(ev) > 1 && venueIndex === null)
        }
      >
        Continue to payment
      </button>
    </>
  );
}
