import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import AppPromo from "../components/AppPromo";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { fallbackGradient } from "../lib/format";
import type { Review, Vendor } from "../lib/types";

/**
 * Public vendor listing — reached from the "Vendors at this event" card.
 *
 * `/vendors/:vendorId` is guest-accessible and returns the vendor document
 * directly (not wrapped). Reviews require auth, so we only fetch them for
 * signed-in visitors. Booking/chat is app-only, so the CTA is a download link.
 */
export default function VendorProfile() {
  const { vendorId } = useParams();
  const { user } = useAuth();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api<Vendor>(`/vendors/${vendorId}`)
      .then((v) => {
        setVendor(v);
        document.title = `${v.name} – OurCityvibe`;
      })
      .catch((err) => setError(err.message || "Couldn't load this vendor"))
      .finally(() => setLoading(false));
  }, [vendorId]);

  useEffect(() => {
    if (!user) return;
    api<{ reviews: Review[]; total: number }>(`/vendors/${vendorId}/reviews?limit=5`)
      .then((r) => {
        setReviews(r.reviews || []);
        setReviewTotal(r.total || 0);
      })
      .catch(() => {});
  }, [vendorId, user]);

  if (loading) {
    return (
      <Layout>
        <div className="cv-skel" style={{ height: 260, marginBottom: 24 }} />
        <div className="cv-skel" style={{ height: 200 }} />
      </Layout>
    );
  }
  if (error || !vendor) {
    return (
      <Layout>
        <div className="cv-error">{error || "Vendor not found"}</div>
        <Link to="/events" className="cv-link">
          ← Back to all events
        </Link>
      </Layout>
    );
  }

  const cover = vendor.images?.[0];
  const gallery = (vendor.images || []).slice(1);
  const typeName = typeof vendor.vendorType === "object" ? vendor.vendorType?.name : undefined;
  const cityName =
    typeof vendor.city === "object"
      ? [vendor.city?.name, vendor.city?.state].filter(Boolean).join(", ")
      : undefined;
  const contact = vendor.contact || {};
  const links: { label: string; href: string }[] = [
    contact.website ? { label: "Website", href: normalize(contact.website) } : null,
    contact.instagram
      ? { label: "Instagram", href: `https://instagram.com/${handle(contact.instagram)}` }
      : null,
    contact.twitter ? { label: "X", href: `https://x.com/${handle(contact.twitter)}` } : null,
    contact.tiktok
      ? { label: "TikTok", href: `https://tiktok.com/@${handle(contact.tiktok)}` }
      : null,
    contact.facebook ? { label: "Facebook", href: normalize(contact.facebook) } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <Layout>
      <Link to="/events" className="cv-muted" style={{ display: "inline-block", marginBottom: 16 }}>
        ← All events
      </Link>

      <div
        className="cv-hero"
        style={cover ? undefined : { background: fallbackGradient(vendor._id), minHeight: 220 }}
      >
        {cover && <img src={cover} alt={vendor.name} />}
        <div className="cv-hero-scrim" />
        <div className="cv-hero-text">
          <div className="cv-chips" style={{ marginBottom: 10 }}>
            {typeName && <span className="cv-pill cv-pill-accent">{typeName}</span>}
            {vendor.verified && <span className="cv-pill cv-pill-free">Verified</span>}
            {!!vendor.rating && <span className="cv-pill">★ {vendor.rating}</span>}
          </div>
          <h1 className="cv-h1" style={{ marginBottom: 4 }}>
            {vendor.name}
          </h1>
          {cityName && (
            <p className="cv-dim" style={{ fontSize: 15 }}>
              📍 {cityName}
            </p>
          )}
        </div>
      </div>

      <div className="cv-detail">
        <div>
          {vendor.description && (
            <section className="cv-panel cv-section">
              <h3 className="cv-h3">About</h3>
              <p className="cv-body-text">{vendor.description}</p>
            </section>
          )}

          {!!gallery.length && (
            <section className="cv-section">
              <h3 className="cv-h3">Work</h3>
              <div className="cv-gallery">
                {gallery.map((img) => (
                  <img key={img} src={img} alt="" loading="lazy" />
                ))}
              </div>
            </section>
          )}

          <section className="cv-panel cv-section">
            <h3 className="cv-h3">Reviews {reviewTotal ? `(${reviewTotal})` : ""}</h3>
            {!user ? (
              <p className="cv-muted">
                <Link className="cv-link" to="/login" state={{ from: `/vendors/${vendorId}` }}>
                  Log in
                </Link>{" "}
                to read reviews from other CityVibe members.
              </p>
            ) : reviews.length === 0 ? (
              <p className="cv-muted">No reviews yet.</p>
            ) : (
              reviews.map((r) => (
                <div key={r._id} className="cv-list-row" style={{ alignItems: "flex-start" }}>
                  <Avatar src={r.user?.profilePicture} name={r.user?.username} size="sm" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 650 }}>
                      @{r.user?.username || "member"} · {"★".repeat(Math.round(r.rating))}
                    </span>
                    {r.review && (
                      <span className="cv-dim" style={{ fontSize: 14 }}>
                        {r.review}
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </section>

          <AppPromo variant="vendor" />
        </div>

        <aside className="cv-sticky">
          <div className="cv-panel">
            <h3 className="cv-h3">Work with {vendor.name}</h3>
            <p className="cv-muted" style={{ marginBottom: 16 }}>
              Quotes, bookings and payments happen in the CityVibe app — chat with the vendor and
              keep everything in one place.
            </p>
            {!!vendor.priceRange && (
              <div className="cv-row" style={{ marginBottom: 14 }}>
                <span className="cv-muted">Price range</span>
                <strong>{"$".repeat(Math.min(4, Math.max(1, vendor.priceRange)))}</strong>
              </div>
            )}
            {contact.phone && (
              <div className="cv-row" style={{ marginBottom: 14 }}>
                <span className="cv-muted">Phone</span>
                <a className="cv-link" href={`tel:${contact.phone}`}>
                  {contact.phone}
                </a>
              </div>
            )}
            {!!links.length && (
              <div className="cv-chips" style={{ marginBottom: 16 }}>
                {links.map((l) => (
                  <a key={l.label} className="cv-pill" href={l.href} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </Layout>
  );
}

function normalize(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function handle(value: string) {
  return value.replace(/^@/, "").replace(/^https?:\/\/[^/]+\//i, "");
}
