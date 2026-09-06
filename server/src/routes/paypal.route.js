import express from "express";
import { paypalWebhook } from "../controllers/paypal.controller.js";
import { savePaypalEmail, getPayoutStatus } from "../controllers/paypalPayout.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Webhook — verified by calling PayPal back with the transmission headers (there
// is no local signing secret to HMAC). Mounted with express.raw in index.js
// because the signature covers the exact request bytes.
router.post("/paypal/webhook", paypalWebhook);

// Vendor payout onboarding. There is no hosted flow to redirect into: a PayPal
// payout needs only the seller's PayPal email.
router.post("/paypal/connect/save", authenticate, savePaypalEmail);
router.get("/paypal/connect/status", authenticate, getPayoutStatus);

export default router;
