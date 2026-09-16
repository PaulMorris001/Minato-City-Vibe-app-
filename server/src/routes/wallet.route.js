import express from "express";
import { getCreditHistory } from "../controllers/wallet.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/wallet/credit-history", authenticate, getCreditHistory);

export default router;
