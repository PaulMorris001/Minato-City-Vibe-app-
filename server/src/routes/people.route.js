import express from "express";
import { getSuggestions } from "../controllers/people.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/people/suggestions", authenticate, getSuggestions);

export default router;
