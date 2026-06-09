import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  getExternalEventsExplore,
  getExternalEventById,
  getExternalEventsNearby,
} from "../controllers/externalEvent.controller.js";

const router = express.Router();

// Mounted under "/api/" in index.js
router.get("/external-events/explore", authenticate, getExternalEventsExplore);
router.get("/external-events/nearby", authenticate, getExternalEventsNearby);
router.get("/external-events/:id", authenticate, getExternalEventById);

export default router;
