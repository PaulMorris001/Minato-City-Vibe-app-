import express from "express";
import {
  checkInAttendee,
  getEventAttendance,
  getEventSignups,
  getMyPasses,
  getMyPassForEvent,
} from "../controllers/attendance.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Organizer scans an attendee in / views the door roster.
router.post("/events/:eventId/check-in", authenticate, checkInAttendee);
router.get("/events/:eventId/attendance", authenticate, getEventAttendance);
// Guest list for the organizer (creator or co-host): one row per person.
router.get("/events/:eventId/signups", authenticate, getEventSignups);

// The signed-in user's own passes (QR + status).
router.get("/my-passes", authenticate, getMyPasses);
router.get("/my-passes/:eventId", authenticate, getMyPassForEvent);

export default router;
