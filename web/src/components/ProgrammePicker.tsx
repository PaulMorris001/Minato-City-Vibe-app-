import type { EventItem, EventSubEvent } from "../lib/types";
import { money } from "../lib/format";

/**
 * Every stop of an event's programme, main event first — the index/id of each
 * entry is exactly what the server expects back in `subEvents: (string|null)[]`
 * (see rsvpEvent's reconcile path and initTicketBatch's `items[].subEvent`).
 * `id: null` is the main event.
 */
export interface Stop {
  id: string | null;
  title: string;
  ticketPrice?: number;
  ticketTiers?: EventSubEvent["ticketTiers"];
  soldOut?: boolean;
  remaining?: number;
  salesClosed?: boolean;
}

export function eventStops(ev: EventItem): Stop[] {
  return [
    {
      id: null,
      title: ev.title,
      ticketPrice: ev.ticketPrice,
      ticketTiers: ev.ticketTiers,
      soldOut: ev.soldOut,
      remaining: ev.ticketsRemaining,
      salesClosed: ev.salesClosed,
    },
    ...(ev.subEvents ?? []).map((s) => ({
      id: s._id,
      title: s.title,
      ticketPrice: s.ticketPrice,
      ticketTiers: s.ticketTiers,
      soldOut: s.soldOut,
      remaining: s.remaining,
      salesClosed: s.salesClosed,
    })),
  ];
}

/** The cheapest price a stop can be had for — 0 means free. */
export function stopFacePrice(stop: Stop): number {
  const tiers = stop.ticketTiers ?? [];
  if (tiers.length) return Math.min(...tiers.map((t) => t.price));
  return stop.ticketPrice ?? 0;
}

/** "Free" / "$5" / "From $5". */
export function stopPriceLabel(stop: Stop, currency?: string): string {
  const price = stopFacePrice(stop);
  if (!price) return "Free";
  const amount = money(price, currency);
  return (stop.ticketTiers?.length ?? 0) > 1 ? `From ${amount}` : amount;
}

/** The sum of whatever's ticked — what a mixed selection actually costs. */
export function selectionTotal(stops: Stop[], selected: (string | null)[]): number {
  const keys = new Set(selected);
  return stops.filter((s) => keys.has(s.id)).reduce((sum, s) => sum + stopFacePrice(s), 0);
}

interface ProgrammePickerProps {
  ev: EventItem;
  value: (string | null)[];
  onChange: (stops: (string | null)[]) => void;
  currency?: string;
}

/**
 * Which stops of a programme the guest is going to. Checkboxes, not radios —
 * unlike a venue pick (one body, one door), a guest can say yes to brunch AND
 * the after-party. Whatever's ticked here is what one checkout (or one free
 * RSVP, if nothing ticked costs anything) covers at once.
 */
export default function ProgrammePicker({ ev, value, onChange, currency }: ProgrammePickerProps) {
  const stops = eventStops(ev);
  if (stops.length < 2) return null;

  const toggle = (id: string | null) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
      <legend className="cv-muted" style={{ marginBottom: 8, fontWeight: 600 }}>
        Which are you going to?
      </legend>
      {stops.map((stop) => {
        const checked = value.includes(stop.id);
        const disabled = !!stop.soldOut || !!stop.salesClosed;
        return (
          <label
            key={stop.id ?? "main"}
            className="cv-row"
            style={{
              gap: 10,
              alignItems: "flex-start",
              cursor: disabled ? "not-allowed" : "pointer",
              padding: "8px 0",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(stop.id)}
              style={{ marginTop: 3 }}
            />
            <span style={{ flex: 1 }}>
              {stop.title}
              {disabled && (
                <span className="cv-muted" style={{ display: "block", fontSize: 12 }}>
                  {stop.soldOut ? "Sold out" : "Sales closed"}
                </span>
              )}
              {!disabled && stop.remaining !== undefined && (
                <span className="cv-muted" style={{ display: "block", fontSize: 12 }}>
                  {stop.remaining} left
                </span>
              )}
            </span>
            <strong>{stopPriceLabel(stop, currency)}</strong>
          </label>
        );
      })}
    </fieldset>
  );
}
