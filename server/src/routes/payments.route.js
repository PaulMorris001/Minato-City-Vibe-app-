import express from "express";
import {
  initPayment,
  confirmPayment,
  initTicketBatch,
  confirmTicketBatch,
  getPaymentsConfig,
} from "../controllers/payments.controller.js";
import { startGuestOtp, verifyGuestOtp } from "../controllers/guestCheckout.controller.js";
import { paystackReturn } from "../controllers/paystack.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { otpLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// Public — both providers' publishable keys, fetched at runtime.
router.get("/payments/config", getPaymentsConfig);

// Public — Paystack redirects the checkout browser here after payment; the
// mobile app intercepts the URL to read the result, this page is a fallback.
router.get("/payments/paystack/return", paystackReturn);

// Guest checkout — confirm an email with a one-time code, get a short-lived
// guest token, then buy without an account. Rate-limited like other OTP flows.
router.post("/payments/guest/start-otp", otpLimiter, startGuestOtp);
router.post("/payments/guest/verify-otp", otpLimiter, verifyGuestOtp);

// Batch ticket purchase (web guest / multi / gift). `authenticate` accepts a
// guest OR a real token; the ticket endpoints are the only place a guest token
// is honored. MUST be registered before the generic `:type/:id` route below —
// otherwise "tickets" is matched as a :type.
router.post("/payments/init/tickets/:eventId", authenticate, initTicketBatch);
router.post("/payments/confirm/tickets/:eventId", authenticate, confirmTicketBatch);

// Unified single purchase flow. :type ∈ { ticket, guide, booking, order }
router.post("/payments/init/:type/:id", authenticate, initPayment);
router.post("/payments/confirm/:type/:id", authenticate, confirmPayment);

export default router;
