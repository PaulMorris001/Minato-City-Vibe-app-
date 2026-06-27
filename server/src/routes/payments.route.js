import express from "express";
import {
  initPayment,
  confirmPayment,
  getPaymentsConfig,
} from "../controllers/payments.controller.js";
import { flutterwaveReturn } from "../controllers/flutterwave.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public — both providers' publishable keys, fetched at runtime.
router.get("/payments/config", getPaymentsConfig);

// Public — Flutterwave redirects the checkout browser here after payment; the
// mobile app intercepts the URL to read the result, this page is a fallback.
router.get("/payments/flutterwave/return", flutterwaveReturn);

// Unified purchase flow. :type ∈ { ticket, guide, booking }
router.post("/payments/init/:type/:id", authenticate, initPayment);
router.post("/payments/confirm/:type/:id", authenticate, confirmPayment);

export default router;
