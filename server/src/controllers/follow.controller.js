import Follow from "../models/follow.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { emitFollowEvent } from "../services/socket.service.js";
import { sendPushNotification } from "../services/notification.service.js";
import { isSupportUser } from "../utils/supportAccount.js";
import { countFollows, supportAudienceFilter } from "../utils/followCounts.js";

/**
 * Followers/following list for the support account.
 *
 * Its audience is virtual (no Follow rows — see utils/followCounts.js), so the
 * list pages over the User collection instead. The response shape is identical
 * to the real thing so followers.tsx / following.tsx need no special casing.
 */
const listSupportAudience = async (req, res, supportId, { asFollowing }) => {
  const currentUserId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = supportAudienceFilter(supportId);

  const [audience, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("username email profilePicture isVendor businessName")
      .lean(),
    User.countDocuments(filter),
  ]);

  // Whether the viewer follows each of these people is a real relationship,
  // so it still comes from the Follow collection.
  const ids = audience.map((u) => u._id);
  const viewerFollows = await Follow.find({
    follower: currentUserId,
    following: { $in: ids },
  }).lean();
  const viewerFollowsSet = new Set(viewerFollows.map((f) => f.following.toString()));

  const viewerIsSupport = isSupportUser(currentUserId);

  const users = audience.map((u) => ({
    _id: u._id,
    username: u.username,
    email: u.email,
    profilePicture: u.profilePicture,
    isVendor: u.isVendor,
    businessName: u.businessName,
    // Support virtually follows everyone, so from its own perspective every
    // row is already followed — and mutual, since they follow it back.
    isFollowing: viewerIsSupport ? true : viewerFollowsSet.has(u._id.toString()),
    ...(asFollowing ? { isMutual: viewerIsSupport } : {}),
  }));

  return res.status(200).json({ users, total, page, pages: Math.ceil(total / limit) });
};

// Follow a user
export const followUser = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    // Support already counts every user as a follower — following it is a
    // no-op that would only skew the virtual count's premise.
    if (isSupportUser(targetUserId)) {
      return res
        .status(400)
        .json({ message: "This is the official support account and can't be followed." });
    }

    const targetUser = await User.findById(targetUserId).select("username profilePicture fcmToken");
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Upsert to be idempotent
    await Follow.findOneAndUpdate(
      { follower: currentUserId, following: targetUserId },
      { follower: currentUserId, following: targetUserId },
      { upsert: true, new: true }
    );

    // Check if now mutual
    const reverseFollow = await Follow.findOne({
      follower: targetUserId,
      following: currentUserId,
    }).lean();
    const isMutual = !!reverseFollow;

    // Get current user info for notification
    const currentUser = await User.findById(currentUserId).select("username profilePicture");

    // Create notification
    try {
      await Notification.create({
        user: targetUserId,
        type: "new_follower",
        title: "New Follower",
        body: `${currentUser.username} started following you!`,
        data: { followerId: currentUserId },
      });
    } catch (notifError) {
      console.error("Error creating follow notification:", notifError);
    }

    // Real-time socket event
    emitFollowEvent(targetUserId, {
      followerId: currentUserId,
      followerUsername: currentUser.username,
      followerProfilePicture: currentUser.profilePicture || "",
      isMutual,
    });

    // Push notification
    if (targetUser.fcmToken) {
      sendPushNotification(
        targetUser.fcmToken,
        "New Follower",
        `${currentUser.username} started following you!`,
        { type: "new_follower", followerId: currentUserId }
      );
    }

    res.status(200).json({
      message: "Followed successfully",
      isFollowing: true,
      isMutual,
    });
  } catch (error) {
    console.error("Follow user error:", error);
    res.status(500).json({ message: "Error following user", error: error.message });
  }
};

// Unfollow a user
export const unfollowUser = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    await Follow.findOneAndDelete({
      follower: currentUserId,
      following: targetUserId,
    });

    res.status(200).json({
      message: "Unfollowed successfully",
      isFollowing: false,
    });
  } catch (error) {
    console.error("Unfollow user error:", error);
    res.status(500).json({ message: "Error unfollowing user", error: error.message });
  }
};

