import express from "express";
import { createReport } from "../controllers/report.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/reports", authenticate, createReport);

export default router;
