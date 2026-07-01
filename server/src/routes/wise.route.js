import express from "express";
import {
  getRequirements,
  saveRecipient,
  getStatus,
  wiseWebhook,
} from "../controllers/wise.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Webhook — verified via RSA signature in the X-Signature-SHA256 header. Mounted
// with express.raw in index.js so the raw body is available for verification.
router.post("/wise/webhook", wiseWebhook);

// Vendor payout onboarding
router.get("/wise/account-requirements", authenticate, getRequirements);
router.post("/wise/connect/save", authenticate, saveRecipient);
router.get("/wise/connect/status", authenticate, getStatus);

export default router;
