import express from "express";
import {
  stripeWebhook,
  refundOwnTicket,
  cancelEventByOrganizer,
  adminRefundTicket,
  getStripeConfig,
} from "../controllers/stripe.controller.js";
import { authenticateAdmin } from "../middleware/admin.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public — lets the mobile app fetch the publishable key that matches this
// server's secret key (same account/mode), avoiding test/live key mismatches.
router.get("/stripe/config", getStripeConfig);

// Webhook uses raw body — the raw parser is applied at app level in index.js
// before express.json(), so req.body here is already a Buffer
router.post("/stripe/webhook", stripeWebhook);

// Refunds + cancellation
router.post("/tickets/:ticketId/refund", authenticate, refundOwnTicket);
router.post("/events/:eventId/cancel", authenticate, cancelEventByOrganizer);
router.post("/admin/tickets/:ticketId/refund", authenticateAdmin, adminRefundTicket);

export default router;
