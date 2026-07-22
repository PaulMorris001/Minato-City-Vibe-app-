import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import {
  dateBadge,
  eventPlace,
  fallbackGradient,
  formatTime,
  priceLabel,
  relativeDay,
  sourceLabel,
} from "../lib/format";
import type { FeedEvent } from "../lib/types";

/**
 * Feed card for both event kinds. Native events route into the in-site ticket
 * flow (/events/:id); external ones route to their own detail page, which then
 * hands off to the provider's checkout.
 */
export default function EventCard({ ev }: { ev: FeedEvent }) {
  const navigate = useNavigate();
  // Some ingested/legacy rows point at images that 404 — fall back to the
  // gradient rather than leaving a dead grey rectangle.
  const [imgFailed, setImgFailed] = useState(false);
  const cover = imgFailed ? undefined : ev.image || ev.images?.[0];
  const badge = dateBadge(ev.date);
  const soon = relativeDay(ev.date);
  const href = ev.kind === "native" ? `/events/${ev._id}` : `/external-events/${ev._id}`;
  const host = ev.kind === "native" ? ev.createdBy : undefined;
  const free = ev.kind === "native" && !ev.isPaid;
  const soldOut =
    ev.kind === "native" && ev.ticketsRemaining !== undefined && ev.ticketsRemaining <= 0;

  return (
    <a
      className="cv-event"
      href={href}
      onClick={(e) => {
        // Keep cmd/ctrl-click and middle-click opening a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      <div className="cv-event-media">
        {cover ? (
          <img
            className="cv-event-img"
            src={cover}
            alt={ev.title}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="cv-event-img" style={{ background: fallbackGradient(ev._id) }} />
        )}
        <div className="cv-event-scrim" />

        <div className="cv-event-date">
          <div className="m">{badge.month}</div>
          <div className="d">{badge.day}</div>
        </div>

        <div className="cv-event-badges">
          {ev.kind === "external" ? (
            <span className="cv-pill cv-pill-ext">{sourceLabel(ev)}</span>
          ) : ev.userHasPurchased ? (
            <span className="cv-pill cv-pill-free">You're going</span>
          ) : ev.isVirtual ? (
            <span className="cv-pill">Online</span>
          ) : null}
        </div>

        <div className="cv-event-bottom">
          <span className={`cv-pill ${free ? "cv-pill-free" : "cv-pill-accent"}`}>
            {soldOut ? "Sold out" : priceLabel(ev)}
          </span>
          {soon && (
            <span className="cv-pill" style={{ marginLeft: 6 }}>
              {soon}
            </span>
          )}
        </div>
      </div>

      <div className="cv-event-body">
        <div className="cv-event-title">{ev.title}</div>
        <div className="cv-event-meta">
          <span aria-hidden="true">📍</span>
          {eventPlace(ev)}
        </div>
        <div className="cv-event-meta">
          <span aria-hidden="true">🕘</span>
          {formatTime(ev.date)}
          {ev.kind === "external" && ev.additionalDates
            ? ` · +${ev.additionalDates} more dates`
            : ""}
        </div>

        <div className="cv-event-foot">
          {ev.kind === "native" ? (
            <span className="cv-host-mini">
              <Avatar src={host?.profilePicture} name={host?.username} size="sm" />
              <span>
                {host?.username ? `@${host.username}` : "CityVibe host"}
                {host?.verified ? " ✓" : ""}
              </span>
            </span>
          ) : (
            <span className="cv-host-mini">
              <span aria-hidden="true">🎫</span>
              <span>{ev.category || sourceLabel(ev)}</span>
            </span>
          )}
          <span className="cv-muted" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
            Details →
          </span>
        </div>
      </div>
    </a>
  );
}
