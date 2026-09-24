import mongoose from "mongoose";
import TicketOffer from "../models/ticketOffer.model.js";
import TicketOrder from "../models/ticketOrder.model.js";
import ChatService from "../services/chat.service.js";
import { findEventByAnyId } from "../utils/resolveEvent.js";
import { allStops, findStop } from "../utils/subEvents.js";
import { stopSalesClosedReason, ticketSalesClosedReason } from "../utils/eventLifecycle.js";
import { resolveVenueChoice } from "../utils/eventLocations.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { invalidateCachePattern } from "../utils/cache.js";
import { validTicketAmount } from "../utils/ticketOffer.js";
import { stopRequiresPayment } from "../utils/eventPricing.js";
import { resolveTicketTier, ticketsRemaining } from "./payments.controller.js";

async function negotiationEvent(eventId, userId) {
  const event = await findEventByAnyId(eventId);
  if (!event || !event.isActive || !event.isPublic || !event.hidePrice) return null;
  if (event.approvalStatus && event.approvalStatus !== "approved") return null;
  if ((await getBlockedIds(userId)).includes(String(event.createdBy))) return null;
  return event;
}

/** GET /events/:eventId/negotiation — asking prices are deliberately shown here. */
export async function getNegotiationOptions(req, res) {
  try {
    const event = await negotiationEvent(req.params.eventId, req.user.id);
    if (!event) return res.status(404).json({ message: "Negotiation isn't available for this event." });
    // A ticketed stop with no asking price belongs here too — that's the whole
    // point of an event that publishes no prices. `ticketPrice: 0` then means
    // "name your own", which the client renders instead of an amount.
    const stops = allStops(event).filter((stop) => stopRequiresPayment(event, stop));
    return res.json({ event: {
      _id: event._id, title: event.title, currency: event.currency,
      location: event.location, city: event.city, additionalLocations: event.additionalLocations,
      salesClosed: !!ticketSalesClosedReason(event),
      stops: await Promise.all(stops.map(async (stop) => ({
        id: stop.id, title: stop.title, ticketPrice: stop.ticketPrice,
        salesClosed: !!stopSalesClosedReason(event, stop),
        ticketTiers: await Promise.all((stop.ticketTiers || []).map(async (tier) => ({
          _id: tier._id, name: tier.name, price: tier.price,
          soldOut: (await ticketsRemaining(event, { tierId: tier._id, quantity: tier.quantity }, stop)) <= 0,
        }))),
        soldOut: (await ticketsRemaining(event, null, stop)) <= 0,
      }))),
    } });
  } catch (error) {
    console.error("getNegotiationOptions:", error);
    return res.status(500).json({ message: "Couldn't load ticket options." });
  }
}

/** POST /events/:eventId/offers — buyer's request card, not a payable invoice. */
export async function createTicketOffer(req, res) {
  try {
    const { offeredPrice, quantity, subEvent, tierId, locationIndex, note = "" } = req.body;
    if (!validTicketAmount(offeredPrice) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ message: "Enter a positive price per ticket (up to two decimal places) and 1–20 tickets." });
    }
    if (typeof note !== "string" || note.length > 1000) {
      return res.status(400).json({ message: "Your note must be at most 1,000 characters." });
    }
    const event = await negotiationEvent(req.params.eventId, req.user.id);
    if (!event) return res.status(404).json({ message: "Negotiation isn't available for this event." });
    if (String(event.createdBy) === req.user.id) return res.status(400).json({ message: "You can't make an offer on your own event." });
    const stop = findStop(event, subEvent || null);
    if (!stop || stopSalesClosedReason(event, stop)) return res.status(409).json({ message: "Ticket sales are closed for this selection." });
    const { tier, error } = resolveTicketTier(stop, tierId);
    if (error) return res.status(400).json({ message: error });
    if (!stopRequiresPayment(event, stop)) return res.status(400).json({ message: "This selection is free — RSVP instead." });
    // 0 when the organizer published no asking price at all; the offer is then
    // the first number either side has named.
    const standardPrice = Number(tier ? tier.price : stop.ticketPrice) || 0;
    if (quantity > await ticketsRemaining(event, tier, stop)) return res.status(409).json({ message: "There aren't enough tickets available." });
    const venue = resolveVenueChoice(event, locationIndex);
    if (venue.error) return res.status(400).json({ message: venue.error });
    // The organizer opted into commerce enquiries. This exemption never comes
    // from the generic chat endpoint's request body.
    const chat = await ChatService.getOrCreateDirectChat(req.user.id, event.createdBy, { skipMutualCheck: true });
    const offer = await TicketOffer.create({
      event: event._id, buyer: req.user.id, organizer: event.createdBy, chat: chat._id,
      eventTitle: event.title, ticketName: `${stop.title}${tier ? ` · ${tier.name}` : ""}`,
      subEvent: stop.id, tierId: tier?.tierId, quantity, currency: event.currency || "USD",
      standardPrice, offeredPrice, eventDate: stop.date, note: note.trim(), ...(venue.choice || {}),
    });
    await ChatService.sendMessage(chat._id, req.user.id, {
      type: "ticket_offer", ticketOfferId: offer._id,
      content: `Ticket offer for ${offer.eventTitle}: ${quantity} × ${offer.currency} ${offeredPrice.toFixed(2)}${note.trim() ? ` — ${note.trim()}` : ""}`,
    });
    for (const id of [offer.buyer, offer.organizer]) invalidateCachePattern(`user_chats_${id}`);
    return res.status(201).json({ offer, chatId: chat._id });
  } catch (error) {
    console.error("createTicketOffer:", error);
    return res.status(500).json({ message: "Couldn't send your ticket offer." });
  }
}

