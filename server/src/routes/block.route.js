import express from "express";
import {
  blockUser,
  unblockUser,
  getBlockedUsers,
} from "../controllers/block.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/blocks", authenticate, getBlockedUsers);
router.post("/blocks", authenticate, blockUser);
router.delete("/blocks/:userId", authenticate, unblockUser);

export default router;
