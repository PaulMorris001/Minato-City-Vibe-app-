import express from "express";
import { getSummary, getSales, getPayouts } from "../controllers/earnings.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// All seller-scoped: the seller is req.user.id, never a param.
router.get("/earnings/summary", authenticate, getSummary);
router.get("/earnings/sales", authenticate, getSales);
router.get("/earnings/payouts", authenticate, getPayouts);

export default router;
