import express from "express";
import { unifiedSearch } from "../controllers/search.controller.js";
import { optionalAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Unified search across events, guides, vendors and users.
// optionalAuth: guests get the three public buckets; the users bucket comes
// back empty with `requiresAuth: true` rather than 401-ing the whole request.
// No path conflict with /users/search, /vendors/search or /chats/search —
// those are more specific literals.
router.get("/search", optionalAuth, unifiedSearch);

export default router;
