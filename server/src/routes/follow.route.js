import express from "express";
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowCounts,
  getFollowStatus,
  getMutualFollows,
  getMutualConnections,
} from "../controllers/follow.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// Mutual follows must be before :userId routes to avoid param collision
router.get("/follow/mutual", authenticate, getMutualFollows);

router.post("/follow/:userId", authenticate, followUser);
router.delete("/follow/:userId", authenticate, unfollowUser);
router.get("/follow/:userId/followers", authenticate, getFollowers);
router.get("/follow/:userId/following", authenticate, getFollowing);
router.get("/follow/:userId/mutual-connections", authenticate, getMutualConnections);
router.get("/follow/:userId/counts", authenticate, getFollowCounts);
router.get("/follow/:userId/status", authenticate, getFollowStatus);

export default router;
