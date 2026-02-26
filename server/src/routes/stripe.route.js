import express from "express";
import {
  createConnectAccount,
  getAccountLink,
  getAccountStatus,
  stripeConnectReturn,
  stripeConnectRefresh,
  createTicketPaymentIntent,
  createGuidePaymentIntent,
  confirmGuidePurchase,
  confirmTicketPurchase,
  stripeWebhook,
} from "../controllers/stripe.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Webhook uses raw body — the raw parser is applied at app level in index.js
// before express.json(), so req.body here is already a Buffer
router.post("/stripe/webhook", stripeWebhook);

// Seller Connect onboarding
router.post("/stripe/connect/create", authenticate, createConnectAccount);
router.get("/stripe/connect/link", authenticate, getAccountLink);
router.get("/stripe/connect/status", authenticate, getAccountStatus);
// Stripe redirect endpoints (no auth — Stripe browser redirects here after onboarding)
router.get("/stripe/connect/return", stripeConnectReturn);
router.get("/stripe/connect/refresh", stripeConnectRefresh);

// Payment intents
router.post("/stripe/payment-intent/ticket/:eventId", authenticate, createTicketPaymentIntent);
router.post("/stripe/payment-intent/guide/:guideId", authenticate, createGuidePaymentIntent);

// Purchase confirmation — called immediately after payment sheet succeeds
router.post("/stripe/confirm/ticket/:eventId", authenticate, confirmTicketPurchase);
router.post("/stripe/confirm/guide/:guideId", authenticate, confirmGuidePurchase);

export default router;
