import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getPublicRaffleCampaign, getRaffleStatus } from "../controllers/birthdayRaffle.controller.js";

const router = express.Router();

router.get("/raffle/public", getPublicRaffleCampaign);
router.get("/raffle/status", authenticate, getRaffleStatus);

export default router;
