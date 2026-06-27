import express from "express";
import {
  getBanks,
  resolveAccount,
  saveBank,
  getStatus,
  flutterwaveWebhook,
} from "../controllers/flutterwave.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Webhook — auth is the shared `verif-hash` header (no JWT). JSON body is fine
// (unlike Stripe, no raw-body signature is required).
router.post("/flutterwave/webhook", flutterwaveWebhook);

// Vendor bank onboarding
router.get("/flutterwave/banks", authenticate, getBanks);
router.post("/flutterwave/connect/resolve", authenticate, resolveAccount);
router.post("/flutterwave/connect/save", authenticate, saveBank);
router.get("/flutterwave/connect/status", authenticate, getStatus);

export default router;
