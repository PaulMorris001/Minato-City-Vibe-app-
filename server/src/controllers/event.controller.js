import mongoose from "mongoose";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
import EventReview from "../models/eventReview.model.js";
import Attendance from "../models/attendance.model.js";
import DiscountCode from "../models/discountCode.model.js";
import { Vendor } from "../models/vendor.model.js";
import Chat from "../models/chat.model.js";
import Follow from "../models/follow.model.js";
import Notification from "../models/notification.model.js";
import ChatService from "../services/chat.service.js";
import { uploadBase64Image, deleteImage } from "../services/image.service.js";
import { emitEventInvite } from "../services/socket.service.js";
import { setCache, getCache, invalidateCache, invalidateCachePattern } from "../utils/cache.js";
import { areMutualFollows } from "../utils/followCheck.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { assertClean, assertMeaningful } from "../utils/contentFilter.js";
import {
  hasPayoutOnboarding,
  getSettlementProvider,
  currencyForUser,
  PAYOUT_ROUTING_FIELDS,
} from "../services/payments/resolveProvider.js";
import { rejectIfCannotSell } from "../services/payments/sellingEligibility.js";
import { birthdayRaffleDateError } from "../services/raffleCampaign.service.js";
import { escapeRegex, exactCaseInsensitive } from "../utils/escapeRegex.js";
import { findEventByAnyId } from "../utils/resolveEvent.js";
import {
  isEventPast,
  ticketSalesClosedReason,
  stopSalesClosedReason,
  stopEndsAt,
  upcomingFilter,
  parseEndDate,
} from "../utils/eventLifecycle.js";
import { toGeoPoint } from "../utils/geo.js";
import { normalizeAdditionalLocations, resolveVenueChoice } from "../utils/eventLocations.js";
import { normalizeSubEvents, allStops, findStop } from "../utils/subEvents.js";
import { issueEventPass } from "../services/pass.service.js";
import { linkQrDataUrl } from "../utils/qrcode.js";
import config from "../config/env.js";
import { applyPriceVisibility, stopRequiresPayment } from "../utils/eventPricing.js";

/**
 * True when `userId` is in a list of user refs. Tolerates both raw ObjectIds
 * and populated documents, because whether a query populates `cohosts` varies
 * across the feed/list/detail endpoints — and a document's `toString()` is its
 * inspect output, not its id, so comparing it directly would silently never
 * match.
 */
function listHasUser(list, userId) {
  if (!userId) return false;
  return (list || []).some((x) => String(x?._id ?? x) === String(userId));
}

// A review is only meaningful from someone who accepted or otherwise joined
// the event. Hosts cannot review their own event.
async function canUserReviewEvent(event, userId) {
  if (!userId || String(event.createdBy) === String(userId)) return false;
  if (listHasUser(event.invitedUsers, userId) || listHasUser(event.rsvpUsers, userId)) return true;
  return !!(await Ticket.exists({ event: event._id, user: userId, isValid: true }));
}

/**
 * Attendance data is organizer-only unless the organizer opts in.
 *
 * Headcount and capacity are the host's numbers by default: a half-empty room
 * is not something an organizer wants broadcast to people deciding whether to
 * come. So everything that answers "how many are coming / how full is it" is
 * stripped for anyone who isn't running the event — until the host flips
 * `showAttendance` on the event, at which point every viewer sees the same
 * counts the organizer does (going, capacity, spots left, per-tier remaining).
 *
 * The guest LIST is not part of that opt-in. `rsvpUsers` is other attendees'
 * data, not the organizer's to publish, so it is stripped for non-organizers
 * regardless of the flag.
 *
 * What survives even with the flag off, because checkout depends on it and none
 * of it reveals a count:
 *   - `soldOut` on the event, and `soldOut` on each tier (replacing the
 *     numeric `remaining`), so the client can still disable a sold-out CTA.
 *   - `userRsvp` / `userHasPurchased` — the viewer's own relationship.
 *
 * `friendsGoing` follows the counts (hidden by default, revealed by the flag)
 * rather than shipping publicly on its own: turning the flag off has to leave
 * an event exactly as private as it was before this opt-in existed.
 *
 * Mutates and returns `eventObj`. Call it last, once every derived field it
 * needs to redact has been computed.
 */
function applyAttendanceVisibility(eventObj, { isOrganizer }) {
  // The organizer always sees their own numbers; everyone else sees them only
  // when the event opts in.
  const canSeeCounts = isOrganizer || !!eventObj.showAttendance;
  const maxGuests = eventObj.maxGuests;
  // Free events measure fullness in RSVPs, paid ones in tickets. Only events
  // that declared a cap can sell out at all.
  const remaining =
    typeof eventObj.ticketsRemaining === "number"
      ? eventObj.ticketsRemaining
      : maxGuests
        ? Math.max(maxGuests - (eventObj.rsvpCount ?? 0), 0)
        : null;
  eventObj.soldOut = !!maxGuests && remaining !== null && remaining <= 0;

  // Availability, not a count — so like `soldOut` these survive the opt-out.
  // The reason is what lets the client say the true thing ("Event ended" vs
  // "Sales closed") instead of a generic unavailable state.
  const closedReason = ticketSalesClosedReason(eventObj);
  eventObj.salesClosedReason = closedReason;
  eventObj.salesClosed = closedReason !== null;
  eventObj.hasEnded = isEventPast(eventObj);

  // Per-tier availability collapses to a boolean when counts are hidden. Only
  // rewrite when tiers actually exist — free events have none, and
  // materialising an empty array on every payload is a needless shape change.
  if (Array.isArray(eventObj.ticketTiers) && eventObj.ticketTiers.length > 0) {
    eventObj.ticketTiers = eventObj.ticketTiers.map((t) => {
      const tier = { ...t };
      if (typeof t.remaining === "number") tier.soldOut = t.remaining <= 0;
      if (!canSeeCounts) {
        delete tier.remaining;
        // `quantity` is this tier's capacity — same class of number as
        // maxGuests, so it goes with it.
        delete tier.quantity;
      }
      return tier;
    });
  }

  // Each stop of a programme gets the same treatment as a tier: availability
  // survives, the numbers behind it don't. A per-stop headcount or cap is the
  // same class of number as maxGuests below.
  if (Array.isArray(eventObj.subEvents) && eventObj.subEvents.length > 0) {
    eventObj.subEvents = eventObj.subEvents.map((s) => {
      const stop = { ...s };
      if (typeof s.remaining === "number") stop.soldOut = s.remaining <= 0;

      // Per-stop sales state, so a finished brunch reads as closed while the
      // club night stays open.
      const stopReason = stopSalesClosedReason(eventObj, s);
      stop.salesClosedReason = stopReason;
      stop.salesClosed = stopReason !== null;

      if (Array.isArray(stop.ticketTiers) && stop.ticketTiers.length > 0) {
        stop.ticketTiers = stop.ticketTiers.map((t) => {
          const tier = { ...t };
          if (typeof t.remaining === "number") tier.soldOut = t.remaining <= 0;
          if (!canSeeCounts) {
            delete tier.remaining;
            delete tier.quantity;
          }
          return tier;
        });
      }
      if (!canSeeCounts) {
        delete stop.remaining;
        delete stop.rsvpCount;
        delete stop.maxGuests;
      }
      return stop;
    });
  }

  // The guest list is never part of the opt-in — it's other attendees' data.
  if (!isOrganizer) delete eventObj.rsvpUsers;

  // A cancellation under review is the organizer's business until it's decided
  // — same reasoning as `pendingEdits`. Buyers see `salesClosed` instead.
  if (!isOrganizer) delete eventObj.cancellationRequest;

  applyPriceVisibility(eventObj, isOrganizer);
  if (canSeeCounts) return eventObj;

  delete eventObj.rsvpCount;
  delete eventObj.maxGuests;
  delete eventObj.ticketsSold;
  delete eventObj.ticketsRemaining;
  delete eventObj.friendsGoing;

  return eventObj;
}

// Meeting links are validated as URLs, not run through the profanity filter
// (URLs aren't prose).
const isValidMeetingLink = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

