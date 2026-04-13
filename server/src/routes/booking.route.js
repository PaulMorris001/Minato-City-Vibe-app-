import express from "express";
import {
  createBooking,
  getClientBookings,
  getVendorBookings,
  updateBookingStatus,
  cancelBooking,
} from "../controllers/booking.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticate);

// Client routes
router.post("/bookings", createBooking);
router.get("/bookings/client", getClientBookings);
router.patch("/bookings/:id/cancel", cancelBooking);

// Vendor routes
router.get("/bookings/vendor", getVendorBookings);
router.patch("/bookings/:id/status", updateBookingStatus);

export default router;
