import mongoose from "mongoose";
import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
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
import { exactCaseInsensitive } from "../utils/escapeRegex.js";
import { issueEventPass } from "../services/pass.service.js";
import config from "../config/env.js";

// Create a new event
export const createEvent = async (req, res) => {
  try {
    const {
      title,
      date,
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
      maxGuests,
      venueProofImage,
    } = req.body;
    const userId = req.user.id;

    if (!title || !date || !location) {
      return res.status(400).json({ message: "Title, date, and location are required" });
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

    // Validate pricing options for public paid events
    if (isPublic && isPaid) {
      if (!ticketPrice || ticketPrice <= 0) {
        return res.status(400).json({ message: "Ticket price must be greater than 0 for paid events" });
      }
      if (!maxGuests || maxGuests <= 0) {
        return res.status(400).json({ message: "Max guests must be specified for paid events" });
      }
      if (!venueProofImage) {
        return res.status(400).json({
          message: "A photo of your venue booking (confirmation, contract, or reservation) is required for paid events.",
        });
      }

      // Trust gates for sellers: must have verified their email AND submitted ID
      // AND completed Stripe Connect onboarding (so ticket revenue has a payout
      // destination). Without the Stripe gate, the failure surfaces to the
      // *buyer* at checkout time — which is the wrong layer to fail on.
      const organizer = await User.findById(userId).select(
        "verified paidEventsApproved paidEventsCount emailVerifiedAt stripeAccountId stripeOnboardingComplete"
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
      if (!organizer?.stripeAccountId || !organizer?.stripeOnboardingComplete) {
        return res.status(403).json({
          message:
            "Connect your payout account before selling tickets. Open Settings → Payouts to finish Stripe onboarding.",
          code: "payout_setup_required",
        });
      }

      // New-organizer caps — until the user has had `newOrganizerThreshold`
      // approved paid events, ticket price and guest count are capped.
      const isNewOrganizer =
        (organizer.paidEventsCount || 0) < config.trust.newOrganizerThreshold;
      if (isNewOrganizer) {
        if (ticketPrice > config.trust.newOrganizerMaxTicketPriceUsd) {
          return res.status(400).json({
            message: `New organizers can charge up to $${config.trust.newOrganizerMaxTicketPriceUsd} per ticket. This cap is removed after ${config.trust.newOrganizerThreshold} successful paid events.`,
          });
        }
        if (maxGuests > config.trust.newOrganizerMaxGuests) {
          return res.status(400).json({
            message: `New organizers can host up to ${config.trust.newOrganizerMaxGuests} ticketed guests per event. This cap is removed after ${config.trust.newOrganizerThreshold} successful paid events.`,
          });
        }
      }
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

    // Paid-event approval gate (Model C): every organizer's first paid event
    // still goes through the admin queue, even if they're identity-verified.
    // The verification gate above ensures only verified users can submit;
    // this gate ensures the actual event content is reviewed once before
    // any tickets sell.
    let approvalStatus = "approved";
    if (isPublic && isPaid) {
      const organizer = await User.findById(userId).select("paidEventsApproved");
      if (!organizer?.paidEventsApproved) {
        approvalStatus = "pending";
      }
    }

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
      location,
      address: address || "",
      city: city || "",
      state: state || "",
      country: country || "",
      image: eventImageUrl,
      images: gallery,
      description: description || "",
      createdBy: userId,
      isPublic: isPublic || false,
      isPaid: isPublic && isPaid ? isPaid : false,
      ticketPrice: isPublic && isPaid ? ticketPrice : 0,
      maxGuests: isPublic && isPaid ? maxGuests : 0,
      venueProofImage: venueProofUrl,
      approvalStatus,
      payoutStatus: isPublic && isPaid ? "pending" : "none",
    });

    await event.save();

    const populatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    res.status(201).json({
      message: "Event created successfully",
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
    const { title, date, location, address, city, state, country, image, description } = req.body;

    if (!title || !date || !location) {
      return res.status(400).json({ message: "Title, date, and location are required" });
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
      location,
      address: address || "",
      city: city || "",
      state: state || "",
      country: country || "",
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

    const query = {
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
        if (event.isPublic && event.isPaid && event.maxGuests > 0) {
          const soldTickets = await Ticket.countDocuments({ event: event._id, isValid: true });
          eventObj.ticketsSold = soldTickets;
          eventObj.ticketsRemaining = event.maxGuests - soldTickets;
        }
        eventObj.rsvpCount = event.rsvpUsers ? event.rsvpUsers.length : 0;
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
      ['createdBy', 'username email profilePicture verified stripeAccountId stripeOnboardingComplete'],
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
    const isInvited = !!userId && event.invitedUsers.some(u => u._id.toString() === userId);
    const isPending = !!userId && event.pendingInvites.some(u => u._id.toString() === userId);
    const hasRequested = !!userId && (event.joinRequests || []).some(u => u._id.toString() === userId);
    const userTicket = userId
      ? await Ticket.findOne({ event: eventId, user: userId, isValid: true })
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
        await Event.updateOne({ _id: eventId }, { $addToSet: { viewedBy: userId } });
        seenCount += 1;
      }
    }

    const eventObj = event.toObject();
    eventObj.seenCount = seenCount;
    delete eventObj.viewedBy; // don't leak the viewer list
    eventObj.userRsvp = !!userId && event.rsvpUsers.some(u => u._id.toString() === userId);
    eventObj.rsvpCount = event.rsvpUsers.length;

    // Surface ticket info for paid events so the client can render the right CTA
    if (event.isPaid) {
      const ticketsSold = await Ticket.countDocuments({ event: eventId, isValid: true });
      eventObj.ticketsSold = ticketsSold;
      eventObj.ticketsRemaining = Math.max(event.maxGuests - ticketsSold, 0);
      eventObj.userHasPurchased = hasTicket;
    }

    // Tell the client what this user's relationship to the event is
    if (isCreator) eventObj.userStatus = 'creator';
    else if (isInvited) eventObj.userStatus = 'accepted';
    else if (isPending) eventObj.userStatus = 'pending';
    else if (hasRequested) eventObj.userStatus = 'requested';
    else eventObj.userStatus = 'none';

    // Derived: mutuals on the guest list. Powers the "FRIENDS · N going" stat
    // and the "N friends" span on the attendees card. Anon viewers see 0.
    const rsvpIdStrings = event.rsvpUsers.map(u => u._id.toString());
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
    // approval gate AND the organizer's Stripe Connect status into one flag so
    // the client can show a graceful "tickets not on sale yet" state instead
    // of letting the user tap "Buy" and bounce off a Stripe error.
    if (event.isPaid) {
      const seller = event.createdBy;
      eventObj.ticketingReady =
        event.approvalStatus === "approved" &&
        !!seller?.stripeAccountId &&
        !!seller?.stripeOnboardingComplete;
    } else {
      eventObj.ticketingReady = true;
    }

    // Never leak the organizer's Stripe IDs to the client.
    if (eventObj.createdBy) {
      delete eventObj.createdBy.stripeAccountId;
      delete eventObj.createdBy.stripeOnboardingComplete;
    }

    // For anon viewers, strip lists that could leak who's been invited.
    if (!userId) {
      delete eventObj.invitedUsers;
      delete eventObj.pendingInvites;
      delete eventObj.joinRequests;
    }

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

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.isActive === false) {
      return res.status(410).json({ message: "This event is no longer available" });
    }

    res.status(200).json({ event });
  } catch (error) {
    console.error("Get event by token error:", error);
    res.status(500).json({ message: "Error fetching event", error: error.message });
  }
};

// Update an event
export const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { title, date, location, address, city, state, country, image, images, description, isPublic } = req.body;
    const userId = req.user.id;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only the creator can update the event
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to update this event" });
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

    // Update fields
    if (title) event.title = title;
    if (date) event.date = new Date(date);
    if (location) event.location = location;
    if (address !== undefined) event.address = address;
    if (city !== undefined) event.city = city;
    if (state !== undefined) event.state = state;
    if (country !== undefined) event.country = country;
    if (description !== undefined) event.description = description;

    await event.save();

    // Keep the linked group chat's name in lockstep with the event title so a
    // rename in one place shows up in the other. (Reflects on next chat load.)
    if (title && event.groupChatId) {
      await Chat.findByIdAndUpdate(event.groupChatId, { name: title });
    }

    invalidateCachePattern(`event_detail_${eventId}_`);
    const updatedEvent = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    res.status(200).json({
      message: "Event updated successfully",
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

    // Only the creator can invite users
    if (event.createdBy.toString() !== userId) {
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
    const { status } = req.body; // "accepted" | "declined"
    const userId = req.user.id;

    if (!["accepted", "declined"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'accepted' or 'declined'" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

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
      issueEventPass({ userId, eventId, type: "rsvp" }).catch((e) =>
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
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.isActive === false) {
      return res.status(410).json({ message: "This event is no longer available" });
    }

    if (event.createdBy.toString() === userId) {
      return res.status(400).json({ message: "You are the creator of this event" });
    }

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
    issueEventPass({ userId, eventId: event._id, type: "rsvp" }).catch((e) =>
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

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (!event.isPublic) {
      return res.status(403).json({ message: "This is a private event" });
    }

    if (event.isPaid) {
      return res.status(400).json({ message: "This is a paid event. Please purchase a ticket." });
    }

    if (event.createdBy.toString() === userId) {
      return res.status(400).json({ message: "You are the creator of this event" });
    }

    if (event.invitedUsers.includes(userId)) {
      return res.status(400).json({ message: "You have already joined this event" });
    }

    event.invitedUsers.push(userId);
    // Mark them as going so the event's going-count / capacity / friends-going
    // stats pick them up without a separate RSVP step.
    if (!event.rsvpUsers.some(id => id.toString() === userId)) {
      event.rsvpUsers.push(userId);
    }
    await event.save();

    // Joining a free public event is an RSVP — issue the entry pass + email QR.
    issueEventPass({ userId, eventId, type: "rsvp" }).catch((e) =>
      console.error("issueEventPass (joinFreePublicEvent) failed:", e)
    );

    invalidateCachePattern(`event_detail_${eventId}_`);
    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    res.status(200).json({ message: "Successfully joined the event" });
  } catch (error) {
    console.error("Join free event error:", error);
    res.status(500).json({ message: "Error joining event", error: error.message });
  }
};

// Get public events for exploration
export const getPublicEvents = async (req, res) => {
  try {
    const { limit = 20, page = 1, city, state, country, date, sort } = req.query;
    // optionalAuth — userId is null for logged-out (guest) browsers.
    const userId = req.user?.id || null;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const cacheKey = `public_events_${userId || 'guest'}_${page}_${limit}_${city || ''}_${state || ''}_${country || ''}_${date || ''}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const blockedIds = userId ? await getBlockedIds(userId) : [];

    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // OR-groups are AND-combined so the paid-approval rule and the city
    // filter don't overwrite each other.
    const andConditions = [
      {
        $or: [
          { isPaid: { $ne: true } },
          { isPaid: true, approvalStatus: "approved" },
        ],
      },
    ];

    // City matches the structured field, falling back to the free-text
    // location string for legacy events created before structured fields.
    if (city) {
      andConditions.push({
        $or: [
          { city: { $regex: new RegExp(`^${esc(city)}$`, "i") } },
          { location: { $regex: esc(city), $options: "i" } },
        ],
      });
    }

    const query = {
      isPublic: true,
      isActive: true,
      date: { $gte: new Date() },
      ...(state ? { state: { $regex: new RegExp(`^${esc(state)}$`, "i") } } : {}),
      ...(country ? { country: { $regex: new RegExp(`^${esc(country)}$`, "i") } } : {}),
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

    const total = await Event.countDocuments(query);

    const events = await Event.find(query)
      .populate('createdBy', 'username email profilePicture')
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get ticket counts and check if user has purchased
    const eventsWithTicketInfo = await Promise.all(
      events.map(async (event) => {
        const eventObj = event.toObject();

        // Check if current user created this event
        eventObj.isCreator = !!userId && event.createdBy._id.toString() === userId;

        if (event.isPaid && event.maxGuests > 0) {
          const soldTickets = await Ticket.countDocuments({ event: event._id, isValid: true });
          eventObj.ticketsSold = soldTickets;
          eventObj.ticketsRemaining = event.maxGuests - soldTickets;

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

        return eventObj;
      })
    );

    const result = { events: eventsWithTicketInfo, total, page: parseInt(page) };
    setCache(cacheKey, result, 120); // 2 min TTL
    res.status(200).json(result);
  } catch (error) {
    console.error("Get public events error:", error);
    res.status(500).json({ message: "Error fetching public events", error: error.message });
  }
};

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
    const { status } = req.body; // "going" | "not_going"
    const userId = req.user.id;

    if (!["going", "not_going"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'going' or 'not_going'" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Must be invited (or creator) to RSVP
    const isCreator = event.createdBy.toString() === userId;
    const isInvited = event.invitedUsers.some(id => id.toString() === userId);
    const isTicketHolder = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
    const isFreePublic = event.isPublic && !event.isPaid;

    if (!isCreator && !isInvited && !isTicketHolder && !isFreePublic) {
      return res.status(403).json({ message: "You must be invited to RSVP" });
    }

    const alreadyRsvp = event.rsvpUsers.some(id => id.toString() === userId);

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
      issueEventPass({ userId, eventId, type: "rsvp" }).catch((e) =>
        console.error("issueEventPass (rsvp) failed:", e)
      );
    }
    invalidateCachePattern('public_events_');
    invalidateCachePattern('event_highlights_');
    invalidateCachePattern(`event_detail_${eventId}_`);
    res.json({ message: status === "going" ? "You're marked as going!" : "RSVP removed", rsvpCount: event.rsvpUsers.length });
  } catch (error) {
    console.error("RSVP error:", error);
    res.status(500).json({ message: "Error updating RSVP", error: error.message });
  }
};

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

    res.status(200).json({
      ticketsSold: soldTickets,
      ticketsRemaining,
      maxGuests: event.maxGuests,
      ticketPrice: event.ticketPrice,
      totalRevenue: soldTickets * event.ticketPrice,
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

    const cacheKey = `event_highlights_${userId || 'guest'}`;
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

    const [trendingRaw, upcoming] = await Promise.all([
      Event.find({ ...publicFilter, date: { $gte: now } })
        .populate('createdBy', 'username email profilePicture')
        .sort({ date: 1 })
        .limit(20),
      Event.find({ ...publicFilter, date: { $gte: now, $lte: sevenDaysFromNow } })
        .populate('createdBy', 'username email profilePicture')
        .sort({ date: 1 })
        .limit(5),
    ]);

    const trending = [...trendingRaw]
      .sort((a, b) => (b.rsvpUsers?.length || 0) - (a.rsvpUsers?.length || 0))
      .slice(0, 5);

    const enrichEvent = async (event) => {
      const obj = event.toObject();
      obj.isCreator = !!userId && event.createdBy._id.toString() === userId;
      obj.rsvpCount = event.rsvpUsers?.length || 0;
      if (event.isPaid && event.maxGuests > 0) {
        const sold = await Ticket.countDocuments({ event: event._id, isValid: true });
        obj.ticketsSold = sold;
        obj.ticketsRemaining = event.maxGuests - sold;
        const userTicket = userId
          ? await Ticket.findOne({ event: event._id, user: userId, isValid: true })
          : null;
        obj.userHasPurchased = !!userTicket;
      } else {
        obj.userHasPurchased = !!userId && event.invitedUsers.some(id => id.toString() === userId);
      }
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
    const myUpcoming = userId
      ? await Event.find({
          isActive: true,
          date: { $gte: now },
          $or: [
            { createdBy: userId },
            { rsvpUsers: userId },
            { _id: { $in: myTicketEventIds } },
          ],
        })
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
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Only the event creator can add vendors" });
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

// Remove a vendor from an event (creator only)
export const removeVendorFromEvent = async (req, res) => {
  try {
    const { eventId, vendorId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "Only the event creator can remove vendors" });
    }

    event.vendors = event.vendors.filter(v => v.toString() !== vendorId);
    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    res.status(200).json({ message: "Vendor removed from event" });
  } catch (error) {
    console.error("Remove vendor from event error:", error);
    res.status(500).json({ message: "Failed to remove vendor" });
  }
};