// Create a new event
export const createEvent = async (req, res) => {
  try {
    // `let` (not `const`): maxGuests is re-derived below from per-tier quantities
    // when the tiers declare their own allocations.
    let {
      title,
      date,
      endDate,
      location,
      address,
      city,
      state,
      country,
      image,
      images,
      description,
      isPublic,
      isPaid,
      ticketPrice,
      ticketTiers,
      maxGuests,
      showAttendance,
      hidePrice,
      venueProofImage,
      isVirtual,
      meetingLink,
      latitude,
      longitude,
      additionalLocations,
      subEvents,
      isBirthdayRaffle,
    } = req.body;
    const userId = req.user.id;
    const virtual = Boolean(isVirtual);
    if (hidePrice !== undefined && typeof hidePrice !== "boolean") {
      return res.status(400).json({ message: "hidePrice must be true or false." });
    }

    if (!title || !date || (!virtual && !location)) {
      return res.status(400).json({ message: "Title, date, and location are required" });
    }
    if (meetingLink && !isValidMeetingLink(meetingLink)) {
      return res.status(400).json({ message: "Event link must be a valid URL (https://...)" });
    }

    let extraVenues = [];
    if (!virtual && additionalLocations !== undefined) {
      const parsed = normalizeAdditionalLocations(additionalLocations);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      extraVenues = parsed.locations;
    }

    const parsedEnd = parseEndDate(endDate ?? null, date);
    if (parsedEnd.error) return res.status(400).json({ message: parsedEnd.error });

    // A programme of sub-events. Mutually exclusive with additionalLocations:
    // that list is the same event in several places, this is different things
    // sharing one invitation, and an event that claimed both would be
    // unanswerable at the door.
    let programme = [];
    if (!virtual && subEvents !== undefined) {
      const parsed = normalizeSubEvents(subEvents, {
        eventStart: date,
        eventEnd: parsedEnd.value,
      });
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      programme = parsed.subEvents;
    }
    if (programme.length && extraVenues.length) {
      return res.status(400).json({
        message:
          "An event can run at several locations, or have a programme of sub-events — not both.",
      });
    }

    // Reject JSON/operator payloads and symbol-soup titles before they're stored
    // and displayed as an event name.
    assertMeaningful([{ field: "Title", value: title }]);

    assertClean([
      { field: "Title", value: title },
      { field: "Description", value: description },
      { field: "Location", value: location },
      { field: "Address", value: address },
    ]);

    // Birthday-raffle eligibility is about the event's own date, not whether
    // a campaign happens to be running right now: a December birthday can be
    // pre-registered in August and just sits pending until December's batch
    // is created (raffle runs as monthly batches, up to 6 months ahead).
    if (Boolean(isBirthdayRaffle)) {
      const dateError = birthdayRaffleDateError(date);
      if (dateError) return res.status(400).json({ message: dateError });
    }

    // Ticket currency defaults to the organizer's local currency (set below for
    // paid events once we've loaded the organizer).
    let ticketCurrency = "USD";

    // Named ticket tiers (public paid events only) — normalized here,
    // validated below. Empty for single-price and free events.
    let tiers = [];

    // Validate pricing options for public paid events
    if (isPublic && isPaid) {
      if (Array.isArray(ticketTiers) && ticketTiers.length > 0) {
        if (ticketTiers.length > 10) {
          return res.status(400).json({ message: "You can create up to 10 ticket tiers." });
        }
        tiers = ticketTiers.map((t) => {
          const tier = {
            name: String(t?.name || "").trim(),
            price: Number(t?.price),
          };
          // Per-tier quantity is optional (back-compat). When any tier supplies
          // one, it must be a positive integer — it caps that tier's sales.
          if (t?.quantity !== undefined && t?.quantity !== null && t?.quantity !== "") {
            tier.quantity = Number(t.quantity);
          }
          return tier;
        });
        if (tiers.some((t) => !t.name)) {
          return res.status(400).json({ message: "Every ticket tier needs a name." });
        }
        if (tiers.some((t) => t.name.length > 40)) {
          return res.status(400).json({ message: "Tier names must be 40 characters or fewer." });
        }
        const tierNames = new Set(tiers.map((t) => t.name.toLowerCase()));
        if (tierNames.size !== tiers.length) {
          return res.status(400).json({ message: "Tier names must be unique." });
        }
        if (tiers.some((t) => !Number.isFinite(t.price) || t.price <= 0)) {
          return res.status(400).json({ message: "Every ticket tier needs a price greater than 0." });
        }
        // Quantity is all-or-nothing across tiers: either every tier declares its
        // own allocation (and maxGuests is derived from their sum), or none do
        // (and the shared event-level maxGuests governs).
        const tiersWithQty = tiers.filter((t) => t.quantity !== undefined);
        if (tiersWithQty.length > 0) {
          if (tiersWithQty.length !== tiers.length) {
            return res.status(400).json({
              message: "Set a quantity for every ticket tier, or leave them all blank.",
            });
          }
          if (tiers.some((t) => !Number.isInteger(t.quantity) || t.quantity <= 0)) {
            return res.status(400).json({ message: "Every ticket tier needs a whole quantity greater than 0." });
          }
        }
        assertClean(tiers.map((t) => ({ field: "Tier name", value: t.name })));
      }

      // With tiers, the headline ticketPrice is derived (cheapest tier); a
      // client-sent ticketPrice is ignored. Without tiers, it's required —
      // unless prices are hidden, where the event may go on sale with no asking
      // price at all and the negotiated invoice is the only price there is.
      if (!tiers.length && !(Number(ticketPrice) > 0) && hidePrice !== true) {
        return res.status(400).json({ message: "Ticket price must be greater than 0 for paid events" });
      }
      // When tiers declare per-tier quantities, capacity is the sum of them and a
      // client-sent maxGuests is ignored. Otherwise maxGuests is required.
      const tiersHaveQuantity = tiers.length > 0 && tiers.every((t) => t.quantity !== undefined);
      if (tiersHaveQuantity) {
        maxGuests = tiers.reduce((sum, t) => sum + t.quantity, 0);
      } else if (!maxGuests || maxGuests <= 0) {
        return res.status(400).json({ message: "Max guests must be specified for paid events" });
      }
      // Virtual events have no venue to prove; they still pass through the
      // admin approval queue below like every other paid event.
      if (!venueProofImage && !virtual) {
        return res.status(400).json({
          message: "A photo of your venue booking (confirmation, contract, or reservation) is required for paid events.",
        });
      }

      // Trust gates for sellers: must have verified their email AND submitted ID
      // AND have a usable payout destination on whichever rail settles them
      // (Paystack or Stripe Connect). Without this gate, the failure surfaces to
      // the *buyer* at checkout — the wrong layer.
      const organizer = await User.findById(userId).select(
        `verified emailVerifiedAt ${PAYOUT_ROUTING_FIELDS}`
      );
      if (!organizer?.emailVerifiedAt) {
        return res.status(403).json({
          message:
            "Verify your email before selling tickets. Check your inbox for the code we sent at signup, or request a new one from Settings.",
        });
      }
      if (!organizer?.verified) {
        return res.status(403).json({
          message:
            "Identity verification is required before you can sell tickets. Submit your ID in Settings → Identity Verification.",
        });
      }
      if (rejectIfCannotSell(res, organizer)) return;

      // The selling currency is server-authoritative — it must match the
      // provider the seller collects through (Stripe charges USD, Paystack
      // charges the local currency), so a client-picked currency can't be
      // honored. Reject a mismatch instead of silently repricing.
      ticketCurrency = currencyForUser(organizer);
      if (req.body.currency && req.body.currency !== ticketCurrency) {
        return res.status(400).json({
          message: `Tickets for your account are priced in ${ticketCurrency}.`,
        });
      }

      // No ticket-price or capacity ceiling is applied here, for new organizers
      // or anyone else: an organizer may charge what they like and size the room
      // how they like. Every public paid event is held for admin review below
      // instead, so an implausible price or headcount is caught by a human who
      // can also see the venue proof — not rejected by an arbitrary number.
    }

    // Handle event image upload
    // Build the photo gallery. The client uploads photos and sends back URLs in
    // `images`; older clients send a single `image`. Any inline base64 is
    // uploaded here as a fallback.
    const incoming = [];
    if (Array.isArray(images)) incoming.push(...images);
    else if (image) incoming.push(image);

    const gallery = [];
    for (const item of incoming) {
      if (!item) continue;
      if (typeof item === "string" && item.startsWith("data:image")) {
        try {
          const result = await uploadBase64Image(item, "events");
          gallery.push(result.url);
        } catch (error) {
          console.error("Error uploading event image:", error);
          return res.status(400).json({ message: "Error uploading event image", details: error.message });
        }
      } else {
        gallery.push(item);
      }
    }
    const eventImageUrl = gallery[0] || "";

    // Paid-event approval gate: EVERY public paid event goes through the admin
    // queue, every time — not just an organizer's first. Since price and
    // capacity are uncapped, review is the only thing between an organizer and
    // buyers' money, and a previously-approved organizer is no guarantee about
    // *this* event. Free and private events never enter the queue.
    const approvalStatus = isPublic && isPaid ? "pending" : "approved";

    // Upload venue proof image for paid events
    let venueProofUrl = "";
    if (isPublic && isPaid && venueProofImage) {
      if (venueProofImage.startsWith("data:image")) {
        try {
          const result = await uploadBase64Image(venueProofImage, "venue-proofs");
          venueProofUrl = result.url;
        } catch (uploadError) {
          console.error("Error uploading venue proof:", uploadError);
          return res.status(400).json({
            message: "Error uploading venue proof image",
            details: uploadError.message,
          });
        }
      } else {
        venueProofUrl = venueProofImage;
      }
    }

    const event = new Event({
      title,
      date: new Date(date),
      endDate: parsedEnd.value,
      location: virtual ? "Online" : location,
      address: virtual ? "" : (address || ""),
      city: virtual ? "" : (city || ""),
      state: virtual ? "" : (state || ""),
      country: virtual ? "" : (country || ""),
      geo: virtual ? undefined : toGeoPoint(latitude, longitude),
      additionalLocations: extraVenues,
      subEvents: programme,
      isVirtual: virtual,
      meetingLink: virtual ? (meetingLink || "") : "",
      image: eventImageUrl,
      images: gallery,
      description: description || "",
      createdBy: userId,
      isPublic: isPublic || false,
      isPaid: isPublic && isPaid ? isPaid : false,
      ticketPrice:
        isPublic && isPaid
          ? tiers.length
            ? Math.min(...tiers.map((t) => t.price))
            : Number(ticketPrice) > 0
              ? Number(ticketPrice)
              : 0
          : 0,
      ticketTiers: isPublic && isPaid ? tiers : [],
      currency: ticketCurrency,
      maxGuests: isPublic && isPaid ? maxGuests : 0,
      // Only meaningful on a public event — a private one has no audience to
      // reveal the numbers to.
      showAttendance: Boolean(isPublic && showAttendance),
      hidePrice: hidePrice === true && Boolean((isPublic && isPaid) || programme.some((stop) => stop.ticketPrice > 0)),
      venueProofImage: venueProofUrl,
      approvalStatus,
      payoutStatus: isPublic && isPaid ? "pending" : "none",
      isBirthdayRaffle: Boolean(isBirthdayRaffle),
    });

    await event.save();

    const populatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    res.status(201).json({
      message:
        approvalStatus === "pending"
          ? "Event created. Paid events go live once an admin has reviewed them — we'll notify you as soon as it's approved."
          : "Event created successfully",
      pendingApproval: approvalStatus === "pending",
      event: populatedEvent
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Create event error:", error);
    res.status(500).json({ message: "Error creating event", error: error.message });
  }
};

// Create a private, free event from a standalone (non-event) group chat.
// The group admin becomes the host; every current group member is auto-added
// as a confirmed guest, and the event is linked back to the group so the chat
// shows its event banner. Always private + free — a group hangout, not a
// ticketed public event (so there's no payment/approval gate to clear).
export const createEventFromGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { title, date, location, address, city, state, country, image, description, isVirtual, meetingLink, latitude, longitude } = req.body;
    const virtual = Boolean(isVirtual);

    if (!title || !date || (!virtual && !location)) {
      return res.status(400).json({ message: "Title, date, and location are required" });
    }
    if (meetingLink && !isValidMeetingLink(meetingLink)) {
      return res.status(400).json({ message: "Event link must be a valid URL (https://...)" });
    }
    assertMeaningful([{ field: "Title", value: title }]);
    assertClean([
      { field: "Title", value: title },
      { field: "Description", value: description },
      { field: "Location", value: location },
      { field: "Address", value: address },
    ]);

    const chat = await Chat.findById(chatId);
    if (!chat || chat.isActive === false) {
      return res.status(404).json({ message: "Group chat not found" });
    }
    if (chat.type !== "group") {
      return res.status(400).json({ message: "Events can only be created from group chats" });
    }
    const isAdmin = (chat.admins || []).some((a) => a.toString() === userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only a group admin can create an event for this group" });
    }

    // Cover image is optional: accept an inline base64 blob (upload it) or a URL.
    let eventImageUrl = "";
    if (image) {
      if (typeof image === "string" && image.startsWith("data:image")) {
        try {
          const result = await uploadBase64Image(image, "events");
          eventImageUrl = result.url;
        } catch (uploadErr) {
          console.error("Error uploading group event image:", uploadErr);
          return res.status(400).json({ message: "Error uploading event image", details: uploadErr.message });
        }
      } else {
        eventImageUrl = image;
      }
    }

    // Everyone in the group except the host is auto-enrolled as a confirmed guest.
    const memberIds = chat.participants
      .map((p) => p.toString())
      .filter((pid) => pid !== userId);

    const event = new Event({
      title,
      date: new Date(date),
      location: virtual ? "Online" : location,
      address: virtual ? "" : (address || ""),
      city: virtual ? "" : (city || ""),
      state: virtual ? "" : (state || ""),
      country: virtual ? "" : (country || ""),
      geo: virtual ? undefined : toGeoPoint(latitude, longitude),
      isVirtual: virtual,
      meetingLink: virtual ? (meetingLink || "") : "",
      image: eventImageUrl,
      images: eventImageUrl ? [eventImageUrl] : [],
      description: description || "",
      createdBy: userId,
      isPublic: false,
      isPaid: false,
      invitedUsers: memberIds,
      rsvpUsers: memberIds,
      groupChatId: chat._id,
      shareToken: new mongoose.Types.ObjectId().toString(),
      approvalStatus: "approved",
    });
    await event.save();

    // Link group → event so the chat renders its event banner. A group can host
    // successive events; the banner tracks the most recently created one.
    chat.event = event._id;
    await chat.save();

    const host = await User.findById(userId).select("username");

    // System message so the whole group sees the event was created.
    try {
      await ChatService.sendMessage(chat._id, userId, {
        type: "system",
        content: `${host?.username || "An admin"} created an event: ${title}`,
      });
    } catch (msgErr) {
      console.error("System message error on group event create:", msgErr);
    }

    // Notify the auto-enrolled members (best-effort).
    try {
      if (memberIds.length) {
        await Notification.insertMany(
          memberIds.map((mid) => ({
            user: mid,
            type: "event_invite",
            title: "New group event",
            body: `${host?.username || "An admin"} added you to "${title}"`,
            data: { eventId: event._id.toString() },
          }))
        );
      }
    } catch (notifErr) {
      console.error("Notification error on group event create:", notifErr);
    }

    invalidateCachePattern("user_chats_");
    invalidateCachePattern("public_events_");
    invalidateCachePattern("event_highlights_");

    const populatedEvent = await Event.findById(event._id)
      .populate("createdBy", "username email profilePicture")
      .populate("invitedUsers", "username email profilePicture")
      .populate("groupChatId", "_id name groupImage");

    res.status(201).json({
      message: "Event created for the group",
      event: populatedEvent,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Create event from group error:", error);
    res.status(500).json({ message: "Error creating event from group", error: error.message });
  }
};

// Get all events for a user (created or invited to)
export const getUserEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    // Web "My Events" tab: only events the caller created, optionally just the
    // public ones. Defaults to the broader created-or-invited feed (mobile).
    const createdOnly = req.query.createdOnly === "1" || req.query.createdOnly === "true";
    const publicOnly = req.query.publicOnly === "1" || req.query.publicOnly === "true";

    const query = createdOnly
      ? { createdBy: userId, isActive: true, ...(publicOnly ? { isPublic: true } : {}) }
      : {
          $or: [
            { createdBy: userId },
            { invitedUsers: userId },
            { pendingInvites: userId }
          ],
          isActive: true
        };

    const [events, total] = await Promise.all([
      Event.find(query)
        .populate('createdBy', 'username email profilePicture')
        .populate('invitedUsers', 'username email profilePicture')
        .populate('pendingInvites', 'username email profilePicture')
        .populate('groupChatId', '_id name groupImage')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Event.countDocuments(query),
    ]);

    // Add ticket counts, RSVP info, and userStatus
    const eventsWithInfo = await Promise.all(
      events.map(async (event) => {
        const eventObj = event.toObject();
        let paidSold = null;
        if (event.isPublic && event.isPaid && event.maxGuests > 0) {
          paidSold = await Ticket.countDocuments({ event: event._id, isValid: true });
          eventObj.ticketsSold = paidSold;
          eventObj.ticketsRemaining = event.maxGuests - paidSold;
        }
        // Paid events count attendance by TICKETS (not deduped RSVP users) and
        // don't expose an RSVP list; free events use the RSVP list as before.
        eventObj.rsvpCount = event.isPaid
          ? (paidSold ?? 0)
          : (event.rsvpUsers ? event.rsvpUsers.length : 0);
        if (event.isPaid) eventObj.rsvpUsers = [];
        eventObj.userRsvp = event.rsvpUsers ? event.rsvpUsers.some(id => id.toString() === userId) : false;

        // Determine the current user's relationship to this event
        if (event.createdBy._id.toString() === userId) {
          eventObj.userStatus = 'creator';
        } else if (event.invitedUsers.some(u => u._id.toString() === userId)) {
          eventObj.userStatus = 'accepted';
        } else if (event.pendingInvites.some(u => u._id.toString() === userId)) {
          eventObj.userStatus = 'pending';
        } else {
          eventObj.userStatus = 'none';
        }

        // Meeting link is attendees-only; pending invitees haven't accepted yet.
        if (eventObj.userStatus !== 'creator' && eventObj.userStatus !== 'accepted') {
          delete eventObj.meetingLink;
        }

        // Only the creator may see their unapproved proposed edits.
        if (eventObj.userStatus !== 'creator') delete eventObj.pendingEdits;

        // Attendance numbers are organizer-only here too, otherwise the list
        // card leaks the headcount the detail screen now withholds. cohosts
        // isn't populated on this query, so compare raw ObjectIds.
        applyAttendanceVisibility(eventObj, {
          isOrganizer:
            eventObj.userStatus === 'creator' || listHasUser(event.cohosts, userId),
        });

        return eventObj;
      })
    );

    res.status(200).json({ events: eventsWithInfo, total, page, limit });
  } catch (error) {
    console.error("Get user events error:", error);
    res.status(500).json({ message: "Error fetching events", error: error.message });
  }
};

