import express from "express";
import { savePushToken, deletePushToken } from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.put("/notifications/token", authenticate, savePushToken);
router.delete("/notifications/token", authenticate, deletePushToken);

export default router;
