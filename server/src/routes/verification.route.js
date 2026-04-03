import express from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { submitVerification, getVerificationStatus } from "../controllers/verification.controller.js";

const router = express.Router();

router.post("/verification/submit", authenticate, submitVerification);
router.get("/verification/status", authenticate, getVerificationStatus);

export default router;