// Get a single event by ID. Uses optionalAuth so deep links work for logged-out
// viewers — when there's no user we return public-safe fields only, and 401
// for events that aren't browsably public so the client can prompt login.
export const getEventById = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id ?? null;

    // Anon reads share a separate cache namespace so they never poison the
    // authenticated user's view (and vice versa).
    const cacheKey = userId
      ? `event_detail_${eventId}_${userId}`
      : `event_detail_${eventId}_anon`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    // Accept either an ObjectId (`_id`) or a shareToken so deep links like
    // `https://api.ourcityvibe.com/event/<shareToken>` (which expo-router
    // auto-routes to `/event/[id]`) resolve correctly without bouncing the
    // user through a 404 alert.
    const POPULATIONS = [
      ['createdBy', `username email profilePicture verified ${PAYOUT_ROUTING_FIELDS}`],
      ['cohosts', 'username email profilePicture'],
      ['invitedUsers', 'username email profilePicture'],
      ['pendingInvites', 'username email profilePicture'],
      ['joinRequests', 'username email profilePicture'],
      ['rsvpUsers', 'username profilePicture'],
      ['groupChatId', '_id name groupImage unreadCount'],
      ['vendors', 'name images rating verified vendorType city'],
      ['vendorInvites.vendor', 'name images rating verified vendorType city'],
    ];
    const populateAll = (q) => POPULATIONS.reduce((acc, [p, f]) => acc.populate(p, f), q);

    let event = mongoose.isValidObjectId(eventId)
      ? await populateAll(Event.findById(eventId))
      : null;
    if (!event) {
      event = await populateAll(Event.findOne({ shareToken: eventId }));
    }
    if (!event) {
      // Human-readable slug links (`/event/lagos-beach-party`) — slugs are
      // stored lowercase, so lowercase the param before matching.
      event = await populateAll(Event.findOne({ slug: eventId.toLowerCase() }));
    }

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Public events are browsable to everyone so buyers can read the details
    // before purchasing. Paid events still in the approval queue (or rejected)
    // are hidden from anyone except the creator.
    const isBrowsablePublic =
      event.isPublic &&
      event.isActive &&
      (!event.isPaid || event.approvalStatus === "approved");

    // User-relationship flags (all false for anon viewers).
    const isCreator = !!userId && event.createdBy._id.toString() === userId;
    const isCohostViewer = !!userId && (event.cohosts || []).some(u => u._id.toString() === userId);
    const isInvited = !!userId && event.invitedUsers.some(u => u._id.toString() === userId);
    const isPending = !!userId && event.pendingInvites.some(u => u._id.toString() === userId);
    const hasRequested = !!userId && (event.joinRequests || []).some(u => u._id.toString() === userId);
    // `event._id`, never the raw param: `eventId` may be a shareToken or a slug,
    // which would either cast-error (slug) or silently match nothing
    // (shareToken) and wrongly report the viewer as ticketless.
    const userTicket = userId
      ? await Ticket.findOne({ event: event._id, user: userId, isValid: true })
      : null;
    const hasTicket = !!userTicket;

    if (!userId) {
      // Anon viewers can only see browsable-public events; otherwise prompt login.
      if (!isBrowsablePublic) {
        return res.status(401).json({ message: "Log in to view this event" });
      }
    } else {
      const hasAccess =
        isCreator || isInvited || isPending || hasTicket || isBrowsablePublic;
      if (!hasAccess) {
        return res.status(403).json({ message: "You don't have access to this event" });
      }
    }

    // Track unique non-creator viewers for the organizer's "N seen" metric.
    // Only logged-in viewers count toward the metric (we don't write for anon).
    let seenCount = (event.viewedBy || []).length;
    if (userId && !isCreator) {
      const alreadyViewed = (event.viewedBy || []).some((id) => id.toString() === userId);
      if (!alreadyViewed) {
        await Event.updateOne({ _id: event._id }, { $addToSet: { viewedBy: userId } });
        seenCount += 1;
      }
    }

    const eventObj = event.toObject();
    eventObj.seenCount = seenCount;
    delete eventObj.viewedBy; // don't leak the viewer list
    eventObj.userRsvp = !!userId && event.rsvpUsers.some(u => u._id.toString() === userId);
    eventObj.rsvpCount = event.rsvpUsers.length;

    // The viewer's own venue pick on a multi-venue event, so the screen can show
    // which door they chose (and offer to change it) instead of asking again.
    // Their pass is the single record both an RSVP and a ticket write it to.
    // Only queried when there is a choice to have made and they are actually
    // going, so single-venue events pay nothing; this read is cached per viewer
    // alongside the rest of the response.
    eventObj.userLocationIndex = null;
    if (userId && (event.additionalLocations || []).length && (eventObj.userRsvp || hasTicket)) {
      const myPass = await Attendance.findOne({ event: event._id, user: userId })
        .select("locationIndex")
        .sort({ createdAt: 1 })
        .lean();
      if (myPass?.locationIndex != null) eventObj.userLocationIndex = myPass.locationIndex;
    }

    // The viewer's own stop picks on a programme event — every one they hold
    // a pass for, not just one, since sub-events are multi-select. Feeds the
    // checkbox list's initial state so re-opening the event shows what they
    // already chose instead of asking again.
    eventObj.userSubEvents = [];
    if (userId && (event.subEvents || []).length) {
      const myPasses = await Attendance.find({ event: event._id, user: userId })
        .select("subEvent")
        .lean();
      eventObj.userSubEvents = myPasses.map((p) => (p.subEvent != null ? String(p.subEvent) : null));
    }

    // Meeting link is attendees-only: host, cohosts, accepted guests, RSVPs,
    // ticket holders. Everyone else just learns a link exists.
    const canSeeMeetingLink =
      isCreator || isCohostViewer || isInvited || hasTicket || eventObj.userRsvp;
    eventObj.hasMeetingLink = !!event.meetingLink;
    if (!canSeeMeetingLink) delete eventObj.meetingLink;

    // Surface ticket info for paid events so the client can render the right CTA
    if (event.isPaid) {
      const ticketsSold = await Ticket.countDocuments({ event: event._id, isValid: true });
      eventObj.ticketsSold = ticketsSold;
      eventObj.ticketsRemaining = Math.max(event.maxGuests - ticketsSold, 0);
      eventObj.userHasPurchased = hasTicket;

      // Capacity/"going" for a paid event is measured in TICKETS, not RSVP
      // entries — one buyer can hold several (bought for themselves and/or
      // gifted). And ticket holders (gift recipients, guest buyers) are not
      // social RSVPs, so keep them out of the public "who's coming" list.
      eventObj.rsvpCount = ticketsSold;
      eventObj.rsvpUsers = [];

      // Per-tier remaining for tiers that declare their own quantity, so the
      // client can show "X left" and disable a sold-out tier. Tiers without a
      // quantity draw from the shared pool and report no per-tier remaining.
      const tiersWithQty = (event.ticketTiers || []).filter(
        (t) => typeof t.quantity === "number"
      );
      if (tiersWithQty.length) {
        const soldByTier = await Ticket.aggregate([
          { $match: { event: event._id, isValid: true } },
          { $group: { _id: "$tierId", count: { $sum: 1 } } },
        ]);
        const soldMap = new Map(soldByTier.map((r) => [String(r._id), r.count]));
        eventObj.ticketTiers = (eventObj.ticketTiers || []).map((t) => {
          if (typeof t.quantity !== "number") return t;
          const sold = soldMap.get(String(t._id)) || 0;
          return { ...t, remaining: Math.max(t.quantity - sold, 0) };
        });
      }
    }

    // Tell the client what this user's relationship to the event is
    if (isCreator) eventObj.userStatus = 'creator';
    else if (isInvited) eventObj.userStatus = 'accepted';
    else if (isPending) eventObj.userStatus = 'pending';
    else if (hasRequested) eventObj.userStatus = 'requested';
    else eventObj.userStatus = 'none';

    // Derived: mutuals on the guest list. Powers the "FRIENDS · N going" stat
    // and the "N friends" span on the attendees card. Anon viewers see 0.
    // Paid events don't expose an RSVP list (attendance is ticket-based), so the
    // mutuals stat is 0 there.
    const rsvpIdStrings = event.isPaid ? [] : event.rsvpUsers.map(u => u._id.toString());
    if (!userId || rsvpIdStrings.length === 0) {
      eventObj.friendsGoing = 0;
    } else {
      const [followingDocs, followerDocs] = await Promise.all([
        Follow.find({ follower: userId, following: { $in: rsvpIdStrings } }).select('following').lean(),
        Follow.find({ following: userId, follower: { $in: rsvpIdStrings } }).select('follower').lean(),
      ]);
      const iFollow = new Set(followingDocs.map(d => d.following.toString()));
      const followsMe = new Set(followerDocs.map(d => d.follower.toString()));
      eventObj.friendsGoing = rsvpIdStrings.filter(id => iFollow.has(id) && followsMe.has(id)).length;
    }

    // Derived: this user's unread count for the event's group chat. Always
    // delete the raw unread map so we never leak everyone else's counts.
    if (eventObj.groupChatId && eventObj.groupChatId.unreadCount) {
      const raw = eventObj.groupChatId.unreadCount;
      eventObj.groupChatUnread =
        userId && raw && typeof raw === 'object' ? (raw[userId] || 0) : 0;
      delete eventObj.groupChatId.unreadCount;
    } else {
      eventObj.groupChatUnread = 0;
    }

    // Derived: lifetime events hosted by the organizer (drives "@handle · N events hosted").
    eventObj.createdBy.hostedEventsCount = await Event.countDocuments({
      createdBy: event.createdBy._id,
      isActive: true,
    });

    // Derived: is this paid event actually purchasable right now? Folds the
    // approval gate AND the organizer's payout-onboarding status into one flag
    // (Paystack for Nigerian sellers, Stripe Connect for the cross-border
    // footprint) so the client can show a graceful "tickets not on sale yet"
    // state instead of letting the user tap "Buy" and bounce off a provider error.
    if (event.isPaid) {
      eventObj.ticketingReady =
        event.approvalStatus === "approved" && hasPayoutOnboarding(event.createdBy);
    } else {
      eventObj.ticketingReady = true;
    }

    // Which rail this organizer's ticket money settles on, so their payout
    // banners can name the right account instead of assuming Stripe — a
    // Nigerian organizer settles through Paystack and has no Stripe account to
    // be told about. Organizer-only: it's their account detail, not public. The
    // client can't derive it, because the cached user object it would need a
    // country from is written at login, which doesn't return `location`.
    if (isCreator || isCohostViewer) {
      eventObj.payoutProvider = getSettlementProvider(event.createdBy);
    }

    // Never leak the organizer's payout IDs/status to the client.
    if (eventObj.createdBy) {
      delete eventObj.createdBy.paystackRecipientCode;
      delete eventObj.createdBy.paystackOnboardingComplete;
      delete eventObj.createdBy.stripeAccountId;
      delete eventObj.createdBy.stripeAccountCountry;
      delete eventObj.createdBy.stripeAccountCurrency;
      delete eventObj.createdBy.stripeOnboardingComplete;
      delete eventObj.createdBy.stripePayoutsEnabled;
      delete eventObj.createdBy.location;
    }

    // For anon viewers, strip lists that could leak who's been invited.
    if (!userId) {
      delete eventObj.invitedUsers;
      delete eventObj.pendingInvites;
      delete eventObj.joinRequests;
    }

    // pendingEdits holds unapproved proposed values — only the creator may see it.
    if (!isCreator) delete eventObj.pendingEdits;

    // Last, so it sees every derived count above (rsvpCount, friendsGoing,
    // ticketsSold/Remaining and the per-tier remaining).
    applyAttendanceVisibility(eventObj, {
      isOrganizer: isCreator || isCohostViewer,
    });

    const response = { event: eventObj };
    setCache(cacheKey, response, 180); // 3 min TTL
    res.status(200).json(response);
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ message: "Error fetching event", error: error.message });
  }
};

// Get event by share token OR by event _id (back-compat for older events
// whose shareToken was never generated, and for links that use the _id).
export const getEventByShareToken = async (req, res) => {
  try {
    const { shareToken } = req.params;

    // 1) try shareToken — look up without isActive so we can distinguish
    //    "doesn't exist" from "soft-deleted" in the response.
    let event = await Event.findOne({ shareToken })
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    // 2) fall back to _id if the param looks like an ObjectId
    if (!event && mongoose.isValidObjectId(shareToken)) {
      event = await Event.findOne({ _id: shareToken })
        .populate('createdBy', 'username email profilePicture')
        .populate('invitedUsers', 'username email profilePicture');
      // Auto-heal: if this event has no shareToken yet, set it so subsequent
      // shares use the canonical token-based URL.
      if (event && !event.shareToken) {
        event.shareToken = new mongoose.Types.ObjectId().toString();
        await event.save();
      }
    }

    // 3) fall back to slug (`/event/lagos-beach-party`) — stored lowercase.
    if (!event) {
      event = await Event.findOne({ slug: shareToken.toLowerCase() })
        .populate('createdBy', 'username email profilePicture')
        .populate('invitedUsers', 'username email profilePicture');
    }

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.isActive === false) {
      return res.status(410).json({ message: "This event is no longer available" });
    }

    // Share links are unauthenticated — never leak the attendee-only meeting link
    // or the creator's unapproved proposed edits.
    const eventObj = event.toObject();
    eventObj.hasMeetingLink = !!event.meetingLink;
    delete eventObj.meetingLink;
    delete eventObj.pendingEdits;

    // There is no `req.user` on this route at all, so the viewer is always a
    // stranger. It used to return the raw document from here, which shipped the
    // invite list (populated, INCLUDING email addresses), the viewer list, and
    // every capacity number regardless of `showAttendance` — an organizer who
    // opted out still had their headcount published to anyone holding a link.
    // Mirror the anonymous branch of getEventById instead.
    delete eventObj.viewedBy;
    delete eventObj.pendingInvites;
    delete eventObj.joinRequests;
    // Not deleted outright like the lists above: the share screen checks whether
    // the viewer is already on it to decide between "Join" and "You're going".
    // It only ever reads `_id`, so reduce to ids — the populated form was
    // shipping every invitee's email and photo to anyone holding the link.
    eventObj.invitedUsers = (event.invitedUsers || []).map((u) => ({ _id: String(u._id) }));

    // Counts are derived before redacting so applyAttendanceVisibility can work
    // out `soldOut` — the one signal that survives the opt-out, because checkout
    // needs it and it reveals no number.
    eventObj.rsvpCount = event.rsvpUsers.length;
    if (event.isPaid) {
      const ticketsSold = await Ticket.countDocuments({ event: event._id, isValid: true });
      eventObj.ticketsSold = ticketsSold;
      eventObj.ticketsRemaining = Math.max(event.maxGuests - ticketsSold, 0);
      // Paid capacity is measured in tickets, not RSVP entries — one buyer can
      // hold several. Same rule as getEventById.
      eventObj.rsvpCount = ticketsSold;
      eventObj.rsvpUsers = [];

      const tiersWithQty = (event.ticketTiers || []).filter(
        (t) => typeof t.quantity === "number"
      );
      if (tiersWithQty.length) {
        const soldByTier = await Ticket.aggregate([
          { $match: { event: event._id, isValid: true } },
          { $group: { _id: "$tierId", count: { $sum: 1 } } },
        ]);
        const soldMap = new Map(soldByTier.map((r) => [String(r._id), r.count]));
        eventObj.ticketTiers = (eventObj.ticketTiers || []).map((t) => {
          if (typeof t.quantity !== "number") return t;
          const sold = soldMap.get(String(t._id)) || 0;
          return { ...t, remaining: Math.max(t.quantity - sold, 0) };
        });
      }
    }
    // Anonymous viewer, so never the organizer.
    applyAttendanceVisibility(eventObj, { isOrganizer: false });

    res.status(200).json({ event: eventObj });
  } catch (error) {
    console.error("Get event by token error:", error);
    res.status(500).json({ message: "Error fetching event", error: error.message });
  }
};

/**
 * QR code for an event's share link.
 *
 * The QR encodes the exact same universal link the Share sheet copies —
 * `<serverUrl>/event/<shareToken>` — so scanning it behaves identically to
 * tapping the link: iOS/Android hand it to the app when installed, and fall
 * back to the deep-link landing page in the browser when it isn't. See
 * linkQrDataUrl for why it isn't a `mobile://` scheme.
 *
 * Access mirrors getEventById rather than the unauthenticated share-token
 * endpoint. The QR *contains* the shareToken, and for a private event that
 * token IS the access grant — minting one for any caller who guessed an _id
 * would quietly make private events public.
 */