/** GET /ticket-offers/:offerId — visible only to the two negotiating parties. */
export async function getTicketOffer(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.offerId)) return res.status(404).json({ message: "Invoice not found." });
    const offer = await TicketOffer.findOne({ _id: req.params.offerId, $or: [{ buyer: req.user.id }, { organizer: req.user.id }] }).lean();
    if (!offer) return res.status(404).json({ message: "Invoice not found." });
    const order = await TicketOrder.findOne({ ticketOffer: offer._id }).select("status").lean();
    return res.json({ offer: { ...offer, paid: order?.status === "paid", isOrganizer: String(offer.organizer) === req.user.id } });
  } catch (error) {
    console.error("getTicketOffer:", error);
    return res.status(500).json({ message: "Couldn't load the invoice." });
  }
}

/** PATCH /ticket-offers/:offerId — organizer issues a final, immutable price. */
export async function respondToTicketOffer(req, res) {
  try {
    const { action, finalPrice } = req.body;
    if (!["quote", "decline", "cancel"].includes(action) || (action === "quote" && !validTicketAmount(finalPrice))) {
      return res.status(400).json({ message: "Choose quote, decline or cancel, with a positive price per ticket for an invoice." });
    }
    if (!mongoose.isValidObjectId(req.params.offerId)) return res.status(404).json({ message: "Offer not found." });
    const offer = await TicketOffer.findOne({ _id: req.params.offerId, [action === "cancel" ? "buyer" : "organizer"]: req.user.id, status: "requested" });
    if (!offer) return res.status(409).json({ message: "This request has already been handled or isn't yours." });
    const event = await negotiationEvent(String(offer.event), String(offer.buyer));
    const stop = event && findStop(event, offer.subEvent);
    if (action === "quote" && (!stop || stopSalesClosedReason(event, stop))) return res.status(409).json({ message: "Ticket sales are closed for this selection." });
    const status = { quote: "quoted", decline: "declined", cancel: "cancelled" }[action];
    const updated = await TicketOffer.findOneAndUpdate({ _id: offer._id, status: "requested" }, { status, ...(action === "quote" ? { finalPrice } : {}) }, { new: true });
    if (!updated) return res.status(409).json({ message: "This request has already been handled." });
    await ChatService.sendMessage(offer.chat, req.user.id, {
      type: "ticket_offer", ticketOfferId: offer._id,
      content: action === "quote"
        ? `Final ticket invoice for ${offer.eventTitle}: ${offer.quantity} × ${offer.currency} ${finalPrice.toFixed(2)}. Review before paying.`
        : `Ticket request for ${offer.eventTitle} ${status}.`,
    });
    for (const id of [offer.buyer, offer.organizer]) invalidateCachePattern(`user_chats_${id}`);
    return res.json({ offer: updated });
  } catch (error) {
    console.error("respondToTicketOffer:", error);
    return res.status(500).json({ message: "Couldn't update the ticket request." });
  }
}
