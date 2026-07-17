import express from "express";
import {
  getBanks,
  resolveAccount,
  saveBank,
  getStatus,
  paystackWebhook,
} from "../controllers/paystack.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Webhook — verified via HMAC-SHA512 of the raw body in the
// x-paystack-signature header (no JWT). Mounted with express.raw in index.js.
router.post("/paystack/webhook", paystackWebhook);

// Vendor bank onboarding
router.get("/paystack/banks", authenticate, getBanks);
router.post("/paystack/connect/resolve", authenticate, resolveAccount);
router.post("/paystack/connect/save", authenticate, saveBank);
router.get("/paystack/connect/status", authenticate, getStatus);

export default router;