export const getEventQr = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id ?? null;

    const FIELDS =
      "title shareToken slug isPublic isActive isPaid approvalStatus createdBy cohosts invitedUsers pendingInvites rsvpUsers";

    let event = mongoose.isValidObjectId(eventId)
      ? await Event.findById(eventId).select(FIELDS)
      : null;
    if (!event) event = await Event.findOne({ shareToken: eventId }).select(FIELDS);
    if (!event) event = await Event.findOne({ slug: eventId.toLowerCase() }).select(FIELDS);

    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.isActive === false) {
      return res.status(410).json({ message: "This event is no longer available" });
    }

    const idIn = (list) =>
      !!userId && (list || []).some((x) => x.toString() === userId);

    const isBrowsablePublic =
      event.isPublic && (!event.isPaid || event.approvalStatus === "approved");
    const isCreator = !!userId && event.createdBy.toString() === userId;
    const hasTicket = userId
      ? !!(await Ticket.findOne({ event: event._id, user: userId, isValid: true }).select("_id").lean())
      : false;

    const hasAccess =
      isBrowsablePublic ||
      isCreator ||
      idIn(event.cohosts) ||
      idIn(event.invitedUsers) ||
      idIn(event.pendingInvites) ||
      idIn(event.rsvpUsers) ||
      hasTicket;

    if (!hasAccess) {
      return res
        .status(userId ? 403 : 401)
        .json({ message: "You don't have access to this event" });
    }

    // Auto-heal older events created before shareToken existed, so the QR is
    // always token-based (same behaviour as getEventByShareToken).
    if (!event.shareToken) {
      event.shareToken = new mongoose.Types.ObjectId().toString();
      await event.save();
    }

    // Prefer the human-readable slug in the encoded link; shareToken remains
    // the immutable fallback for events whose title produced no slug.
    const url = `${config.stripe.serverUrl}/event/${event.slug || event.shareToken}`;

    // The PNG is a pure function of the URL, so it's worth caching — but keyed
    // on the token, not the requested id, so the `_id`, `shareToken` and `slug`
    // forms of the same event share one entry.
    const cacheKey = `event_qr_${event.slug || event.shareToken}`;
    let qr = getCache(cacheKey);
    if (!qr) {
      qr = await linkQrDataUrl(url);
      setCache(cacheKey, qr, 60 * 60 * 24);
    }

    res.status(200).json({ url, qr, title: event.title });
  } catch (error) {
    console.error("Get event QR error:", error);
    res.status(500).json({ message: "Error generating QR code", error: error.message });
  }
};

/**
 * Validate + normalize a ticketTiers payload for an edit (names, prices, optional
 * per-tier quantities). Mirrors the core create-time checks. Returns
 * `{ tiers }` or `{ error }`.
 */
function validateTierPayload(ticketTiers) {
  if (!Array.isArray(ticketTiers)) return { error: "Ticket tiers must be a list." };
  if (ticketTiers.length > 10) return { error: "You can create up to 10 ticket tiers." };
  const tiers = ticketTiers.map((t) => {
    const tier = { name: String(t?.name || "").trim(), price: Number(t?.price) };
    if (t?.quantity !== undefined && t?.quantity !== null && t?.quantity !== "") {
      tier.quantity = Number(t.quantity);
    }
    return tier;
  });
  if (tiers.some((t) => !t.name)) return { error: "Every ticket tier needs a name." };
  if (tiers.some((t) => t.name.length > 40)) return { error: "Tier names must be 40 characters or fewer." };
  const names = new Set(tiers.map((t) => t.name.toLowerCase()));
  if (names.size !== tiers.length) return { error: "Tier names must be unique." };
  if (tiers.some((t) => !Number.isFinite(t.price) || t.price <= 0)) {
    return { error: "Every ticket tier needs a price greater than 0." };
  }
  const withQty = tiers.filter((t) => t.quantity !== undefined);
  if (withQty.length > 0) {
    if (withQty.length !== tiers.length) {
      return { error: "Set a quantity for every ticket tier, or leave them all blank." };
    }
    if (tiers.some((t) => !Number.isInteger(t.quantity) || t.quantity <= 0)) {
      return { error: "Every ticket tier needs a whole quantity greater than 0." };
    }
  }
  return { tiers };
}

// Update an event
export const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      title, date, endDate, location, address, city, state, country, image, images,
      description, isPublic, isVirtual, meetingLink, showAttendance, hidePrice,
      latitude, longitude, additionalLocations, subEvents,
      // Material (pricing/capacity) fields — held for admin approval on public events.
      ticketTiers, ticketPrice, maxGuests,
    } = req.body;
    const userId = req.user.id;

    const event = await findEventByAnyId(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Creator or co-host can update the event
    const isCohost = (event.cohosts || []).some(c => c.toString() === userId);
    if (event.createdBy.toString() !== userId && !isCohost) {
      return res.status(403).json({ message: "You don't have permission to update this event" });
    }

    if (hidePrice !== undefined && typeof hidePrice !== "boolean") {
      return res.status(400).json({ message: "hidePrice must be true or false." });
    }

    // Visibility is locked once an event is created. Flipping private ↔ public
    // after the fact would either (a) leak a private guest list to strangers,
    // or (b) silently strand paid ticket-holders who can no longer see the
    // event in browse. Either direction requires a different product flow
    // (re-issue invites, refund tickets) — refuse and tell the client why.
    if (isPublic !== undefined && Boolean(isPublic) !== Boolean(event.isPublic)) {
      const reason = event.isPublic
        ? "This event is already public and can't be made private — guests who joined or bought tickets would lose access. Delete and recreate the event if you need it to be private."
        : "A private event can't be made public after it's been created. Create a new public event if you'd like to open it up to everyone.";
      return res.status(400).json({ message: reason });
    }

    // Title is optional on update — only validate meaningfulness when supplied.
    if (title !== undefined) {
      assertMeaningful([{ field: "Title", value: title }]);
    }

    assertClean([
      { field: "Title", value: title },
      { field: "Description", value: description },
      { field: "Location", value: location },
      { field: "Address", value: address },
    ]);

    // Validated before the image handling below, which deletes the old cover
    // from Cloudinary — a 400 must not land after that.
    const extraVenues =
      additionalLocations !== undefined ? normalizeAdditionalLocations(additionalLocations) : null;
    if (extraVenues?.error) return res.status(400).json({ message: extraVenues.error });

    // The programme, normalized against the live stops so each one KEEPS ITS
    // _id. Without that, replacing the array would renumber every stop and
    // silently move attendees between them.
    let programme = null;
    if (subEvents !== undefined) {
      const nextStart = date !== undefined ? new Date(date) : event.date;
      const parsed = normalizeSubEvents(subEvents, {
        existing: event.subEvents,
        eventStart: nextStart,
        eventEnd:
          endDate !== undefined
            ? parseEndDate(endDate, nextStart).value
            : event.endDate,
      });
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      programme = parsed.subEvents;

      // Mutually exclusive with the venue list — see createEvent.
      const venuesAfter = extraVenues ? extraVenues.locations : event.additionalLocations || [];
      if (programme.length && venuesAfter.length) {
        return res.status(400).json({
          message:
            "An event can run at several locations, or have a programme of sub-events — not both.",
        });
      }

      // A stop people already hold passes or tickets for cannot just vanish —
      // those QR codes would point at nothing. The organizer closes its sales
      // instead. Checked before anything is written.
      const keptIds = new Set(programme.map((s) => String(s._id)));
      const dropped = (event.subEvents || []).filter((s) => !keptIds.has(String(s._id)));
      if (dropped.length) {
        const droppedIds = dropped.map((s) => s._id);
        const [passCount, ticketCount] = await Promise.all([
          Attendance.countDocuments({ event: event._id, subEvent: { $in: droppedIds } }),
          Ticket.countDocuments({ event: event._id, subEvent: { $in: droppedIds }, isValid: true }),
        ]);
        if (passCount > 0 || ticketCount > 0) {
          const names = dropped.map((s) => `"${s.title}"`).join(", ");
          return res.status(400).json({
            message: `${names} already has guests booked, so it can't be removed. Close its sales instead.`,
          });
        }
      }
    }

    // Handle event image upload (if provided)
    if (image !== undefined) {
      if (image && image.startsWith('data:image')) {
        try {
          // Delete old event image if it exists and is a Cloudinary URL
          if (event.image && event.image.includes('cloudinary.com')) {
            await deleteImage(event.image).catch(err => console.error("Error deleting old event image:", err));
          }

          const result = await uploadBase64Image(image, 'events');
          event.image = result.url;
        } catch (error) {
          console.error("Error uploading event image:", error);
          return res.status(400).json({ message: "Error uploading event image", details: error.message });
        }
      } else {
        // Already a URL or empty string
        event.image = image;
      }
    }

    // Handle the full photo gallery (if provided). Client uploads then sends URLs.
    if (Array.isArray(images)) {
      const gallery = [];
      for (const item of images) {
        if (!item) continue;
        if (typeof item === "string" && item.startsWith("data:image")) {
          try {
            const result = await uploadBase64Image(item, "events");
            gallery.push(result.url);
          } catch (error) {
            console.error("Error uploading event image:", error);
            return res.status(400).json({ message: "Error uploading event image", details: error.message });
          }
        } else {
          gallery.push(item);
        }
      }
      event.images = gallery;
      event.image = gallery[0] || "";
    }

    // Update fields. Title is a minor field — applied immediately.
    if (title) event.title = title;

    // Resolve the target mode first and gate every location-family write on
    // it, so a stale client payload can't resurrect the old address on a
    // virtual event.
    const willBeVirtual = isVirtual !== undefined ? Boolean(isVirtual) : Boolean(event.isVirtual);
    if (willBeVirtual) {
      event.isVirtual = true;
      event.location = "Online";
      event.address = "";
      event.city = "";
      event.state = "";
      event.country = "";
      event.geo = undefined;
      event.additionalLocations = [];
    } else {
      // Switching virtual → physical requires a real location in the same request.
      if (event.isVirtual && !location) {
        return res.status(400).json({ message: "Add a location to make this an in-person event" });
      }
      event.isVirtual = false;
      if (location) event.location = location;
      if (address !== undefined) event.address = address;
      if (city !== undefined) event.city = city;
      if (state !== undefined) event.state = state;
      if (country !== undefined) event.country = country;
      // Minor field, same class as `address`: the pin is where the venue is,
      // not what the attendee paid. It applies immediately rather than sitting
      // in pendingEdits.
      if (latitude !== undefined && longitude !== undefined) {
        event.geo = toGeoPoint(latitude, longitude);
      }
      // Replaced wholesale, and only when sent: web edit and older app builds
      // post venue #1 alone, which must not wipe the other venues. Minor field
      // like the rest of this block — applies immediately.
      if (extraVenues) event.additionalLocations = extraVenues.locations;
    }
    if (meetingLink !== undefined) {
      if (meetingLink && !isValidMeetingLink(meetingLink)) {
        return res.status(400).json({ message: "Event link must be a valid URL (https://...)" });
      }
      event.meetingLink = willBeVirtual ? meetingLink : "";
    }
    if (description !== undefined) event.description = description;

    // Minor field: this only changes who may READ the headcount, not the price,
    // date or capacity itself — so it applies immediately rather than sitting in
    // pendingEdits waiting on an admin.
    if (showAttendance !== undefined) event.showAttendance = Boolean(showAttendance);
    if (hidePrice !== undefined) {
      // Un-hiding needs a live number to reveal. A hidden-price event may have
      // gone on sale with no asking price at all, and hidePrice applies at once
      // while a price set in the same edit is held for review below — so a paid
      // event would be left publicly priced at 0 and sell free tickets.
      if (!hidePrice && event.hidePrice && event.isPaid &&
          !(Number(event.ticketPrice) > 0) && !(event.ticketTiers || []).length) {
        return res.status(400).json({
          message: "Set a ticket price and wait for it to be approved before showing prices on this event.",
        });
      }
      event.hidePrice = hidePrice && Boolean(event.isPaid || (event.subEvents || []).some((stop) => stop.ticketPrice > 0));
    }

    // ── Material changes (date + pricing/capacity) ─────────────────────────────
    // On a PUBLIC event these are held in `pendingEdits` for an admin to approve
    // — the live doc keeps serving its current values until then. On a PRIVATE
    // event they apply immediately (no public audience to protect).
    //
    // Only fields that ACTUALLY CHANGED count as material — clients (esp. mobile)
    // resend the whole form on every edit, so a description-only edit shouldn't
    // queue an approval just because it echoed the unchanged date/price.
    const material = {};
    if (date !== undefined) {
      const d = new Date(date);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid date" });
      if (!event.date || d.getTime() !== new Date(event.date).getTime()) material.date = d;
    }
    if (endDate !== undefined) {
      // Validate against the new start when one is being set in the same edit,
      // otherwise against the live one.
      const parsedEnd = parseEndDate(endDate, material.date || event.date);
      if (parsedEnd.error) return res.status(400).json({ message: parsedEnd.error });
      const current = event.endDate ? new Date(event.endDate).getTime() : null;
      const next = parsedEnd.value ? parsedEnd.value.getTime() : null;
      if (current !== next) material.endDate = parsedEnd.value;
    }
    // Pricing/capacity edits only apply to paid events.
    if (event.isPaid && (ticketTiers !== undefined || ticketPrice !== undefined || maxGuests !== undefined)) {
      if (ticketTiers !== undefined) {
        const { tiers, error } = validateTierPayload(ticketTiers);
        if (error) return res.status(400).json({ message: error });
        // Compare normalized tiers (name/price/quantity) against the live ones.
        const norm = (arr) =>
          JSON.stringify(
            (arr || []).map((t) => ({
              name: t.name,
              price: Number(t.price),
              quantity: t.quantity === undefined ? null : Number(t.quantity),
            }))
          );
        if (norm(tiers) !== norm(event.ticketTiers)) {
          material.ticketTiers = tiers;
          if (tiers.length) {
            material.ticketPrice = Math.min(...tiers.map((t) => t.price));
            const allQty = tiers.every((t) => t.quantity !== undefined);
            if (allQty) material.maxGuests = tiers.reduce((s, t) => s + t.quantity, 0);
            else if (maxGuests !== undefined) material.maxGuests = Number(maxGuests);
          }
        }
      } else {
        if (ticketPrice !== undefined) {
          const next = ticketPrice === "" || ticketPrice === null ? 0 : Number(ticketPrice);
          // 0 drops the asking price, which only a hidden-price event can do:
          // its tickets are sold on a negotiated invoice, not a published rate.
          if (!Number.isFinite(next) || next < 0 || (next === 0 && !event.hidePrice)) {
            return res.status(400).json({ message: "Ticket price must be greater than 0." });
          }
          if (next !== Number(event.ticketPrice)) material.ticketPrice = next;
        }
        if (maxGuests !== undefined) {
          if (!Number.isInteger(Number(maxGuests)) || Number(maxGuests) <= 0) {
            return res.status(400).json({ message: "Max guests must be a whole number greater than 0." });
          }
          if (Number(maxGuests) !== Number(event.maxGuests)) material.maxGuests = Number(maxGuests);
        }
      }
    }

    // The programme splits by whether a change touches MONEY. Renaming a stop,
    // moving it or changing its guest limit goes live at once; adding a priced
    // stop or repricing one waits for review, same as the event's own pricing.
    //
    // When it does hold, the WHOLE array goes into pendingEdits — not a delta.
    // approveEventEdit blind-copies `event[key] = value`, so a partial array
    // would wipe the stops it left out. Held exactly the way ticketTiers is.
    if (programme) {
      const money = (stop) =>
        JSON.stringify({
          price: Number(stop.ticketPrice || 0),
          tiers: (stop.ticketTiers || []).map((t) => ({
            name: t.name,
            price: Number(t.price),
            quantity: t.quantity === undefined ? null : Number(t.quantity),
          })),
        });
      const before = new Map((event.subEvents || []).map((s) => [String(s._id), money(s)]));
      const costsMoney = programme.some((s) => {
        const prev = before.get(String(s._id));
        // A brand-new stop only counts when it actually charges for something.
        if (prev === undefined) return Number(s.ticketPrice || 0) > 0;
        return prev !== money(s);
      });

      if (costsMoney) material.subEvents = programme;
      else event.subEvents = programme;
    }

    const materialKeys = Object.keys(material);
    const holdForApproval = event.isPublic && materialKeys.length > 0;
    if (holdForApproval) {
      // Merge with any still-pending edits so a follow-up edit doesn't drop them.
      event.pendingEdits = {
        fields: { ...(event.pendingEdits?.fields || {}), ...material },
        status: "pending",
        submittedAt: new Date(),
        reviewedAt: undefined,
        reviewedBy: undefined,
        rejectReason: undefined,
      };
    } else {
      for (const k of materialKeys) event[k] = material[k];
    }

    await event.save();

    // Keep the linked group chat's name in lockstep with the event title so a
    // rename in one place shows up in the other. (Reflects on next chat load.)
    if (title && event.groupChatId) {
      await Chat.findByIdAndUpdate(event.groupChatId, { name: title });
    }

    for (const key of [event._id, event.slug, event.shareToken].filter(Boolean)) {
      invalidateCachePattern(`event_detail_${key}_`);
    }
    // Toggling virtual (or editing location) changes which discover filters
    // the event appears under — drop the feed caches too.
    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    const updatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    res.status(200).json({
      message: holdForApproval
        ? "Your changes were saved. Pricing, capacity and date changes need admin approval before they go live; other changes are already live."
        : "Event updated successfully",
      pendingApproval: holdForApproval,
      event: updatedEvent
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Update event error:", error);
    res.status(500).json({ message: "Error updating event", error: error.message });
  }
};

/**
 * PATCH /events/:eventId/ticket-sales
 * body: { closed: boolean }
 *
 * Organizer's stop/resume switch for ticket sales. Applies immediately rather
 * than going through `pendingEdits` — this is availability, not a price or
 * capacity change, so it's the same class of edit as `showAttendance`.
 *
 * Reopening can't undo the reasons the organizer doesn't control (the event
 * ended, it was cancelled, a cancellation is under review), so it reports the
 * effective state back rather than claiming sales are open.
 */
export const setTicketSales = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { closed } = req.body;
    const userId = req.user.id;

    if (typeof closed !== "boolean") {
      return res.status(400).json({ message: "closed must be true or false" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const isCohost = (event.cohosts || []).some((c) => c.toString() === userId);
    if (event.createdBy.toString() !== userId && !isCohost) {
      return res.status(403).json({ message: "You don't have permission to update this event" });
    }
    if (!event.isPaid) {
      return res.status(400).json({ message: "This event doesn't sell tickets" });
    }
    if (event.cancelledAt) {
      return res.status(400).json({ message: "This event has been cancelled" });
    }
    if (event.cancellationRequest?.status === "pending") {
      return res.status(400).json({
        message: "Ticket sales stay closed while your cancellation request is under review.",
      });
    }

    event.ticketSalesClosedAt = closed ? new Date() : null;
    event.ticketSalesClosedBy = closed ? userId : undefined;
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);

    const reason = ticketSalesClosedReason(event);
    res.status(200).json({
      message: closed ? "Ticket sales closed" : "Ticket sales reopened",
      ticketSalesClosedAt: event.ticketSalesClosedAt,
      salesClosed: reason !== null,
      salesClosedReason: reason,
    });
  } catch (error) {
    console.error("setTicketSales:", error);
    res.status(500).json({ message: "Failed to update ticket sales" });
  }
};

/**
 * PATCH /events/:eventId/sub-events/:subEventId/ticket-sales
 * body: { closed: boolean }
 *
 * Per-stop twin of setTicketSales — pausing the finished brunch leaves the
 * still-upcoming club night untouched. The umbrella event's own toggle stays
 * on setTicketSales; this one only ever reaches into `subEvents`.
 */
export const setStopTicketSales = async (req, res) => {
  try {
    const { eventId, subEventId } = req.params;
    const { closed } = req.body;
    const userId = req.user.id;

    if (typeof closed !== "boolean") {
      return res.status(400).json({ message: "closed must be true or false" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const isCohost = (event.cohosts || []).some((c) => c.toString() === userId);
    if (event.createdBy.toString() !== userId && !isCohost) {
      return res.status(403).json({ message: "You don't have permission to update this event" });
    }

    const stop = event.subEvents.id(subEventId);
    if (!stop) return res.status(404).json({ message: "Sub-event not found" });
    if (!(stop.ticketPrice > 0)) {
      return res.status(400).json({ message: "This stop doesn't sell tickets" });
    }
    if (event.cancelledAt) {
      return res.status(400).json({ message: "This event has been cancelled" });
    }
    if (event.cancellationRequest?.status === "pending") {
      return res.status(400).json({
        message: "Ticket sales stay closed while your cancellation request is under review.",
      });
    }

    stop.ticketSalesClosedAt = closed ? new Date() : null;
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);

    const reason = stopSalesClosedReason(event, findStop(event, subEventId));
    res.status(200).json({
      message: closed ? "Ticket sales closed for this stop" : "Ticket sales reopened for this stop",
      ticketSalesClosedAt: stop.ticketSalesClosedAt,
      salesClosed: reason !== null,
      salesClosedReason: reason,
    });
  } catch (error) {
    console.error("setStopTicketSales:", error);
    res.status(500).json({ message: "Failed to update ticket sales" });
  }
};

// Delete an event
export const deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only the creator can delete the event
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to delete this event" });
    }

    event.isActive = false;
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({ message: "Error deleting event", error: error.message });
  }
};