// Get followers for a user
export const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (isSupportUser(userId)) {
      return listSupportAudience(req, res, userId, { asFollowing: false });
    }

    const [followers, total] = await Promise.all([
      Follow.find({ following: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("follower", "username email profilePicture isVendor businessName")
        .lean(),
      Follow.countDocuments({ following: userId }),
    ]);

    // Batch check if current user follows each follower
    const followerIds = followers.map((f) => f.follower._id);
    const currentUserFollows = await Follow.find({
      follower: currentUserId,
      following: { $in: followerIds },
    }).lean();
    const followingSet = new Set(currentUserFollows.map((f) => f.following.toString()));

    const users = followers.map((f) => ({
      _id: f.follower._id,
      username: f.follower.username,
      email: f.follower.email,
      profilePicture: f.follower.profilePicture,
      isVendor: f.follower.isVendor,
      businessName: f.follower.businessName,
      isFollowing: followingSet.has(f.follower._id.toString()),
    }));

    res.status(200).json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Get followers error:", error);
    res.status(500).json({ message: "Error fetching followers", error: error.message });
  }
};

// Get following for a user
export const getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (isSupportUser(userId)) {
      return listSupportAudience(req, res, userId, { asFollowing: true });
    }

    const [followings, total] = await Promise.all([
      Follow.find({ follower: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("following", "username email profilePicture isVendor businessName")
        .lean(),
      Follow.countDocuments({ follower: userId }),
    ]);

    // Batch check if each followed user follows back (for mutual indicator)
    const followingIds = followings.map((f) => f.following._id);
    const followBacks = await Follow.find({
      follower: { $in: followingIds },
      following: userId,
    }).lean();
    const followBackSet = new Set(followBacks.map((f) => f.follower.toString()));

    // Also check if current user follows each (relevant when viewing another user's following list)
    let currentUserFollowSet = new Set();
    if (currentUserId !== userId) {
      const currentUserFollows = await Follow.find({
        follower: currentUserId,
        following: { $in: followingIds },
      }).lean();
      currentUserFollowSet = new Set(currentUserFollows.map((f) => f.following.toString()));
    }

    const users = followings.map((f) => ({
      _id: f.following._id,
      username: f.following.username,
      email: f.following.email,
      profilePicture: f.following.profilePicture,
      isVendor: f.following.isVendor,
      businessName: f.following.businessName,
      isFollowing: currentUserId === userId ? true : currentUserFollowSet.has(f.following._id.toString()),
      isMutual: followBackSet.has(f.following._id.toString()),
    }));

    res.status(200).json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({ message: "Error fetching following", error: error.message });
  }
};

// Get follower and following counts
export const getFollowCounts = async (req, res) => {
  try {
    const { userId } = req.params;

    const { followersCount, followingCount } = await countFollows(userId);

    res.status(200).json({ followersCount, followingCount });
  } catch (error) {
    console.error("Get follow counts error:", error);
    res.status(500).json({ message: "Error fetching follow counts", error: error.message });
  }
};

// Get follow status between current user and a target user
export const getFollowStatus = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    // Support counts everyone as a follower and follows everyone back.
    if (isSupportUser(targetUserId)) {
      return res
        .status(200)
        .json({ isFollowing: true, isFollowedBy: true, isMutual: true });
    }

    const [isFollowing, isFollowedBy] = await Promise.all([
      Follow.findOne({ follower: currentUserId, following: targetUserId }).lean(),
      Follow.findOne({ follower: targetUserId, following: currentUserId }).lean(),
    ]);

    res.status(200).json({
      isFollowing: !!isFollowing,
      isFollowedBy: !!isFollowedBy,
      isMutual: !!isFollowing && !!isFollowedBy,
    });
  } catch (error) {
    console.error("Get follow status error:", error);
    res.status(500).json({ message: "Error fetching follow status", error: error.message });
  }
};

// Get mutual follows (users you can chat with / invite)
export const getMutualFollows = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const query = req.query.query || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Find users that the current user follows
    const following = await Follow.find({ follower: currentUserId }).select("following").lean();
    const followingIds = following.map((f) => f.following);

    // Of those, find which ones follow back
    const mutualFollows = await Follow.find({
      follower: { $in: followingIds },
      following: currentUserId,
    })
      .select("follower")
      .lean();
    const mutualIds = mutualFollows.map((f) => f.follower);

    // Build user query
    const userQuery = { _id: { $in: mutualIds } };
    if (query.trim().length > 0) {
      userQuery.$or = [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(userQuery)
        .select("username email profilePicture isVendor businessName")
        .sort({ username: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(userQuery),
    ]);

    const result = users.map((u) => ({
      _id: u._id,
      id: u._id,
      username: u.username,
      email: u.email,
      profilePicture: u.profilePicture,
      isVendor: u.isVendor,
      businessName: u.businessName,
      isFollowing: true,
      isFollowedBy: true,
      isMutual: true,
    }));

    res.status(200).json({ users: result, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Get mutual follows error:", error);
    res.status(500).json({ message: "Error fetching mutual follows", error: error.message });
  }
};
