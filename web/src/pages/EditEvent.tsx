import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { EventItem } from "../lib/types";

interface TierRow {
  name: string;
  price: string;
  quantity: string;
}

/** ISO string → value for <input type="datetime-local"> in the viewer's tz. */
function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function EditEvent() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ev, setEv] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  // Editable fields.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  // Pricing (paid events).
  const [useTiers, setUseTiers] = useState(false);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [ticketPrice, setTicketPrice] = useState("");
  const [maxGuests, setMaxGuests] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login", { state: { from: `/my-events/${eventId}/edit` }, replace: true });
      return;
    }
    api<{ event: EventItem }>(`/events/${eventId}`)
      .then(({ event }) => {
        setEv(event);
        document.title = `Edit – ${event.title}`;
        setTitle(event.title || "");
        setDescription(event.description || "");
        setDate(toLocalInput(event.date));
        setLocation(event.location || "");
        setAddress(event.address || "");
        setMeetingLink(event.meetingLink || "");
        const hasTiers = !!event.ticketTiers?.length;
        setUseTiers(hasTiers);
        if (hasTiers) {
          setTiers(
            event.ticketTiers!.map((t) => ({
              name: t.name,
              price: String(t.price),
              quantity: t.quantity !== undefined ? String(t.quantity) : "",
            }))
          );
        }
        setTicketPrice(event.ticketPrice ? String(event.ticketPrice) : "");
        setMaxGuests(event.maxGuests ? String(event.maxGuests) : "");
      })
      .catch((err) => setError(err.message || "Couldn't load this event"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user]);

  function updateTier(i: number, patch: Partial<TierRow>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function addTier() {
    setTiers((prev) => [...prev, { name: "", price: "", quantity: "" }]);
  }
  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!ev) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description,
        date: date ? new Date(date).toISOString() : undefined,
      };
      if (ev.isVirtual) {
        body.meetingLink = meetingLink;
      } else {
        body.location = location;
        body.address = address;
      }
      if (ev.isPaid) {
        if (useTiers) {
          body.ticketTiers = tiers.map((t) => ({
            name: t.name.trim(),
            price: Number(t.price),
            ...(t.quantity !== "" ? { quantity: Number(t.quantity) } : {}),
          }));
        } else {
          if (ticketPrice !== "") body.ticketPrice = Number(ticketPrice);
          if (maxGuests !== "") body.maxGuests = Number(maxGuests);
        }
      }

      const res = await api<{ message: string; pendingApproval?: boolean }>(
        `/events/${eventId}`,
        { method: "PUT", body }
      );
      setNotice(res.message);
      // Give the creator a beat to read the pending-approval note, then return.
      setTimeout(() => navigate("/my-events"), 1800);
    } catch (err: any) {
      setError(err.message || "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="cv-muted">Loading…</p>
      </Layout>
    );
  }
  if (error && !ev) {
    return (
      <Layout>
        <div className="cv-error">{error}</div>
        <Link to="/my-events" className="cv-link">
          ← Back to my events
        </Link>
      </Layout>
    );
  }

  return (
    <Layout>
      <Link to="/my-events" className="cv-muted" style={{ display: "inline-block", marginBottom: 12 }}>
        ← My events
      </Link>
      <h1 className="cv-h1">Edit event</h1>
      <p className="cv-h2" style={{ marginBottom: 8 }}>
        {ev?.title}
      </p>
      <p className="cv-muted" style={{ marginBottom: 20, fontSize: 14 }}>
        Title, description, photos and location go live immediately. Changes to{" "}
        <strong>price, ticket tiers, capacity or date</strong> need admin approval before the public
        sees them.
      </p>

      {error && <div className="cv-error">{error}</div>}
      {notice && (
        <div className="cv-panel cv-section" style={{ borderColor: "#7c3aed" }}>
          {notice}
        </div>
      )}

      <div style={{ maxWidth: 560, display: "grid", gap: 16 }}>
        <div>
          <label className="cv-label">Title</label>
          <input className="cv-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <label className="cv-label">Description</label>
          <textarea
            className="cv-input"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="cv-label">Date &amp; time — needs approval</label>
          <input
            className="cv-input"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {ev?.isVirtual ? (
          <div>
            <label className="cv-label">Meeting link</label>
            <input
              className="cv-input"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="cv-label">Location</label>
              <input
                className="cv-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <label className="cv-label">Address</label>
              <input
                className="cv-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </>
        )}

        {ev?.isPaid && (
          <div className="cv-card" style={{ marginLeft: 0 }}>
            <h3 className="cv-h3" style={{ marginBottom: 4 }}>
              Pricing — needs approval
            </h3>
            <p className="cv-muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Prices in {ev.currency || "USD"}. Leave tier quantities blank to keep sharing one
              overall capacity, or set a quantity on every tier to cap each one.
            </p>

            {useTiers ? (
              <div style={{ display: "grid", gap: 12 }}>
                {tiers.map((t, i) => (
                  <div key={i} style={{ display: "grid", gap: 6 }}>
                    <div className="cv-row">
                      <strong>Tier {i + 1}</strong>
                      {tiers.length > 1 && (
                        <button
                          type="button"
                          className="cv-linkbtn"
                          onClick={() => removeTier(i)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      className="cv-input"
                      placeholder="Name (e.g. VIP)"
                      value={t.name}
                      onChange={(e) => updateTier(i, { name: e.target.value })}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        className="cv-input"
                        type="number"
                        min="0"
                        placeholder="Price"
                        value={t.price}
                        onChange={(e) => updateTier(i, { price: e.target.value })}
                      />
                      <input
                        className="cv-input"
                        type="number"
                        min="0"
                        placeholder="Quantity (optional)"
                        value={t.quantity}
                        onChange={(e) => updateTier(i, { quantity: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
                <button type="button" className="cv-btn cv-btn-ghost cv-btn-inline" onClick={addTier}>
                  + Add tier
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label className="cv-label">Ticket price</label>
                  <input
                    className="cv-input"
                    type="number"
                    min="0"
                    value={ticketPrice}
                    onChange={(e) => setTicketPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="cv-label">Capacity (max guests)</label>
                  <input
                    className="cv-input"
                    type="number"
                    min="0"
                    value={maxGuests}
                    onChange={(e) => setMaxGuests(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <button className="cv-btn" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Layout>
  );
}