// Invite user to event by username
export const inviteUserByUsername = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { username } = req.body;
    const userId = req.user.id;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Creator or co-host can invite users
    const isCohost = (event.cohosts || []).some(c => c.toString() === userId);
    if (event.createdBy.toString() !== userId && !isCohost) {
      return res.status(403).json({ message: "You don't have permission to invite users to this event" });
    }

    // Find user by username — case-insensitive so "John" matches a stored
    // "john". Usernames preserve display case but are matched case-insensitively
    // (see utils/escapeRegex.js); a plain { username } match silently failed to
    // find users whose capitalization differed from what was typed.
    if (!username || typeof username !== "string") {
      return res.status(400).json({ message: "Username is required" });
    }
    const userToInvite = await User.findOne({
      username: exactCaseInsensitive(username),
    });

    if (!userToInvite) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is the creator
    if (event.createdBy.toString() === userToInvite._id.toString()) {
      return res.status(400).json({ message: "Cannot invite the event creator" });
    }

    // Only mutual follows can be invited
    const isMutual = await areMutualFollows(userId, userToInvite._id.toString());
    if (!isMutual) {
      return res.status(403).json({ message: "You can only invite users who mutually follow you" });
    }

    // Check if user is already confirmed or already has a pending invite
    const alreadyConfirmed = event.invitedUsers.some(id => id.toString() === userToInvite._id.toString());
    const alreadyPending = event.pendingInvites.some(id => id.toString() === userToInvite._id.toString());
    if (alreadyConfirmed || alreadyPending) {
      return res.status(400).json({ message: alreadyConfirmed ? "User has already accepted this event" : "User already has a pending invite" });
    }

    // Add to pendingInvites — they must accept before being added to invitedUsers
    event.pendingInvites.push(userToInvite._id);
    await event.save();

    const updatedEvent = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture')
      .populate('pendingInvites', 'username email profilePicture');

    // Send invitation notification and real-time socket event
    try {
      const inviter = await User.findById(userId).select('username');
      await Notification.create({
        user: userToInvite._id,
        type: 'event_invite',
        title: 'Event Invitation',
        body: `${inviter?.username || 'Someone'} invited you to "${event.title}"`,
        data: { eventId: event._id.toString() },
      });
      // Notify the invited user in real-time so their Events tab updates immediately
      emitEventInvite(userToInvite._id.toString(), {
        eventId: event._id.toString(),
        eventTitle: event.title,
        inviterUsername: inviter?.username || 'Someone',
      });
    } catch (notifError) {
      console.error("Error sending invite notification:", notifError);
    }

    res.status(200).json({
      message: "Invite sent — waiting for user to accept",
      event: updatedEvent,
    });
  } catch (error) {
    console.error("Invite user error:", error);
    res.status(500).json({ message: "Error inviting user", error: error.message });
  }
};

// Request to join an invite-only event. Anyone with the link can ask; the
// organizer accepts/declines from their invitee management UI (or from a
// notification action). Distinct from `inviteUserByUsername` (organizer-led).
export const requestToJoinEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    if (event.createdBy.toString() === userId) {
      return res.status(400).json({ message: "You're the organizer of this event" });
    }
    if (event.invitedUsers.some(id => id.toString() === userId)) {
      return res.status(400).json({ message: "You're already attending" });
    }
    if (event.pendingInvites.some(id => id.toString() === userId)) {
      return res.status(400).json({ message: "You already have an invite waiting — respond to it" });
    }
    if ((event.joinRequests || []).some(id => id.toString() === userId)) {
      return res.status(200).json({ message: "Request already sent" });
    }

    event.joinRequests = event.joinRequests || [];
    event.joinRequests.push(userId);
    await event.save();
    invalidateCachePattern(`event_detail_${eventId}_`);

    try {
      const requester = await User.findById(userId).select('username');
      await Notification.create({
        user: event.createdBy,
        type: 'event_join_request',
        title: 'Request to join',
        body: `${requester?.username || 'Someone'} wants to join "${event.title}"`,
        data: { eventId: event._id.toString(), userId },
      });
    } catch (notifError) {
      console.error("Error sending join-request notification:", notifError);
    }

    res.status(200).json({ message: "Request sent" });
  } catch (error) {
    console.error("Request to join error:", error);
    res.status(500).json({ message: "Error requesting to join", error: error.message });
  }
};

// Respond to an event invite (accept or decline)
/**
 * Ensure `userId` is a member of the event's group chat, creating the chat on
 * the first join. Private events only — public events skip the chat (a massive
 * group chat is unusable and would melt the push-notification fanout). There is
 * NO mutual-follow requirement: being on the guest list (via invite-accept or a
 * share link) is itself the entry grant. Mutates `event.groupChatId`; the caller
 * is responsible for persisting the event with `event.save()`. Best-effort —
 * chat failures are logged, never thrown, so they can't break the join itself.
 */
async function ensureEventGroupChatMember(event, userId) {
  if (event.isPublic) return;
  try {
    const user = await User.findById(userId).select('username');
    if (!event.groupChatId) {
      const groupChat = await ChatService.createGroupChat(
        event.title,
        [event.createdBy.toString(), userId],
        event.createdBy.toString(),
        event.image || "",
        event._id
      );
      event.groupChatId = groupChat._id;
    } else {
      const groupChat = await Chat.findById(event.groupChatId);
      if (groupChat && !groupChat.participants.some(p => p.toString() === userId)) {
        groupChat.participants.push(userId);
        groupChat.unreadCount.set(userId, 0);
        groupChat.isArchived.set(userId, false);
        groupChat.isMuted.set(userId, false);
        await groupChat.save();
        await ChatService.sendMessage(event.groupChatId, userId, {
          type: 'system',
          content: `${user?.username || 'Someone'} joined the group`
        });
      }
    }
  } catch (chatErr) {
    console.error("Event group chat membership error:", chatErr);
  }
}

export const respondToInvite = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, locationIndex } = req.body; // "accepted" | "declined"
    const userId = req.user.id;

    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'accepted' or 'declined'" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Accepting is an RSVP, so it carries the same venue pick — see rsvpEvent.
    const { choice: venueChoice, error: venueError } = resolveVenueChoice(event, locationIndex);
    if (venueError) return res.status(400).json({ message: venueError });

    // Must have a pending invite
    const isPending = event.pendingInvites.some(id => id.toString() === userId);
    if (!isPending) {
      return res.status(400).json({ message: "No pending invite found for this event" });
    }

    // Remove from pendingInvites regardless of response
    event.pendingInvites = event.pendingInvites.filter(id => id.toString() !== userId);

    if (status === "accepted") {
      // Add to confirmed attendees
      event.invitedUsers.push(userId);
      // Treat the acceptance as an RSVP so the event's going / capacity /
      // friends-going stats reflect it without a separate tap.
      if (!event.rsvpUsers.some(id => id.toString() === userId)) {
        event.rsvpUsers.push(userId);
      }

      // Auto-create / extend the event group chat (private events only).
      await ensureEventGroupChatMember(event, userId);

      // Notify the event creator
      try {
        const user = await User.findById(userId).select('username');
        await Notification.create({
          user: event.createdBy,
          type: 'invite_accepted',
          title: 'Invite Accepted',
          body: `${user?.username || 'Someone'} accepted your invite to "${event.title}"`,
          data: { eventId: event._id.toString() },
        });
      } catch (notifErr) {
        console.error("Notification error on invite accept:", notifErr);
      }
    }
    // On decline: nothing extra needed, user is just removed from pendingInvites

    await event.save();

    // Accepting an invite is an RSVP — issue the entry pass + email the QR.
    if (status === "accepted") {
      issueEventPass({ userId, eventId, type: "rsvp", venueChoice }).catch((e) =>
        console.error("issueEventPass (respondToInvite) failed:", e)
      );
    }

    const updatedEvent = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture')
      .populate('pendingInvites', 'username email profilePicture')
      .populate('groupChatId', '_id name groupImage');

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.json({
      message: status === "accepted" ? "You've joined the event!" : "Invite declined",
      event: updatedEvent,
    });
  } catch (error) {
    console.error("Respond to invite error:", error);
    res.status(500).json({ message: "Error responding to invite", error: error.message });
  }
};

