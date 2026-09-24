/** Redact asking prices only after availability has been derived. */
export function applyPriceVisibility(event, isOrganizer = false) {
  if (!event.hidePrice || isOrganizer) return event;
  const redact = (stop) => {
    // Keep paid stops distinguishable from free ones when the amount is absent.
    stop.priceOnRequest = !!stop.isPaid || Number(stop.ticketPrice) > 0 ||
      (stop.ticketTiers || []).some((tier) => Number(tier.price) > 0);
    delete stop.ticketPrice;
    stop.ticketTiers = (stop.ticketTiers || []).map(({ price, ...tier }) => tier);
  };
  redact(event);
  event.subEvents = (event.subEvents || []).map((stop) => {
    const copy = { ...stop };
    redact(copy);
    return copy;
  });
  delete event.pendingEdits;
  return event;
}

/**
 * Whether a stop has to be paid for, even when no amount is published.
 *
 * A hidden-price event can go on sale with NO asking price at all — the
 * negotiated invoice is then the only price its ticket ever has — so a
 * `ticketPrice` of 0 on the main stop can no longer be read as "free". The
 * umbrella's own `isPaid` is what settles that; a programme stop carries no such
 * flag of its own, so a zero-price stop there is still a free RSVP stop.
 *
 * @param {object} event  the umbrella event
 * @param {object} stop   a stop from allStops()/findStop() — the main stop's id is null
 */
export function stopRequiresPayment(event, stop) {
  if (!stop) return false;
  if (Number(stop.ticketPrice) > 0) return true;
  if ((stop.ticketTiers || []).length > 0) return true;
  return stop.id == null && !!event?.isPaid;
}
