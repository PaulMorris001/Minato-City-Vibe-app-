/** Money is entered in major units, with at most two decimal places. */
export function validTicketAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 &&
    value <= 99999999 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
}

export function offerPaymentError(offer, eventId, buyerId) {
  if (!offer || String(offer.event) !== String(eventId) || String(offer.buyer) !== String(buyerId)) {
    return "This ticket invoice isn't yours.";
  }
  if (offer.status !== "quoted" || !validTicketAmount(offer.finalPrice)) {
    return "The organizer must send a final invoice before you can pay.";
  }
  return null;
}
