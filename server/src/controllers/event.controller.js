import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
import ChatService from "../services/chat.service.js";
import { uploadBase64Image, deleteImage } from "../services/image.service.js";

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
        { invitedUsers: userId }
      ],
      isActive: true
    })
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture')
      .sort({ date: -1 });

    // Add ticket counts for public paid events
    const eventsWithTicketInfo = await Promise.all(
      events.map(async (event) => {
        const eventObj = event.toObject();
        if (event.isPublic && event.isPaid && event.maxGuests > 0) {
          const soldTickets = await Ticket.countDocuments({ event: event._id, isValid: true });
          eventObj.ticketsSold = soldTickets;
          eventObj.ticketsRemaining = event.maxGuests - soldTickets;
        }
        return eventObj;
      })
    );

    res.status(200).json({ events: eventsWithTicketInfo });
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

    const event = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user has access to this event
    // Access granted if: creator, invited user, or has a valid ticket
    const isCreator = event.createdBy._id.toString() === userId;
    const isInvited = event.invitedUsers.some(user => user._id.toString() === userId);

    // Check if user has a valid ticket for this event
    const userTicket = await Ticket.findOne({ event: eventId, user: userId, isValid: true });
    const hasTicket = !!userTicket;

    const hasAccess = isCreator || isInvited || hasTicket;

    if (!hasAccess) {
      return res.status(403).json({ message: "You don't have access to this event" });
    }

    res.status(200).json({ event });
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

    // Check if user is already invited
    if (event.invitedUsers.includes(userToInvite._id)) {
      return res.status(400).json({ message: "User already invited" });
    }

    // Check if user is the creator
    if (event.createdBy.toString() === userToInvite._id.toString()) {
      return res.status(400).json({ message: "Cannot invite the event creator" });
    }

    event.invitedUsers.push(userToInvite._id);
    await event.save();

    const updatedEvent = await Event.findById(eventId)
      .populate('createdBy', 'username email profilePicture')
      .populate('invitedUsers', 'username email profilePicture');

    // Send event invitation notification via chat
    try {
      // Get or create direct chat between inviter and invitee
      const chat = await ChatService.getOrCreateDirectChat(userId, userToInvite._id.toString());

      // Format the event date
      const eventDate = new Date(event.date);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Send event invitation message
      await ChatService.sendMessage(chat._id, userId, {
        type: 'event',
        content: `📅 You've been invited to "${event.title}"\n📍 ${event.location}\n🕐 ${formattedDate}`,
        eventId: event._id
      });
    } catch (chatError) {
      console.error("Error sending chat notification:", chatError);
      // Don't fail the invitation if chat notification fails
    }

    res.status(200).json({
      message: "User invited successfully",
      event: updatedEvent
    });
  } catch (error) {
    console.error("Invite user error:", error);
    res.status(500).json({ message: "Error inviting user", error: error.message });
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

// Get public events for exploration
export const getPublicEvents = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const userId = req.user.id;

    const events = await Event.find({
      isPublic: true,
      isActive: true,
      date: { $gte: new Date() } // Only future events
    })
      .populate('createdBy', 'username email profilePicture')
      .sort({ date: 1 })
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
          eventObj.userHasPurchased = false;
        }

        return eventObj;
      })
    );

    res.status(200).json({ events: eventsWithTicketInfo });
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
