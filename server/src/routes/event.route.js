import express from "express";
import {
  createEvent,
  createEventFromGroup,
  getUserEvents,
  getEventById,
  getEventByShareToken,
  getEventQr,
  updateEvent,
  deleteEvent,
  inviteUserByUsername,
  requestToJoinEvent,
  respondToInvite,
  joinEventByShareLink,
  joinFreePublicEvent,
  getPublicEvents,
  getUserTickets,
  getEventTicketSales,
  rsvpEvent,
  getEventHighlights,
  addVendorToEvent,
  removeVendorFromEvent,
  respondToVendorInvite,
  getMyVendorEventInvites,
  addCohost,
  removeCohost,
  getEventDiscountCodes,
  toggleEventDiscountCodeByCreator,
} from "../controllers/event.controller.js";
import { authenticate, optionalAuth, rejectGuest } from "../middleware/auth.middleware.js";

const router = express.Router();

// Create a new event. `rejectGuest` keeps short-lived guest-checkout tokens from
// creating content as their throwaway account.
router.post("/events", authenticate, rejectGuest, createEvent);

// Create a private, free event from a standalone group chat (admin only) —
// auto-enrolls every group member and links the event to the group.
router.post("/events/from-group/:chatId", authenticate, rejectGuest, createEventFromGroup);

// Get all events for the authenticated user
router.get("/events", authenticate, getUserEvents);

// Get public events for exploration (guest-accessible)
router.get("/events/public/explore", optionalAuth, getPublicEvents);

// Get event highlights (trending + upcoming) — guest-accessible
router.get("/events/highlights", optionalAuth, getEventHighlights);

// Get user's purchased tickets
router.get("/tickets", authenticate, getUserTickets);

// Join a free public event
router.post("/events/:eventId/join", authenticate, joinFreePublicEvent);

// Get ticket sales for an event (organizer only)
router.get("/events/:eventId/tickets", authenticate, getEventTicketSales);

// Discount codes for an event (organizer only) — admins create the codes;
// the creator can view them and toggle their own disable flag.
router.get("/events/:eventId/discount-codes", authenticate, getEventDiscountCodes);
router.patch("/events/:eventId/discount-codes/:codeId/toggle", authenticate, toggleEventDiscountCodeByCreator);

// QR code for an event's share link. optionalAuth for the same reason as the
// detail route below — a logged-out viewer of a public event can still grab it.
router.get("/events/:eventId/qr", optionalAuth, getEventQr);

// Get a specific event by ID. optionalAuth so deep links work for logged-out
// viewers — the controller returns 401 for non-public events and strips
// private fields for anon viewers.
router.get("/events/:eventId", optionalAuth, getEventById);

// Get event by share token (public access for sharing)
router.get("/events/share/:shareToken", getEventByShareToken);

// Update an event
router.put("/events/:eventId", authenticate, rejectGuest, updateEvent);

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

// Co-host management (creator only)
router.post("/events/:eventId/cohosts", authenticate, addCohost);
router.delete("/events/:eventId/cohosts/:cohostId", authenticate, removeCohost);

// Pending event invites for the logged-in user's vendor(s)
router.get("/vendor/event-invites", authenticate, getMyVendorEventInvites);

// Vendor responds to an event invite (accept/decline)
router.post("/events/:eventId/vendor-invite/respond", authenticate, respondToVendorInvite);

export default router;
