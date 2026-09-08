import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getRaffleStatus } from "../controllers/birthdayRaffle.controller.js";

const router = express.Router();

router.get("/raffle/status", authenticate, getRaffleStatus);

export default router;
