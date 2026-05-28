import express from "express";
import {
  createEvent,
  getUserEvents,
  getEventById,
  getEventByShareToken,
  updateEvent,
  deleteEvent,
  inviteUserByUsername,
  requestToJoinEvent,
  respondToInvite,
  joinEventByShareLink,
  joinFreePublicEvent,
  getPublicEvents,
  purchaseTicket,
  getUserTickets,
  getEventTicketSales,
  rsvpEvent,
  getEventHighlights,
  addVendorToEvent,
  removeVendorFromEvent,
} from "../controllers/event.controller.js";
import { authenticate, optionalAuth } from "../middleware/auth.middleware.js";

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

// Get a specific event by ID. optionalAuth so deep links work for logged-out
// viewers — the controller returns 401 for non-public events and strips
// private fields for anon viewers.
router.get("/events/:eventId", optionalAuth, getEventById);

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

// Request to join an invite-only event (user-initiated)
router.post("/events/:eventId/request-join", authenticate, requestToJoinEvent);

// Join event via share link
router.post("/events/share/:shareToken/join", authenticate, joinEventByShareLink);

// Vendor management for events (creator only)
router.post("/events/:eventId/vendors/:vendorId", authenticate, addVendorToEvent);
router.delete("/events/:eventId/vendors/:vendorId", authenticate, removeVendorFromEvent);

export default router;
