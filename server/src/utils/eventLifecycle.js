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

/** When one stop of a programme is finished. Same rule, one sub-event deep. */
export function stopEndsAt(stop) {
  if (!stop?.date) return null;
  if (stop.endDate) return new Date(stop.endDate);
  return new Date(new Date(stop.date).getTime() + SINGLE_DATE_GRACE_MS);
}

/**
 * When the event is finished. Explicit end date wins; otherwise start + grace.
 *
 * An event with a PROGRAMME runs until its last stop is over, even when that
 * stop is dated past the umbrella's own end — otherwise a Sunday-night stop on
 * a Fri–Sat event would report "ended" while its pass-holders are still on
 * their way. Events with no sub-events are unaffected.
 */
export function eventEndsAt(event) {
  if (!event?.date) return null;
  const base = event.endDate
    ? new Date(event.endDate)
    : new Date(new Date(event.date).getTime() + SINGLE_DATE_GRACE_MS);

  let latest = base.getTime();
  for (const stop of event.subEvents || []) {
    const ends = stopEndsAt(stop);
    if (ends && ends.getTime() > latest) latest = ends.getTime();
  }
  return new Date(latest);
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
 * Why sales for ONE STOP of a programme are shut, or null when they're open.
 *
 * Event-level reasons come first and cover every stop — a cancelled event
 * cancels its whole programme. Only "ended" and the organizer's switch are
 * per-stop, which is the point: brunch closing must not close the club night.
 *
 * Note the event-level check is NOT reused wholesale: `ticketSalesClosedReason`
 * would report "ended" off the umbrella's own dates, and eventEndsAt() now
 * stretches to the last stop, so a finished stop inside a live event would come
 * back open. The stop's own dates decide that here.
 *
 * @returns {"cancelled"|"cancellation_pending"|"not_approved"|"ended"|"closed_by_organizer"|null}
 */
export function stopSalesClosedReason(event, stop, now = new Date()) {
  if (!event || !stop) return null;
  if (event.cancelledAt) return "cancelled";
  if (event.cancellationRequest?.status === "pending") return "cancellation_pending";
  if (event.approvalStatus && event.approvalStatus !== "approved") return "not_approved";
  if (event.ticketSalesClosedAt) return "closed_by_organizer";

  const endsAt = stopEndsAt(stop);
  if (endsAt && now.getTime() > endsAt.getTime()) return "ended";
  if (stop.ticketSalesClosedAt) return "closed_by_organizer";
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
