import express from "express";
import { optionalAuth } from "../middleware/auth.middleware.js";
import {
  getExternalEventsExplore,
  getExternalEventById,
  getExternalEventsNearby,
} from "../controllers/externalEvent.controller.js";

const router = express.Router();

// Mounted under "/api/" in index.js
// Read-only public discovery data — guests can browse without an account.
router.get("/external-events/explore", optionalAuth, getExternalEventsExplore);
router.get("/external-events/nearby", optionalAuth, getExternalEventsNearby);
router.get("/external-events/:id", optionalAuth, getExternalEventById);

export default router;