// Join event via share link
export const joinEventByShareLink = async (req, res) => {
  try {
    const { shareToken } = req.params;
    const userId = req.user.id;

    let event = await Event.findOne({ shareToken });
    if (!event && mongoose.isValidObjectId(shareToken)) {
      event = await Event.findOne({ _id: shareToken });
    }
    if (!event) {
      // Slug share links (`/event/lagos-beach-party`) — stored lowercase.
      event = await Event.findOne({ slug: shareToken.toLowerCase() });
    }

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.isActive === false) {
      return res.status(410).json({ message: "This event is no longer available" });
    }

    if (event.createdBy.toString() === userId) {
      return res.status(400).json({ message: "You are the creator of this event" });
    }

    // Joining via a link is an RSVP, so it carries the venue pick too. Absent
    // when the link was opened by a surface with no picker (the server-rendered
    // share page), which leaves the guest list honest about not knowing.
    const { choice: venueChoice, error: venueError } = resolveVenueChoice(
      event,
      req.body?.locationIndex
    );
    if (venueError) return res.status(400).json({ message: venueError });

    // Paid events are always public and ticketed — a share link can't grant
    // free entry. Send them through the purchase flow instead. (Private events
    // are always free, so this never blocks the private-invite case.)
    if (event.isPaid) {
      return res.status(400).json({
        message: "This is a paid event — get a ticket to join.",
      });
    }

    // Possessing the link IS the access grant — so this works for private,
    // invite-only events and does NOT require the joiner to mutually follow
    // (or follow at all) the host. We just need to (a) confirm them on the
    // guest list and (b) drop any stale pending invite / join request, then
    // (c) pull them into the group chat below.
    const alreadyJoined = event.invitedUsers.some(id => id.toString() === userId);
    if (!alreadyJoined) {
      event.invitedUsers.push(userId);
    }
    if (!event.rsvpUsers.some(id => id.toString() === userId)) {
      event.rsvpUsers.push(userId);
    }
    event.pendingInvites = event.pendingInvites.filter(id => id.toString() !== userId);
    if (Array.isArray(event.joinRequests)) {
      event.joinRequests = event.joinRequests.filter(id => id.toString() !== userId);
    }

    // Pull the joiner into the event's group chat (private events only). The
    // share link is the access grant, so this works regardless of whether they
    // follow — or mutually follow — the host.
    await ensureEventGroupChatMember(event, userId);

    await event.save();

    // Joining via a share link — including a private-event invite link — is an
    // automatic RSVP, so issue the entry pass + email the QR.
    issueEventPass({ userId, eventId: event._id, type: "rsvp", venueChoice }).catch((e) =>
      console.error("issueEventPass (joinByShareLink) failed:", e)
    );

    invalidateCachePattern(`event_detail_${event._id}_`);
    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');

    // Let the host know someone joined via their link (best-effort).
    if (!alreadyJoined) {
      try {
        const user = await User.findById(userId).select('username');
        await Notification.create({
          user: event.createdBy,
          type: 'invite_accepted',
          title: 'New guest',
          body: `${user?.username || 'Someone'} joined "${event.title}" via your share link`,
          data: { eventId: event._id.toString() },
        });
      } catch (notifErr) {
        console.error("Notification error on share-link join:", notifErr);
      }
    }

    const updatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture')
      .populate('groupChatId', '_id name groupImage');

    res.status(200).json({
      message: "Successfully joined the event",
      event: updatedEvent
    });
  } catch (error) {
    console.error("Join event error:", error);
    res.status(500).json({ message: "Error joining event", error: error.message });
  }
};

// Join a free public event
export const joinFreePublicEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // Share links are slug-shaped, and the website hands that param straight to
    // this endpoint — an `_id`-only lookup cast-errored into a 500 for anyone
    // who arrived from a shared link.
    const event = await findEventByAnyId(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (!event.isPublic) {
      return res.status(403).json({ message: "This is a private event" });
    }

    if (event.isPaid) {
      return res.status(400).json({ message: "This is a paid event. Please purchase a ticket." });
    }

    // Joining mints a QR entry pass (issueEventPass below), so a finished event
    // has to refuse — same rule as ticket sales, different door.
    if (event.cancelledAt) {
      return res.status(400).json({ message: "This event was cancelled." });
    }
    if (isEventPast(event)) {
      return res.status(400).json({ message: "This event has ended." });
    }

    if (event.createdBy.toString() === userId) {
      return res.status(400).json({ message: "You are the creator of this event" });
    }

    if (event.invitedUsers.includes(userId)) {
      return res.status(400).json({ message: "You have already joined this event" });
    }

    // Which venue they're attending, for a multi-venue event. Changing it later
    // goes through rsvpEvent — this endpoint refuses a second join outright.
    const { choice: venueChoice, error: venueError } = resolveVenueChoice(
      event,
      req.body?.locationIndex
    );
    if (venueError) return res.status(400).json({ message: venueError });

    event.invitedUsers.push(userId);
    // Mark them as going so the event's going-count / capacity / friends-going
    // stats pick them up without a separate RSVP step.
    if (!event.rsvpUsers.some(id => id.toString() === userId)) {
      event.rsvpUsers.push(userId);
    }
    await event.save();

    // Joining a free public event is an RSVP — issue the entry pass + email QR.
    // Keyed on the resolved `_id`, never the raw param (which may be a slug).
    issueEventPass({ userId, eventId: event._id, type: "rsvp", venueChoice }).catch((e) =>
      console.error("issueEventPass (joinFreePublicEvent) failed:", e)
    );

    for (const key of [event._id, event.slug, event.shareToken].filter(Boolean)) {
      invalidateCachePattern(`event_detail_${key}_`);
    }
    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    res.status(200).json({ message: "Successfully joined the event" });
  } catch (error) {
    console.error("Join free event error:", error);
    res.status(500).json({ message: "Error joining event", error: error.message });
  }
};

// Shared by getPublicEvents for both the primary result page and the
// neighbouring-city fallback below — same ticket/RSVP shape either way so
// the client can render both sets of cards identically.
export async function attachTicketInfo(events, userId) {
  return Promise.all(
    events.map(async (event) => {
      const eventObj = event.toObject();
      // Attendee-only; fetched via the detail endpoint after joining.
      delete eventObj.meetingLink;

      // Check if current user created this event
      eventObj.isCreator = !!userId && event.createdBy._id.toString() === userId;
      if (!eventObj.isCreator) delete eventObj.pendingEdits;

      if (event.isPaid && event.maxGuests > 0) {
        const soldTickets = await Ticket.countDocuments({ event: event._id, isValid: true });
        eventObj.ticketsSold = soldTickets;
        eventObj.ticketsRemaining = event.maxGuests - soldTickets;
        // Ticket-based attendance; no phantom RSVP entries for paid events.
        eventObj.rsvpCount = soldTickets;
        eventObj.rsvpUsers = [];

        // Check if current user has already purchased a ticket
        const userTicket = userId
          ? await Ticket.findOne({ event: event._id, user: userId, isValid: true })
          : null;
        eventObj.userHasPurchased = !!userTicket;
      } else {
        // Free event - check if user has already joined (is in invitedUsers)
        const hasJoined = !!userId && event.invitedUsers.some(id => id.toString() === userId);
        eventObj.userHasPurchased = hasJoined;
      }

      // Browse cards show "N going" / "N left" — same organizer-only numbers
      // the detail screen withholds, so redact them here too. cohosts isn't
      // populated on the feed query, so compare raw ObjectIds.
      applyAttendanceVisibility(eventObj, {
        isOrganizer: eventObj.isCreator || listHasUser(event.cohosts, userId),
      });

      return eventObj;
    })
  );
}

// Below this many results for a specific city, the filter is thin enough
// that surfacing what's happening in the next-most-active nearby city is
// more useful than an empty-feeling page. Events carry no coordinates, so
// "nearby" here means the most active OTHER city in the same state/country
// (or anywhere, if the search wasn't scoped that tightly) — a proxy for
// geographic proximity, not a distance calculation.
const NEARBY_MIN_RESULTS = 5;
const NEARBY_CITY_LIMIT = 3;
const NEARBY_EVENTS_PER_CITY = 6;

async function findNearbyCityEvents({ city, state, country, blockedIds, userId }) {
  const baseMatch = {
    isPublic: true,
    isActive: true,
    isVirtual: { $ne: true },
    $and: [
      upcomingFilter(),
      { $or: [{ isPaid: { $ne: true } }, { isPaid: true, approvalStatus: "approved" }] },
    ],
    ...(blockedIds.length > 0 ? { createdBy: { $nin: blockedIds } } : {}),
  };
  // Same state first (closest proxy for "nearby"); fall back to same
  // country if no state was given; otherwise leave it unscoped rather than
  // guessing across the whole world. Applied per VENUE, not per event.
  const venueScope = state
    ? { state: exactCaseInsensitive(state) }
    : country
      ? { country: exactCaseInsensitive(country) }
      : {};

  // Every venue counts toward its own city, so an event running in two
  // nearby cities is on offer in both (same rule as eventCityFilter).
  const cityGroups = await Event.aggregate([
    { $match: baseMatch },
    {
      $project: {
        venue: {
          $concatArrays: [
            [{ city: "$city", state: "$state", country: "$country" }],
            { $ifNull: ["$additionalLocations", []] },
          ],
        },
      },
    },
    { $unwind: "$venue" },
    {
      $match: {
        "venue.city": { $exists: true, $nin: [null, ""] },
        ...Object.fromEntries(Object.entries(venueScope).map(([k, v]) => [`venue.${k}`, v])),
      },
    },
    // One count per event per city, however many of its venues share that city.
    {
      $group: {
        _id: { event: "$_id", city: { $toLower: "$venue.city" } },
        venue: { $first: "$venue" },
      },
    },
    {
      $group: {
        _id: "$_id.city",
        city: { $first: "$venue.city" },
        state: { $first: "$venue.state" },
        country: { $first: "$venue.country" },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: NEARBY_CITY_LIMIT + 1 }, // +1 in case the searched city itself tops the list
  ]);

  const target = city.trim().toLowerCase();
  const top = cityGroups.find((g) => g._id !== target);
  if (!top) return null;

  const inTopCity = { ...venueScope, city: exactCaseInsensitive(top.city) };
  const nearbyEvents = await Event.find({
    ...baseMatch,
    $and: [
      ...baseMatch.$and,
      { $or: [inTopCity, { additionalLocations: { $elemMatch: inTopCity } }] },
    ],
  })
    .populate('createdBy', 'username email profilePicture')
    .sort({ date: 1 })
    .limit(NEARBY_EVENTS_PER_CITY);

  return {
    city: top.city,
    state: top.state || null,
    country: top.country || null,
    totalThere: top.count,
    events: await attachTicketInfo(nearbyEvents, userId),
  };
}

/**
 * "This event is in `city`" — one OR-group, for `$and`. Matches the structured
 * city field, the free-text location string (legacy events created before
 * structured fields), or the city of any of the event's additional venues.
 * Every city filter on events goes through here so a venue added somewhere
 * can't be missed by one feed and found by another.
 */
function eventCityFilter(city) {
  const exact = exactCaseInsensitive(city);
  return {
    $or: [
      { city: { $regex: exact } },
      { location: { $regex: escapeRegex(city), $options: "i" } },
      { "additionalLocations.city": { $regex: exact } },
    ],
  };
}

/**
 * Build the public-event filter. Shared by getPublicEvents (the Discover feed)
 * and the unified /search endpoint so the visibility rules — paid-event
 * approval, blocked authors, virtual-event placement — can't drift apart.
 *
 * Every OR-group goes into `$and`. Assigning `query.$or` directly would mean
 * the next filter added silently clobbers the paid-approval rule, which is a
 * visibility bug, not just a search bug.
 *
 * @param {object} args
 * @param {string} [args.q]  free-text term; matched against title/description/location/city
 */
export function buildPublicEventQuery({ city, state, country, date, online, blockedIds = [], q }) {
  const onlineOnly = online === true || online === "true";

  const andConditions = [
    {
      $or: [
        { isPaid: { $ne: true } },
        { isPaid: true, approvalStatus: "approved" },
      ],
    },
  ];

  if (city && !onlineOnly) andConditions.push(eventCityFilter(city));

  // Virtual events show under the dedicated Online filter and in the
  // unfiltered feed — never under a specific place. ($ne matches legacy
  // docs where isVirtual is undefined.)
  if (onlineOnly) {
    andConditions.push({ isVirtual: true });
  } else if (city || state || country) {
    andConditions.push({ isVirtual: { $ne: true } });
  }

  // Free-text search is its own OR-group, AND-ed with everything above.
  const term = (q || "").trim();
  if (term) {
    const safe = escapeRegex(term);
    andConditions.push({
      $or: [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { location: { $regex: safe, $options: "i" } },
        { city: { $regex: safe, $options: "i" } },
        { "additionalLocations.location": { $regex: safe, $options: "i" } },
      ],
    });
  }

  // "Still upcoming", honouring an optional endDate so a multi-day event doesn't
  // drop out of the feed the moment it starts. It's an OR-group, so it goes in
  // $and like every other one. Skipped when the caller named a specific day —
  // picking a date is the user saying which day they mean, past or future.
  if (!date) andConditions.push(upcomingFilter());

  const query = {
    isPublic: true,
    isActive: true,
    ...(state && !onlineOnly ? { state: { $regex: exactCaseInsensitive(state) } } : {}),
    ...(country && !onlineOnly ? { country: { $regex: exactCaseInsensitive(country) } } : {}),
    ...(blockedIds.length > 0 ? { createdBy: { $nin: blockedIds } } : {}),
    $and: andConditions,
  };

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.date = { $gte: startOfDay, $lte: endOfDay };
  }

  return query;
}

