import type { EventItem, EventVenue } from "../lib/types";

/**
 * Every venue an event runs at, venue #1 first. Mirrors allVenues() on the
 * server: the index of each entry IS what the server stores as `locationIndex`,
 * so the order must stay "the event's own location, then additionalLocations".
 */
export function eventVenues(ev: Pick<EventItem, "location" | "address" | "city" | "state" | "country" | "additionalLocations">): EventVenue[] {
  return [
    {
      location: ev.location || "",
      address: ev.address,
      city: ev.city,
      state: ev.state,
      country: ev.country,
    },
    ...(ev.additionalLocations ?? []),
  ];
}

/** How many venues an event runs at. More than one means a pick is required. */
export function venueCount(ev: Pick<EventItem, "additionalLocations">): number {
  return 1 + (ev.additionalLocations?.length ?? 0);
}

/** "Lagos · 1 Ikeja Rd" — one venue on one line. */
export function venueLabel(venue: EventVenue): string {
  const place = [venue.city, venue.state].filter(Boolean).join(", ") || venue.location;
  return [place, venue.address].filter(Boolean).join(" · ");
}

/**
 * Which venue of a multi-venue event the attendee is going to. Single-select —
 * one body goes through one door, and the server stores exactly one venue per
 * pass — so these are radios however many venues there are. Renders nothing for
 * a single-venue event, which has nothing to ask.
 */
export default function VenueChoice({
  ev,
  value,
  onChange,
  label = "Which location are you going to?",
}: {
  ev: Pick<EventItem, "location" | "address" | "city" | "state" | "country" | "additionalLocations">;
  value: number | null;
  onChange: (index: number) => void;
  label?: string;
}) {
  const venues = eventVenues(ev);
  if (venues.length < 2) return null;

  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
      <legend className="cv-muted" style={{ marginBottom: 8, fontWeight: 600 }}>
        {label}
      </legend>
      {venues.map((venue, i) => (
        <label
          key={i}
          className="cv-row"
          style={{
            gap: 10,
            alignItems: "flex-start",
            cursor: "pointer",
            padding: "8px 0",
          }}
        >
          <input
            type="radio"
            name="venue-choice"
            checked={value === i}
            onChange={() => onChange(i)}
            style={{ marginTop: 3 }}
          />
          <span>{venueLabel(venue)}</span>
        </label>
      ))}
    </fieldset>
  );
}
