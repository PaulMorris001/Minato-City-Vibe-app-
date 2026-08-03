import express from "express";
import {
  createConnectAccount,
  getAccountLink,
  getAccountStatus,
  stripeConnectReturn,
  stripeConnectRefresh,
  stripeConnectWebhook,
} from "../controllers/stripeConnect.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Connect webhook — verified against STRIPE_CONNECT_WEBHOOK_SECRET, a DIFFERENT
// secret from the account webhook. Uses the raw body; the raw parser is applied
// at app level in index.js before express.json(), so req.body is a Buffer here.
router.post("/stripe/connect/webhook", stripeConnectWebhook);

// Vendor payout onboarding
router.post("/stripe/connect/create", authenticate, createConnectAccount);
router.get("/stripe/connect/link", authenticate, getAccountLink);
router.get("/stripe/connect/status", authenticate, getAccountStatus);

// Where Stripe's hosted onboarding sends the browser afterwards. Unauthenticated
// — Stripe drives these, not the app — and they only forward to a deep link.
router.get("/stripe/connect/return", stripeConnectReturn);
router.get("/stripe/connect/refresh", stripeConnectRefresh);

export default router;