// Get public events for exploration
export const getPublicEvents = async (req, res) => {
  try {
    const { limit = 20, page = 1, city, state, country, date, sort, online, q } = req.query;
    // optionalAuth — userId is null for logged-out (guest) browsers.
    const userId = req.user?.id || null;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const onlineOnly = online === "true";
    const term = (q || "").trim();

    // Searched requests are NOT cached: utils/cache.js is an unbounded Map with
    // no eviction, so caching the per-keystroke keyspace at a 2-minute TTL grows
    // memory without bound. `q` is still in the key so that if this ever does
    // cache, a searched request can never collide with the unsearched feed.
    const cacheKey = `public_events_${userId || 'guest'}_${page}_${limit}_${city || ''}_${state || ''}_${country || ''}_${date || ''}_${onlineOnly ? 'online' : ''}_${term}`;
    if (!term) {
      const cached = getCache(cacheKey);
      if (cached) return res.status(200).json(cached);
    }

    const blockedIds = userId ? await getBlockedIds(userId) : [];

    const query = buildPublicEventQuery({
      city, state, country, date, online: onlineOnly, blockedIds, q: term,
    });

    const total = await Event.countDocuments(query);

    const events = await Event.find(query)
      .populate('createdBy', 'username email profilePicture')
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const eventsWithTicketInfo = await attachTicketInfo(events, userId);

    // Thin results for a specific city? Surface the next-most-active nearby
    // city instead of leaving the page feeling empty. Only worth the extra
    // queries on page 1 — a "load more" call already knows the feed is real.
    // Skipped for searches: "nothing here, try Austin" is a nonsensical reply to
    // a text query, and it costs two extra queries per keystroke.
    let nearby = null;
    if (city && !onlineOnly && !term && parseInt(page) === 1 && total < NEARBY_MIN_RESULTS) {
      nearby = await findNearbyCityEvents({ city, state, country, blockedIds, userId });
    }

    const result = { events: eventsWithTicketInfo, total, page: parseInt(page), nearby };
    if (!term) setCache(cacheKey, result, 120); // 2 min TTL
    res.status(200).json(result);
  } catch (error) {
    console.error("Get public events error:", error);
    res.status(500).json({ message: "Error fetching public events", error: error.message });
  }
};

/**
 * GET /events/:eventId/similar
 * "You may also like" — other upcoming public events in the same place.
 *
 * Reuses buildPublicEventQuery so the visibility rules (public, active, future,
 * paid-and-approved) can never drift from the main discovery feed. Falls back to
 * the wider state/country when the source event's city has nothing else on,
 * rather than returning an empty rail.
 */
export async function getSimilarEvents(req, res) {
  try {
    const { eventId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 20);
    // optionalAuth — null for logged-out viewers arriving on a share link.
    const userId = req.user?.id || null;

    // The param may be a slug or shareToken, not just an ObjectId.
    const source = await findEventByAnyId(eventId);
    if (!source) return res.status(404).json({ message: "Event not found" });

    const blockedIds = userId ? await getBlockedIds(userId) : [];

    const findNearby = async (scope) => {
      const query = buildPublicEventQuery({ ...scope, blockedIds });
      query._id = { $ne: source._id };
      return Event.find(query)
        .populate("createdBy", "username email profilePicture")
        .sort({ date: 1 })
        .limit(limit);
    };

    let events = await findNearby({
      city: source.city,
      state: source.state,
      country: source.country,
    });
    if (events.length === 0 && (source.state || source.country)) {
      events = await findNearby({ state: source.state, country: source.country });
    }

    res.status(200).json({ events: await attachTicketInfo(events, userId) });
  } catch (error) {
    console.error("Get similar events error:", error);
    res.status(500).json({ message: "Error fetching similar events" });
  }
}

// Get user's purchased tickets
export const getUserTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const tickets = await Ticket.find({ user: userId, isValid: true })
      .populate({
        path: 'event',
        populate: {
          path: 'createdBy',
          select: 'username email profilePicture'
        }
      })
      .sort({ purchaseDate: -1 });

    res.status(200).json({ tickets });
  } catch (error) {
    console.error("Get user tickets error:", error);
    res.status(500).json({ message: "Error fetching tickets", error: error.message });
  }
};

// RSVP to an event (going / not_going)
export const rsvpEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, locationIndex, subEvents: subEventIds } = req.body;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const isCreator = event.createdBy.toString() === userId;
    const isInvited = event.invitedUsers.some(id => id.toString() === userId);
    const isTicketHolder = await Ticket.findOne({ event: eventId, user: userId, isValid: true });

    // Two shapes on one endpoint:
    //  - `subEvents` present: the AUTHORITATIVE set of stops (main = null) the
    //    guest wants — a checkbox list, resent in full on every change. Gated
    //    on the event being PUBLIC, not on it being free: a programme can price
    //    its main event while leaving a stop free, and anyone should be able to
    //    join that free stop the same way joinFreePublicEvent always allowed. The
    //    real money gate is the priced-stop rejection inside the function itself.
    //  - otherwise: the original single-stop `status` toggle, unchanged, for
    //    events with no programme and for clients that predate this feature.
    if (Array.isArray(subEventIds)) {
      if (!isCreator && !isInvited && !isTicketHolder && !event.isPublic) {
        return res.status(403).json({ message: "You must be invited to RSVP" });
      }
      return reconcileStopRsvp({ res, event, userId, isCreator, subEventIds });
    }

    // Must be invited (or creator) to RSVP
    const isFreePublic = event.isPublic && !event.isPaid;
    if (!isCreator && !isInvited && !isTicketHolder && !isFreePublic) {
      return res.status(403).json({ message: "You must be invited to RSVP" });
    }

    if (!["going", "not_going"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'going' or 'not_going'" });
    }

    // Which venue they're attending, for a multi-venue event. Re-sending the
    // RSVP with a different index moves their pass, so this doubles as "change
    // where I'm going" without a separate endpoint.
    const { choice: venueChoice, error: venueError } = resolveVenueChoice(event, locationIndex);
    if (venueError) return res.status(400).json({ message: venueError });

    const alreadyRsvp = event.rsvpUsers.some(id => id.toString() === userId);

    // "going" issues an entry pass, so it can't be set after the event is over.
    // Withdrawing ("not_going") stays allowed — tidying up your own list after
    // the fact harms nobody.
    if (status === "going" && !alreadyRsvp && isEventPast(event)) {
      return res.status(400).json({ message: "This event has ended." });
    }

    if (status === "going") {
      if (!alreadyRsvp) event.rsvpUsers.push(userId);
    } else {
      event.rsvpUsers = event.rsvpUsers.filter(id => id.toString() !== userId);
    }

    await event.save();

    // Issue an attendance pass + email the QR when marking "going". Idempotent,
    // fire-and-forget — re-RSVPing won't re-send. (Ticket holders already got a
    // pass at purchase; issueEventPass dedupes per event+user.)
    if (status === "going") {
      issueEventPass({ userId, eventId, type: "rsvp", venueChoice }).catch((e) =>
        console.error("issueEventPass (rsvp) failed:", e)
      );
    }
    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    invalidateCachePattern(`event_detail_${eventId}_`);
    // rsvpCount is echoed back so the organizer's view updates without a
    // refetch — but it's the same headcount applyAttendanceVisibility hides, so
    // plain guests only learn that their own RSVP landed.
    const isOrganizer = isCreator || listHasUser(event.cohosts, userId);
    res.json({
      message: status === "going" ? "You're marked as going!" : "RSVP removed",
      userRsvp: status === "going",
      // Echoed so the screen can show which venue it landed on without waiting
      // for the fire-and-forget pass write above.
      userLocationIndex: status === "going" ? venueChoice?.locationIndex ?? null : null,
      ...(isOrganizer ? { rsvpCount: event.rsvpUsers.length } : {}),
    });
  } catch (error) {
    console.error("RSVP error:", error);
    res.status(500).json({ message: "Error updating RSVP", error: error.message });
  }
};

/**
 * POST /events/:eventId/rsvp   body: { subEvents: (string|null)[] }
 *
 * The multi-select RSVP for a programme: `subEvents` is the guest's full,
 * authoritative pick — main event as `null` alongside any sub-event ids — sent
 * fresh every time the checkbox list changes. This function issues passes for
 * newly-ticked stops and deletes them for unticked ones; it never partially
 * applies a change.
 *
 * A PRICED stop can never be granted here — that would be a free ticket. The
 * client is expected to route a selection containing any priced stop to
 * checkout instead (see initTicketBatch); this is the server-side backstop for
 * that rule, not merely a client convenience.
 */
async function reconcileStopRsvp({ res, event, userId, isCreator, subEventIds }) {
  // De-dupe: "" and null and undefined all mean the main event.
  const wantedKeys = [...new Set(subEventIds.map((id) => (id ? String(id) : null)))];

  const wanted = [];
  for (const key of wantedKeys) {
    const stop = findStop(event, key);
    if (!stop) {
      return res.status(400).json({ message: "One of the selected stops doesn't exist on this event." });
    }
    wanted.push({ key, stop });
  }

  const priced = wanted.filter(({ stop }) => stopRequiresPayment(event, stop));
  if (priced.length) {
    return res.status(400).json({
      message: `${priced.map((p) => `"${p.stop.title}"`).join(", ")} ${
        priced.length === 1 ? "requires" : "require"
      } a ticket — buy ${priced.length === 1 ? "it" : "them"} instead of RSVPing.`,
    });
  }

  const existingPasses = await Attendance.find({ event: event._id, user: userId, type: "rsvp" }).select(
    "subEvent"
  );
  const existingKeys = existingPasses.map((p) => (p.subEvent != null ? String(p.subEvent) : null));
  const wantedKeySet = new Set(wantedKeys);

  const toAdd = wanted.filter(({ key }) => !existingKeys.includes(key));
  const toRemove = existingKeys.filter((key) => !wantedKeySet.has(key));

  // A stop's own end blocks JOINING it, same rule as the single-stop path
  // above — withdrawing from a finished stop stays allowed regardless.
  for (const { key, stop } of toAdd) {
    const endsAt = stopEndsAt(stop);
    if (endsAt && Date.now() > endsAt.getTime()) {
      return res.status(400).json({ message: `"${stop.title}" has already happened.` });
    }
  }

  // Per-stop capacity (D3): only a stop with its own cap enforces one, counted
  // in PASSES — one pass is one body at one door, same rule buildEventSignups
  // uses. The main stop's `maxGuests` is 0 on every free event, so this is a
  // no-op there, matching the existing (uncapped) free-RSVP behavior.
  for (const { key, stop } of toAdd) {
    if (stop.maxGuests > 0) {
      const count = await Attendance.countDocuments({
        event: event._id,
        subEvent: key,
        type: { $in: ["rsvp", "ticket"] },
      });
      if (count >= stop.maxGuests) {
        return res.status(400).json({ message: `"${stop.title}" is full.` });
      }
    }
  }

  await Promise.all(
    toAdd.map(({ key, stop }) =>
      issueEventPass({
        userId,
        eventId: event._id,
        type: "rsvp",
        subEvent: key,
        subEventTitle: key ? stop.title : undefined,
        subEventDate: key ? stop.date : undefined,
      })
    )
  );
  if (toRemove.length) {
    await Attendance.deleteMany({
      event: event._id,
      user: userId,
      type: "rsvp",
      subEvent: { $in: toRemove },
    });
  }

  // event.rsvpUsers tracks "attending ANY part of this event" — the same
  // aggregate every capacity/friends-going stat already reads.
  const stillGoing = wanted.length > 0;
  const alreadyListed = event.rsvpUsers.some((id) => id.toString() === userId);
  if (stillGoing && !alreadyListed) {
    event.rsvpUsers.push(userId);
    await event.save();
  } else if (!stillGoing && alreadyListed) {
    event.rsvpUsers = event.rsvpUsers.filter((id) => id.toString() !== userId);
    await event.save();
  }

  invalidateCachePattern("public_events_");
  invalidateCachePattern("event_highlights_");
  invalidateCachePattern(`event_detail_${event._id}_`);

  const isOrganizer = isCreator || listHasUser(event.cohosts, userId);
  res.json({
    message: stillGoing ? "You're marked as going!" : "RSVP removed",
    userRsvp: stillGoing,
    userSubEvents: wantedKeys,
    ...(isOrganizer ? { rsvpCount: event.rsvpUsers.length } : {}),
  });
}

// Get ticket sales for an event (organizer only)
export const getEventTicketSales = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only the creator can view ticket sales
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to view ticket sales" });
    }

    const soldTickets = await Ticket.countDocuments({ event: eventId, isValid: true });
    const ticketsRemaining = event.maxGuests - soldTickets;

    const tickets = await Ticket.find({ event: eventId, isValid: true })
      .populate('user', 'username email profilePicture')
      .sort({ purchaseDate: -1 });

    // Per-stop breakdown for a programme event — allStops() puts the main
    // event first (id null) so a plain, non-programme event still gets a
    // single-entry list here rather than the client needing two code paths.
    // sold/remaining are computed from the ticket list just fetched, not a
    // second query, since every ticket already carries which stop it's for.
    const stops = allStops(event).map((stop) => {
      const sold = tickets.filter((t) => (t.subEvent ? String(t.subEvent) : null) === stop.id).length;
      return {
        id: stop.id,
        title: stop.title,
        date: stop.date,
        ticketPrice: stop.ticketPrice,
        ticketTiers: stop.ticketTiers,
        maxGuests: stop.maxGuests,
        ticketSalesClosedAt: stop.ticketSalesClosedAt,
        sold,
        remaining: stop.maxGuests > 0 ? Math.max(stop.maxGuests - sold, 0) : null,
      };
    });

    res.status(200).json({
      ticketsSold: soldTickets,
      ticketsRemaining,
      maxGuests: event.maxGuests,
      ticketPrice: event.ticketPrice,
      ticketTiers: event.ticketTiers || [],
      // Sum what each ticket actually sold for — amountPaid reflects discount
      // codes; legacy tickets predate it and keep counting face price. With
      // tiers (and legacy price edits) tickets in the same event carry
      // different prices.
      totalRevenue: tickets.reduce((sum, t) => sum + (t.amountPaid ?? t.ticketPrice ?? 0), 0),
      stops,
      tickets
    });
  } catch (error) {
    console.error("Get event ticket sales error:", error);
    res.status(500).json({ message: "Error fetching ticket sales", error: error.message });
  }
};

