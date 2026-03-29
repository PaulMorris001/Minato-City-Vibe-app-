import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
import Chat from "../models/chat.model.js";
import Notification from "../models/notification.model.js";
import ChatService from "../services/chat.service.js";
import { uploadBase64Image, deleteImage } from "../services/image.service.js";
import { emitEventInvite } from "../services/socket.service.js";
import { setCache, getCache, invalidateCache, invalidateCachePattern } from "../utils/cache.js";

// Create a new event
export const createEvent = async (req, res) => {
  try {
    const { title, date, location, image, description, isPublic, isPaid, ticketPrice, maxGuests } = req.body;
    const userId = req.user.id;

    if (!title || !date || !location) {
      return res.status(400).json({ message: "Title, date, and location are required" });
    }

    // Validate pricing options for public paid events
    if (isPublic && isPaid) {
      if (!ticketPrice || ticketPrice <= 0) {
        return res.status(400).json({ message: "Ticket price must be greater than 0 for paid events" });
      }
      if (!maxGuests || maxGuests <= 0) {
        return res.status(400).json({ message: "Max guests must be specified for paid events" });
      }
    }

    // Handle event image upload
    let eventImageUrl = "";
    if (image) {
      if (image.startsWith('data:image')) {
        try {
          const result = await uploadBase64Image(image, 'events');
          eventImageUrl = result.url;
        } catch (error) {
          console.error("Error uploading event image:", error);
          return res.status(400).json({ message: "Error uploading event image", details: error.message });
        }
      } else {
        // Already a URL
        eventImageUrl = image;
      }
    }

    const event = new Event({
      title,
      date: new Date(date),
      location,
      image: eventImageUrl,
      description: description || "",
      createdBy: userId,
      isPublic: isPublic || false,
      isPaid: isPublic && isPaid ? isPaid : false,
      ticketPrice: isPublic && isPaid ? ticketPrice : 0,
      maxGuests: isPublic && isPaid ? maxGuests : 0
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
    console.error("Create event error:", error);
    res.status(500).json({ message: "Error creating event", error: error.message });
  }
};

// Get all events for a user (created or invited to)
export const getUserEvents = async (req, res) => {
  try {
    const userId = req.user.id;

    const events = await Event.find({
      $or: [
        { createdBy: userId },
        { invitedUsers: userId },
        { pendingInvites: userId }
      ],
      isActive: true
    })
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture')
      .populate('pendingInvites', 'username email profilePicture')
      .populate('groupChatId', '_id name groupImage')
      .sort({ date: -1 });

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

    res.status(200).json({ events: eventsWithInfo });
  } catch (error) {
    console.error("Get user events error:", error);
    res.status(500).json({ message: "Error fetching events", error: error.message });
  }
};

// Get a single event by ID
export const getEventById = async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const cacheKey = `event_detail_${eventId}_${userId}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const event = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture')
      .populate('pendingInvites', 'username email profilePicture')
      .populate('rsvpUsers', '_id')
      .populate('groupChatId', '_id name groupImage');

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const isCreator = event.createdBy._id.toString() === userId;
    const isInvited = event.invitedUsers.some(user => user._id.toString() === userId);
    const isPending = event.pendingInvites.some(user => user._id.toString() === userId);
    const isFreePublicEvent = event.isPublic && !event.isPaid;
    const userTicket = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
    const hasTicket = !!userTicket;

    // Pending invitees can view the event so they can decide whether to accept
    const hasAccess = isCreator || isInvited || isPending || hasTicket || isFreePublicEvent;

    if (!hasAccess) {
      return res.status(403).json({ message: "You don't have access to this event" });
    }

    const eventObj = event.toObject();
    eventObj.userRsvp = event.rsvpUsers.some(u => u._id.toString() === userId);
    eventObj.rsvpCount = event.rsvpUsers.length;

    // Tell the client what this user's relationship to the event is
    if (isCreator) eventObj.userStatus = 'creator';
    else if (isInvited) eventObj.userStatus = 'accepted';
    else if (isPending) eventObj.userStatus = 'pending';
    else eventObj.userStatus = 'none';

    const response = { event: eventObj };
    setCache(cacheKey, response, 180); // 3 min TTL
    res.status(200).json(response);
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ message: "Error fetching event", error: error.message });
  }
};

// Get event by share token
export const getEventByShareToken = async (req, res) => {
  try {
    const { shareToken } = req.params;

    const event = await Event.findOne({ shareToken, isActive: true })
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
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
    const { title, date, location, image, description } = req.body;
    const userId = req.user.id;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Only the creator can update the event
    if (event.createdBy.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to update this event" });
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

    // Update fields
    if (title) event.title = title;
    if (date) event.date = new Date(date);
    if (location) event.location = location;
    if (description !== undefined) event.description = description;

    await event.save();

    invalidateCachePattern(`event_detail_${eventId}_`);
    const updatedEvent = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    res.status(200).json({
      message: "Event updated successfully",
      event: updatedEvent
    });
  } catch (error) {
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

    // Find user by username
    const userToInvite = await User.findOne({ username });

    if (!userToInvite) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is the creator
    if (event.createdBy.toString() === userToInvite._id.toString()) {
      return res.status(400).json({ message: "Cannot invite the event creator" });
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

// Respond to an event invite (accept or decline)
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

      // Add to event group chat (create if doesn't exist yet)
      try {
        const user = await User.findById(userId).select('username');
        if (!event.groupChatId) {
          // Create group chat with creator + this user
          const groupChat = await ChatService.createGroupChat(
            event.title,
            [event.createdBy.toString(), userId],
            event.createdBy.toString(),
            event.image || ""
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
        console.error("Group chat error on invite accept:", chatErr);
      }

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

    const event = await Event.findOne({ shareToken, isActive: true });

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user is already invited or is the creator
    if (event.createdBy.toString() === userId) {
      return res.status(400).json({ message: "You are the creator of this event" });
    }

    if (event.invitedUsers.includes(userId)) {
      return res.status(400).json({ message: "You are already invited to this event" });
    }

    event.invitedUsers.push(userId);
    await event.save();

    const updatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

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
    await event.save();

    res.status(200).json({ message: "Successfully joined the event" });
  } catch (error) {
    console.error("Join free event error:", error);
    res.status(500).json({ message: "Error joining event", error: error.message });
  }
};

// Get public events for exploration
export const getPublicEvents = async (req, res) => {
  try {
    const { limit = 20, page = 1, city, date, sort } = req.query;
    const userId = req.user.id;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const cacheKey = `public_events_${page}_${limit}_${city || ''}_${date || ''}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const query = {
      isPublic: true,
      isActive: true,
      date: { $gte: new Date() },
    };

    if (city) {
      query.location = { $regex: city, $options: 'i' };
    }

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
        eventObj.isCreator = event.createdBy._id.toString() === userId;

        if (event.isPaid && event.maxGuests > 0) {
          const soldTickets = await Ticket.countDocuments({ event: event._id, isValid: true });
          eventObj.ticketsSold = soldTickets;
          eventObj.ticketsRemaining = event.maxGuests - soldTickets;

          // Check if current user has already purchased a ticket
          const userTicket = await Ticket.findOne({ event: event._id, user: userId, isValid: true });
          eventObj.userHasPurchased = !!userTicket;
        } else {
          // Free event - check if user has already joined (is in invitedUsers)
          const hasJoined = event.invitedUsers.some(id => id.toString() === userId);
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

// Purchase a ticket for a public paid event
export const purchaseTicket = async (req, res) => {
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

    if (!event.isPaid) {
      return res.status(400).json({ message: "This event is free" });
    }

    // Check if user already has a ticket
    const existingTicket = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
    if (existingTicket) {
      return res.status(400).json({ message: "You already have a ticket for this event" });
    }

    // Check if tickets are still available
    const soldTickets = await Ticket.countDocuments({ event: eventId, isValid: true });
    if (soldTickets >= event.maxGuests) {
      return res.status(400).json({ message: "No tickets available" });
    }

    // Create ticket
    const ticket = new Ticket({
      event: eventId,
      user: userId,
      ticketPrice: event.ticketPrice
    });

    await ticket.save();

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('event', 'title date location image')
      .populate('user', 'username email profilePicture');

    invalidateCache(`event_detail_${eventId}_${userId}`);
    res.status(201).json({
      message: "Ticket purchased successfully",
      ticket: populatedTicket
    });
  } catch (error) {
    console.error("Purchase ticket error:", error);
    res.status(500).json({ message: "Error purchasing ticket", error: error.message });
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
    const userId = req.user.id;

    const cacheKey = `event_highlights_${userId}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [trendingRaw, upcoming] = await Promise.all([
      Event.find({ isPublic: true, isActive: true, date: { $gte: now } })
        .populate('createdBy', 'username email profilePicture')
        .sort({ date: 1 })
        .limit(20),
      Event.find({ isPublic: true, isActive: true, date: { $gte: now, $lte: sevenDaysFromNow } })
        .populate('createdBy', 'username email profilePicture')
        .sort({ date: 1 })
        .limit(5),
    ]);

    const trending = [...trendingRaw]
      .sort((a, b) => (b.rsvpUsers?.length || 0) - (a.rsvpUsers?.length || 0))
      .slice(0, 5);

    const enrichEvent = async (event) => {
      const obj = event.toObject();
      obj.isCreator = event.createdBy._id.toString() === userId;
      obj.rsvpCount = event.rsvpUsers?.length || 0;
      if (event.isPaid && event.maxGuests > 0) {
        const sold = await Ticket.countDocuments({ event: event._id, isValid: true });
        obj.ticketsSold = sold;
        obj.ticketsRemaining = event.maxGuests - sold;
        const userTicket = await Ticket.findOne({ event: event._id, user: userId, isValid: true });
        obj.userHasPurchased = !!userTicket;
      } else {
        obj.userHasPurchased = event.invitedUsers.some(id => id.toString() === userId);
      }
      return obj;
    };

    const [trendingEnriched, upcomingEnriched] = await Promise.all([
      Promise.all(trending.map(enrichEvent)),
      Promise.all(upcoming.map(enrichEvent)),
    ]);

    const result = { trending: trendingEnriched, upcoming: upcomingEnriched };
    setCache(cacheKey, result, 120); // 2 min TTL
    res.status(200).json(result);
  } catch (error) {
    console.error("Get event highlights error:", error);
    res.status(500).json({ message: "Error fetching highlights", error: error.message });
  }
};
