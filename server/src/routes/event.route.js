import express from "express";
import {
  createEvent,
  getUserEvents,
  getEventById,
  getEventByShareToken,
  updateEvent,
  deleteEvent,
  inviteUserByUsername,
  respondToInvite,
  joinEventByShareLink,
  joinFreePublicEvent,
  getPublicEvents,
  purchaseTicket,
  getUserTickets,
  getEventTicketSales,
  rsvpEvent,
  getEventHighlights
} from "../controllers/event.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Create a new event
router.post("/events", authenticate, createEvent);

// Get all events for the authenticated user
router.get("/events", authenticate, getUserEvents);

// Get public events for exploration
router.get("/events/public/explore", authenticate, getPublicEvents);

// Get event highlights (trending + upcoming)
router.get("/events/highlights", authenticate, getEventHighlights);

// Get user's purchased tickets
router.get("/tickets", authenticate, getUserTickets);

// Join a free public event
router.post("/events/:eventId/join", authenticate, joinFreePublicEvent);

// Purchase a ticket for a public paid event
router.post("/events/:eventId/purchase", authenticate, purchaseTicket);

// Get ticket sales for an event (organizer only)
router.get("/events/:eventId/tickets", authenticate, getEventTicketSales);

// Get a specific event by ID
router.get("/events/:eventId", authenticate, getEventById);

// Get event by share token (public access for sharing)
router.get("/events/share/:shareToken", getEventByShareToken);

// Update an event
router.put("/events/:eventId", authenticate, updateEvent);

// Delete an event
router.delete("/events/:eventId", authenticate, deleteEvent);

// RSVP to an event
router.post("/events/:eventId/rsvp", authenticate, rsvpEvent);

// Invite user by username
router.post("/events/:eventId/invite", authenticate, inviteUserByUsername);

// Respond to an invite (accept or decline)
router.post("/events/:eventId/respond-invite", authenticate, respondToInvite);

// Join event via share link
router.post("/events/share/:shareToken/join", authenticate, joinEventByShareLink);

export default router;