// Get event highlights: trending (most RSVPs) + upcoming (next 7 days)
export const getEventHighlights = async (req, res) => {
  try {
    // optionalAuth — userId is null for logged-out (guest) browsers.
    const userId = req.user?.id || null;
    const { city } = req.query;

    const cacheKey = `event_highlights_${userId || 'guest'}_${city || ''}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const publicFilter = {
      isPublic: true,
      isActive: true,
      $or: [
        { isPaid: { $ne: true } },
        { isPaid: true, approvalStatus: "approved" },
      ],
    };

    // Trending/upcoming should reflect the home feed's currently selected
    // city, same matching rule as getPublicEvents (eventCityFilter), with
    // virtual events excluded since they don't belong to any one place.
    if (city) {
      publicFilter.$and = [eventCityFilter(city), { isVirtual: { $ne: true } }];
    }

    // "Not over yet" is an OR-group (it has to allow for an optional endDate),
    // so it merges into $and rather than being spread alongside publicFilter's
    // own $or / $and — a bare spread would clobber the city clause above.
    const stillOn = (extra = []) => ({
      ...publicFilter,
      $and: [...(publicFilter.$and || []), upcomingFilter(now), ...extra],
    });

    const [trendingRaw, upcoming] = await Promise.all([
      Event.find(stillOn())
        .populate('createdBy', 'username email profilePicture')
        .sort({ date: 1 })
        .limit(20),
      // Starting within the week — an event already under way still counts.
      Event.find(stillOn([{ date: { $lte: sevenDaysFromNow } }]))
        .populate('createdBy', 'username email profilePicture')
        .sort({ date: 1 })
        .limit(5),
    ]);

    const trending = [...trendingRaw]
      .sort((a, b) => (b.rsvpUsers?.length || 0) - (a.rsvpUsers?.length || 0))
      .slice(0, 5);

    const enrichEvent = async (event) => {
      const obj = event.toObject();
      // Attendee-only; fetched via the detail endpoint after joining.
      delete obj.meetingLink;
      obj.isCreator = !!userId && event.createdBy._id.toString() === userId;
      if (!obj.isCreator) delete obj.pendingEdits;
      obj.rsvpCount = event.rsvpUsers?.length || 0;
      if (event.isPaid && event.maxGuests > 0) {
        const sold = await Ticket.countDocuments({ event: event._id, isValid: true });
        obj.ticketsSold = sold;
        obj.ticketsRemaining = event.maxGuests - sold;
        // Ticket-based attendance; no phantom RSVP entries for paid events.
        obj.rsvpCount = sold;
        obj.rsvpUsers = [];
        const userTicket = userId
          ? await Ticket.findOne({ event: event._id, user: userId, isValid: true })
          : null;
        obj.userHasPurchased = !!userTicket;
      } else {
        obj.userHasPurchased = !!userId && event.invitedUsers.some(id => id.toString() === userId);
      }

      // Same organizer-only rule as the browse feed — highlight cards render
      // the identical "N going" badge.
      applyAttendanceVisibility(obj, {
        isOrganizer: obj.isCreator || listHasUser(event.cohosts, userId),
      });

      return obj;
    };

    // The user's OWN upcoming events — hosting, RSVP'd, or paid for — soonest
    // first. Drives the home hero so a user always sees their next commitment
    // before generic discovery content. `rsvpUsers` already includes ticket
    // buyers and accepted-invite guests; we also union in any valid-ticket
    // events defensively (covers tickets issued before that behavior existed).
    const myTickets = userId
      ? await Ticket.find({ user: userId, isValid: true }).select("event").lean()
      : [];
    const myTicketEventIds = myTickets.map((t) => t.event);

    // Guests have no "your upcoming events" — skip the user-specific query.
    // Same city rule as trending/upcoming above: when a city is selected, the
    // hero must never promote a commitment outside it, so it gets the exact
    // same $and city clause rather than being left unfiltered.
    const myUpcomingFilter = {
      isActive: true,
      // Not over yet — into $and, since this filter already owns its $or.
      $and: [upcomingFilter(now)],
      $or: [
        { createdBy: userId },
        { rsvpUsers: userId },
        { _id: { $in: myTicketEventIds } },
      ],
    };
    if (city) {
      myUpcomingFilter.$and.push(eventCityFilter(city), { isVirtual: { $ne: true } });
    }
    const myUpcoming = userId
      ? await Event.find(myUpcomingFilter)
          .populate("createdBy", "username email profilePicture")
          .sort({ date: 1 })
          .limit(5)
      : [];

    // Enrich + set userStatus so the hero label ("You are hosting / attending /
    // have a ticket for") renders correctly.
    const enrichMine = async (event) => {
      const obj = await enrichEvent(event);
      const inRsvp = event.rsvpUsers?.some((id) => id.toString() === userId);
      if (obj.isCreator) {
        obj.userStatus = "creator";
      } else if (event.isPaid) {
        obj.userStatus = obj.userHasPurchased || inRsvp ? "accepted" : "none";
      } else {
        // Free event the user joined/RSVP'd — not a paid ticket.
        obj.userHasPurchased = false;
        obj.userStatus = inRsvp ? "accepted" : "none";
      }
      return obj;
    };

    const [trendingEnriched, upcomingEnriched, myUpcomingEnriched] = await Promise.all([
      Promise.all(trending.map(enrichEvent)),
      Promise.all(upcoming.map(enrichEvent)),
      Promise.all(myUpcoming.map(enrichMine)),
    ]);

    const result = {
      trending: trendingEnriched,
      upcoming: upcomingEnriched,
      myUpcoming: myUpcomingEnriched,
    };
    setCache(cacheKey, result, 120); // 2 min TTL
    res.status(200).json(result);
  } catch (error) {
    console.error("Get event highlights error:", error);
    res.status(500).json({ message: "Error fetching highlights", error: error.message });
  }
};

// Add a vendor to an event (creator only)
export const addVendorToEvent = async (req, res) => {
  try {
    const { eventId, vendorId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    const isCohost = (event.cohosts || []).some(c => c.toString() === userId);
    if (event.createdBy.toString() !== userId && !isCohost) {
      return res.status(403).json({ message: "Only the event creator or co-hosts can add vendors" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    if (event.vendors.some(v => v.toString() === vendorId)) {
      return res.status(400).json({ message: "Vendor already added to this event" });
    }

    // A vendor with a linked user account gets an invite they must accept; a
    // vendor with no account can't respond, so it's added to the bill directly.
    if (vendor.user) {
      const existingInvite = event.vendorInvites.find(
        (vi) => vi.vendor.toString() === vendorId
      );
      if (existingInvite && existingInvite.status === "pending") {
        return res.status(400).json({ message: "Vendor already invited" });
      }
      if (existingInvite) {
        existingInvite.status = "pending";
        existingInvite.invitedAt = new Date();
        existingInvite.respondedAt = undefined;
      } else {
        event.vendorInvites.push({ vendor: vendorId, status: "pending" });
      }
      await event.save();

      try {
        const inviter = await User.findById(userId).select("username");
        await Notification.create({
          user: vendor.user,
          type: "vendor_invite",
          title: "Vendor Invitation",
          body: `${inviter?.username || "An organizer"} invited ${vendor.name} to "${event.title}"`,
          data: { eventId: event._id.toString(), vendorId: vendor._id.toString() },
        });
        emitEventInvite(vendor.user.toString(), {
          eventId: event._id.toString(),
          kind: "vendor_invite",
        });
      } catch (notifyErr) {
        console.error("Vendor invite notification failed:", notifyErr);
      }

      invalidateCachePattern(`event_detail_${eventId}_`);
      return res.status(200).json({ message: "Vendor invited", status: "pending" });
    }

    event.vendors.push(vendorId);
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: "Vendor added to event", status: "accepted" });
  } catch (error) {
    console.error("Add vendor to event error:", error);
    res.status(500).json({ message: "Failed to add vendor" });
  }
};

// Vendor (the linked user) accepts or declines an event invite
export const respondToVendorInvite = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.body; // "accepted" | "declined"
    const userId = req.user.id;

    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'accepted' or 'declined'" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Find which of the event's pending vendor invites belongs to a vendor the
    // requesting user owns.
    const myVendors = await Vendor.find({ user: userId }).select("_id name");
    const myVendorIds = myVendors.map((v) => v._id.toString());

    const invite = event.vendorInvites.find(
      (vi) => myVendorIds.includes(vi.vendor.toString()) && vi.status === "pending"
    );
    if (!invite) {
      return res.status(404).json({ message: "No pending invite for your vendor on this event" });
    }

    invite.status = status;
    invite.respondedAt = new Date();

    if (status === "accepted" && !event.vendors.some((v) => v.toString() === invite.vendor.toString())) {
      event.vendors.push(invite.vendor);
    }
    await event.save();

    // Let the organizer know how the vendor responded.
    try {
      const vendor = myVendors.find((v) => v._id.toString() === invite.vendor.toString());
      await Notification.create({
        user: event.createdBy,
        type: "vendor_invite_response",
        title: status === "accepted" ? "Vendor accepted" : "Vendor declined",
        body: `${vendor?.name || "A vendor"} ${status} your invite to "${event.title}"`,
        data: { eventId: event._id.toString() },
      });
      emitEventInvite(event.createdBy.toString(), {
        eventId: event._id.toString(),
        kind: "vendor_invite_response",
      });
    } catch (notifyErr) {
      console.error("Vendor invite response notification failed:", notifyErr);
    }

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: `Invite ${status}`, status });
  } catch (error) {
    console.error("Respond to vendor invite error:", error);
    res.status(500).json({ message: "Failed to respond to invite" });
  }
};

// List pending event invites for the requesting user's vendor(s)
export const getMyVendorEventInvites = async (req, res) => {
  try {
    const userId = req.user.id;
    const myVendors = await Vendor.find({ user: userId }).select("_id");
    if (myVendors.length === 0) return res.status(200).json({ invites: [] });
    const myVendorIds = myVendors.map((v) => v._id.toString());

    const events = await Event.find({
      vendorInvites: { $elemMatch: { vendor: { $in: myVendors.map((v) => v._id) }, status: "pending" } },
    })
      .populate("createdBy", "username profilePicture")
      .sort({ date: 1 });

    const invites = events.map((ev) => {
      const mine = ev.vendorInvites.find(
        (vi) => myVendorIds.includes(vi.vendor.toString()) && vi.status === "pending"
      );
      return {
        eventId: ev._id,
        title: ev.title,
        date: ev.date,
        location: ev.location,
        image: ev.image,
        createdBy: ev.createdBy,
        vendorId: mine?.vendor,
        invitedAt: mine?.invitedAt,
      };
    });

    res.status(200).json({ invites });
  } catch (error) {
    console.error("Get vendor event invites error:", error);
    res.status(500).json({ message: "Failed to fetch invites" });
  }
};

// Remove a vendor from an event (creator only) — covers both an already
// -accepted vendor and one with only a pending/declined invite, so this one
// endpoint is the organizer's single "un-vendor" action regardless of where
// that vendor was in the invite lifecycle.
export const removeVendorFromEvent = async (req, res) => {
  try {
    const { eventId, vendorId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Only the event creator can remove vendors" });
    }

    const wasAccepted = event.vendors.some(v => v.toString() === vendorId);
    const hadInvite = event.vendorInvites.some(vi => vi.vendor.toString() === vendorId);
    if (!wasAccepted && !hadInvite) {
      return res.status(404).json({ message: "This vendor isn't on the event" });
    }

    event.vendors = event.vendors.filter(v => v.toString() !== vendorId);
    event.vendorInvites = event.vendorInvites.filter(vi => vi.vendor.toString() !== vendorId);
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: "Vendor removed from event" });
  } catch (error) {
    console.error("Remove vendor from event error:", error);
    res.status(500).json({ message: "Failed to remove vendor" });
  }
};

// Add a co-host to an event (creator only)
export const addCohost = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { username } = req.body;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Only the event creator can add co-hosts" });
    }

    const target = await User.findOne({ username: exactCaseInsensitive(username) }).select('_id username profilePicture');
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target._id.toString() === userId) {
      return res.status(400).json({ message: "You are already the creator" });
    }
    if ((event.cohosts || []).some(c => c.toString() === target._id.toString())) {
      return res.status(400).json({ message: "User is already a co-host" });
    }

    event.cohosts = event.cohosts || [];
    event.cohosts.push(target._id);
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: "Co-host added", cohost: target });
  } catch (error) {
    console.error("Add cohost error:", error);
    res.status(500).json({ message: "Failed to add co-host" });
  }
};

// Remove a co-host from an event (creator only)
export const removeCohost = async (req, res) => {
  try {
    const { eventId, cohostId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Only the event creator can remove co-hosts" });
    }

    event.cohosts = (event.cohosts || []).filter(c => c.toString() !== cohostId);
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: "Co-host removed" });
  } catch (error) {
    console.error("Remove cohost error:", error);
    res.status(500).json({ message: "Failed to remove co-host" });
  }
};

// Get an event's discount codes (creator only). Codes are created by CityVibe
// admins; the creator can only view them and flip `disabledByCreator`.
export const getEventDiscountCodes = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await findEventByAnyId(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only the creator can view discount codes
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to view discount codes" });
    }

    const codes = await DiscountCode.find({ event: event._id }).sort({ createdAt: -1 });

    res.status(200).json({ codes });
  } catch (error) {
    console.error("Get event discount codes error:", error);
    res.status(500).json({ message: "Error fetching discount codes", error: error.message });
  }
};

// Toggle a discount code's `disabledByCreator` flag (creator only). This flag
// is independent of the admin's `isActive` kill switch — a code is usable only
// when both allow it — so creators can flip theirs regardless of `isActive`.
export const toggleEventDiscountCodeByCreator = async (req, res) => {
  try {
    const { eventId, codeId } = req.params;
    const userId = req.user.id;

    const event = await findEventByAnyId(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only the creator can toggle discount codes
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to manage discount codes" });
    }

    const code = mongoose.isValidObjectId(codeId)
      ? await DiscountCode.findOne({ _id: codeId, event: event._id })
      : null;
    if (!code) {
      return res.status(404).json({ message: "Discount code not found" });
    }

    code.disabledByCreator = !code.disabledByCreator;
    await code.save();

    res.status(200).json({ disabledByCreator: code.disabledByCreator });
  } catch (error) {
    console.error("Toggle discount code error:", error);
    res.status(500).json({ message: "Error updating discount code", error: error.message });
  }
};

export const rateEvent = async (req, res) => {
  try {
    const event = await findEventByAnyId(req.params.eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const rating = Number(req.body.rating);
    const review = typeof req.body.review === "string" ? req.body.review.trim() : "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }
    if (review.length > 500) return res.status(400).json({ message: "Review cannot exceed 500 characters" });
    if (!(await canUserReviewEvent(event, req.user.id))) {
      return res.status(403).json({ message: "You can rate an event after accepting or joining it." });
    }

    await EventReview.findOneAndUpdate(
      { event: event._id, user: req.user.id },
      { rating, review },
      { upsert: true, new: true, runValidators: true }
    );
    const [summary] = await EventReview.aggregate([
      { $match: { event: event._id } },
      { $group: { _id: null, average: { $avg: "$rating" } } },
    ]);
    const average = summary ? Math.round(summary.average * 10) / 10 : 0;
    await Event.findByIdAndUpdate(event._id, { rating: average });
    invalidateCachePattern(`event_detail_${event._id}_`);
    res.json({ rating: average });
  } catch (error) {
    res.status(500).json({ message: "Failed to save event rating" });
  }
};

export const getEventReviews = async (req, res) => {
  try {
    const event = await findEventByAnyId(req.params.eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const [reviews, total, userReview, canReview] = await Promise.all([
      EventReview.find({ event: event._id })
        .populate("user", "username profilePicture")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      EventReview.countDocuments({ event: event._id }),
      EventReview.findOne({ event: event._id, user: req.user.id }),
      canUserReviewEvent(event, req.user.id),
    ]);
    res.json({ reviews, total, userReview, canReview });
  } catch (error) {
    res.status(500).json({ message: "Failed to load event reviews" });
  }
};
