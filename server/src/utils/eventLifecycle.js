/**
 * When an event is over, and whether a ticket can still be sold for it.
 *
 * One module because the answer is needed in two purchase paths and every read
 * path that renders a CTA. Duplicating the rule is how a buyer ends up holding
 * a ticket the checkout screen said was on sale.
 */

/**
 * Grace after a single-date event before it counts as finished.
 *
 * An event has a start (`date`) and an OPTIONAL end (`endDate`). With no end
 * date the event is a single moment, and cutting sales off at the start time
 * would kill door sales for everyone arriving after the doors open — so it runs
 * until a day later instead.
 */
const SINGLE_DATE_GRACE_MS = 24 * 60 * 60 * 1000;

/** When the event is finished. Explicit end date wins; otherwise start + grace. */
export function eventEndsAt(event) {
  if (!event?.date) return null;
  if (event.endDate) return new Date(event.endDate);
  return new Date(new Date(event.date).getTime() + SINGLE_DATE_GRACE_MS);
}

/** True once the event is over. */
export function isEventPast(event, now = new Date()) {
  const endsAt = eventEndsAt(event);
  return !!endsAt && now.getTime() > endsAt.getTime();
}

/**
 * Why ticket sales are shut, or null when they're open.
 *
 * Order is deliberate — the most specific reason wins, so the client shows the
 * buyer the one thing that's actually true rather than a generic "unavailable".
 *
 * @returns {"cancelled"|"cancellation_pending"|"ended"|"closed_by_organizer"|"not_approved"|null}
 */
export function ticketSalesClosedReason(event, now = new Date()) {
  if (!event) return null;
  if (event.cancelledAt) return "cancelled";
  if (event.cancellationRequest?.status === "pending") return "cancellation_pending";
  if (isEventPast(event, now)) return "ended";
  if (event.ticketSalesClosedAt) return "closed_by_organizer";
  if (event.approvalStatus && event.approvalStatus !== "approved") return "not_approved";
  return null;
}

/**
 * Mongo filter for "still upcoming", honouring an optional end date so a
 * multi-day event doesn't drop out of the feeds the moment it starts.
 *
 * The `{ isPublic, isActive, date }` index still serves the `endDate: null`
 * branch, which is nearly every document.
 */
export function upcomingFilter(now = new Date()) {
  return {
    $or: [{ endDate: { $gte: now } }, { endDate: null, date: { $gte: now } }],
  };
}

/**
 * Validate an incoming end date against the start it belongs to.
 * Returns the parsed Date, `null` to clear it, or `{ error }`.
 */
export function parseEndDate(value, startDate) {
  if (value === null || value === "") return { value: null };
  const end = new Date(value);
  if (isNaN(end.getTime())) return { error: "Invalid end date" };
  if (startDate && end.getTime() <= new Date(startDate).getTime()) {
    return { error: "The end date must be after the start date" };
  }
  return { value: end };
}
