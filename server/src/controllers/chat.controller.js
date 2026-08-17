import ChatService from "../services/chat.service.js";
import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";
import { setCache, getCache, invalidateCache, invalidateCachePattern } from "../utils/cache.js";
import { SUPPORT_USER_ID } from "../utils/supportAccount.js";

/**
 * Chat Controller - Handles HTTP requests for chat operations
 */

// Create or get a direct chat with another user.
// Pass { context: "vendor", vendorUserId } to open a business↔customer thread
// (kept separate from any personal chat between the same two users).
export const getOrCreateDirectChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId, context, vendorUserId } = req.body;

    if (!otherUserId) {
      return res.status(400).json({ message: "Other user ID is required" });
    }

    if (userId === otherUserId) {
      return res.status(400).json({ message: "Cannot create chat with yourself" });
    }

    // Verify other user exists
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let options = {};
    if (context === "vendor") {
      if (![userId, otherUserId].includes(vendorUserId)) {
        return res.status(400).json({ message: "vendorUserId must be one of the two participants" });
      }
      // The business side of the thread must actually be a vendor.
      const vendorUser = vendorUserId === userId
        ? await User.findById(userId).select("isVendor")
        : otherUser;
      if (!vendorUser?.isVendor) {
        return res.status(400).json({ message: "That user is not a vendor" });
      }
      options = { context: "vendor", vendorUserId };
    }

    const chat = await ChatService.getOrCreateDirectChat(userId, otherUserId, options);

    // Invalidate both users' chat lists (all scopes) in case a new chat was created
    invalidateCachePattern(`user_chats_${userId}`);
    invalidateCachePattern(`user_chats_${otherUserId}`);
    res.status(200).json({
      message: "Chat retrieved successfully",
      chat
    });
  } catch (error) {
    console.error("Get/Create direct chat error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error creating chat" });
  }
};

/**
 * Open (or resume) the conversation with the official support account.
 *
 * The support account's id lives on the SERVER. The client used to hold its own
 * copy and POST it to /chats/direct, which meant a build shipped with a stale or
 * wrong literal made every support entry point 404 — and there was no way to fix
 * it without shipping a new binary. Resolving it here removes that whole class
 * of drift: the client asks for "support" and the server knows who that is.
 * POST /chats/support
 */
export const getOrCreateSupportChat = async (req, res) => {
  try {
    if (!SUPPORT_USER_ID) {
      return res.status(503).json({
        message: "Support chat isn't available right now. Please try again later.",
        code: "support_unconfigured",
      });
    }
    if (String(req.user.id) === String(SUPPORT_USER_ID)) {
      return res.status(400).json({ message: "You are the support account" });
    }

    const support = await User.findById(SUPPORT_USER_ID).select("_id");
    if (!support) {
      // Misconfiguration, not a user error — the configured id matches no user.
      console.error(
        `[support] SUPPORT_USER_ID ${SUPPORT_USER_ID} does not match any user. ` +
          `Run src/scripts/setupSupportAccount.mjs or correct the env var.`
      );
      return res.status(503).json({
        message: "Support chat isn't available right now. Please try again later.",
        code: "support_unconfigured",
      });
    }

    const chat = await ChatService.getOrCreateDirectChat(req.user.id, String(support._id));

    invalidateCachePattern(`user_chats_${req.user.id}`);
    invalidateCachePattern(`user_chats_${support._id}`);
    res.status(200).json({ message: "Support chat ready", chat });
  } catch (error) {
    console.error("Get/Create support chat error:", error);
    res.status(error.statusCode || 500).json({ message: "Couldn't reach support" });
  }
};

// Create a group chat
export const createGroupChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, participantIds, groupImage } = req.body;

    if (!name || !participantIds || participantIds.length < 2) {
      return res.status(400).json({
        message: "Group name and at least 2 participants are required"
      });
    }

    const chat = await ChatService.createGroupChat(
      name,
      participantIds,
      userId,
      groupImage
    );

    // Invalidate all participants' chat lists
    invalidateCachePattern('user_chats_');
    res.status(201).json({
      message: "Group chat created successfully",
      chat
    });
  } catch (error) {
    console.error("Create group chat error:", error);
    res.status(500).json({ message: "Error creating group chat", error: error.message });
  }
};

// Get all chats for the authenticated user.
// ?scope=vendor returns the business inbox (vendor-context chats where the
// caller is the vendor); anything else returns the client inbox.
export const getUserChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = req.query.scope === "vendor" ? "vendor" : "client";

    const cacheKey = `user_chats_${userId}_${scope}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const chats = await ChatService.getUserChats(userId, scope);

    const response = { chats, count: chats.length };
    setCache(cacheKey, response, 30); // 30s TTL
    res.status(200).json(response);
  } catch (error) {
    console.error("Get user chats error:", error);
    res.status(500).json({ message: "Error fetching chats", error: error.message });
  }
};

// Get a specific chat by ID
export const getChatById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId)
      .populate('participants', 'username email profilePicture isVendor businessName businessPicture')
      .populate('admins', 'username email profilePicture')
      .populate('pendingInvites.user', 'username email profilePicture')
      .populate('pendingInvites.invitedBy', 'username email profilePicture')
      .populate('event', 'title date location image createdBy')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username profilePicture' }
      })
      .populate({
        path: 'pinnedMessage',
        populate: { path: 'sender', select: 'username profilePicture' }
      });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Participants always have access; a user with a pending invite may open the
    // chat to accept or decline (they just won't see the message history yet).
    const isParticipant = chat.participants.some(p => p._id.toString() === userId);
    const isInvited = (chat.pendingInvites || []).some(
      inv => inv.user && inv.user._id.toString() === userId
    );
    if (!isParticipant && !isInvited) {
      return res.status(403).json({ message: "You don't have access to this chat" });
    }

    res.status(200).json({ chat });
  } catch (error) {
    console.error("Get chat error:", error);
    res.status(500).json({ message: "Error fetching chat", error: error.message });
  }
};

// Send a message in a chat
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const messageData = req.body;

    const message = await ChatService.sendMessage(chatId, userId, messageData);

    // Only invalidate sender's cache — recipients get real-time updates via socket
    invalidateCachePattern(`user_chats_${userId}`);
    res.status(201).json({
      message: "Message sent successfully",
      data: message
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: error.message || "Error sending message" });
  }
};

// Get messages for a chat
export const getChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    // `since` (ISO 8601 or epoch ms) switches to delta mode — only messages
    // newer than the client's local copy. An unparseable value is ignored
    // rather than 400'd, so a bad clock degrades to a normal page-1 fetch.
    const sinceRaw = req.query.since;
    const sinceDate = sinceRaw ? new Date(/^\d+$/.test(sinceRaw) ? Number(sinceRaw) : sinceRaw) : null;
    const since = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate : null;

    const result = await ChatService.getChatMessages(chatId, userId, page, limit, since);

    res.status(200).json(result);
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: error.message || "Error fetching messages" });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    await ChatService.markMessagesAsRead(chatId, userId);

    invalidateCachePattern(`user_chats_${userId}`);
    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ message: error.message || "Error marking messages as read" });
  }
};

// Delete a message for everyone (sender only)
export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    await ChatService.deleteMessage(messageId, userId);

    // Previews may have changed for every participant.
    invalidateCachePattern('user_chats_');
    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Delete message error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error deleting message" });
  }
};

// Edit a text message (sender only, within 10 minutes)
export const editMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await ChatService.editMessage(messageId, userId, content);

    invalidateCachePattern('user_chats_');
    res.status(200).json({ message: "Message updated", data: message });
  } catch (error) {
    console.error("Edit message error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error editing message" });
  }
};

// Delete (hide) a conversation for the authenticated user
export const deleteChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    await ChatService.deleteChatForUser(chatId, userId);

    invalidateCachePattern(`user_chats_${userId}`);
    res.status(200).json({ message: "Conversation deleted" });
  } catch (error) {
    console.error("Delete chat error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error deleting conversation" });
  }
};

// Update group chat name and/or image (admins only)
export const updateGroupChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { name, groupImage } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (chat.type !== "group") return res.status(400).json({ message: "Not a group chat" });

    // Only admins can update
    if (!chat.admins.some(a => a.toString() === userId)) {
      return res.status(403).json({ message: "Only group admins can update chat details" });
    }

    if (name && name.trim()) chat.name = name.trim();

    if (groupImage !== undefined) {
      if (groupImage && groupImage.startsWith("data:image")) {
        const { uploadBase64Image } = await import("../services/image.service.js");
        const result = await uploadBase64Image(groupImage, "group_images");
        chat.groupImage = result.url;
      } else {
        chat.groupImage = groupImage;
      }
    }

    await chat.save();

    const updated = await Chat.findById(chatId)
      .populate("participants", "username email profilePicture isVendor businessName businessPicture")
      .populate("admins", "username email profilePicture");

    // Broadcast update to all participants via socket
    const { getSocketInstance } = await import("../services/socket.service.js");
    const io = getSocketInstance();
    if (io) {
      io.to(`chat:${chatId}`).emit("group:updated", { chatId, name: chat.name, groupImage: chat.groupImage });
    }

    invalidateCachePattern('user_chats_');
    res.json({ message: "Group updated", chat: updated });
  } catch (error) {
    console.error("Update group chat error:", error);
    res.status(500).json({ message: "Error updating group chat", error: error.message });
  }
};

// Remove a participant from a group chat (admins only)
export const removeParticipantFromGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId, participantId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (chat.type !== "group") return res.status(400).json({ message: "Not a group chat" });

    if (!chat.admins.some((a) => a.toString() === userId)) {
      return res.status(403).json({ message: "Only group admins can remove members" });
    }
    if (participantId === userId) {
      return res.status(400).json({ message: "You can't remove yourself from the group" });
    }
    if (!chat.participants.some((p) => p.toString() === participantId)) {
      return res.status(404).json({ message: "User is not in this group" });
    }

    chat.participants = chat.participants.filter((p) => p.toString() !== participantId);
    chat.admins = chat.admins.filter((a) => a.toString() !== participantId);
    if (chat.unreadCount && typeof chat.unreadCount.delete === "function") {
      chat.unreadCount.delete(participantId);
    }
    await chat.save();

    const updated = await Chat.findById(chatId)
      .populate("participants", "username email profilePicture isVendor businessName businessPicture")
      .populate("admins", "username email profilePicture");

    // Notify the room (so the member list refreshes) and the removed user.
    const { getSocketInstance } = await import("../services/socket.service.js");
    const io = getSocketInstance();
    if (io) {
      io.to(`chat:${chatId}`).emit("group:updated", { chatId });
      io.to(`user:${participantId}`).emit("group:removed", { chatId });
    }

    invalidateCachePattern('user_chats_');
    res.json({ message: "Member removed", chat: updated });
  } catch (error) {
    console.error("Remove participant error:", error);
    res.status(500).json({ message: "Error removing member", error: error.message });
  }
};

// Invite users to a group chat (admins only). Invitees must accept before
// joining. Only applies to group chats that aren't tied to an event.
export const inviteUsersToGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { userIds } = req.body;

    const result = await ChatService.inviteUsersToGroup(chatId, userId, userIds);

    invalidateCachePattern('user_chats_');
    res.status(200).json({
      message: `Invite sent to ${result.invitedCount} ${result.invitedCount === 1 ? "person" : "people"}`,
      chat: result.chat,
      skipped: result.skipped
    });
  } catch (error) {
    console.error("Invite to group error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error inviting members" });
  }
};

// Respond to a pending group invite (the invited user accepts or declines)
export const respondToGroupInvite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { accept } = req.body;

    const chat = await ChatService.respondToGroupInvite(chatId, userId, !!accept);

    invalidateCachePattern('user_chats_');
    res.status(200).json({
      message: accept ? "You've joined the group" : "Invite declined",
      chat
    });
  } catch (error) {
    console.error("Respond to group invite error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error responding to invite" });
  }
};

// Toggle a reaction on a message
export const toggleMessageReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await ChatService.toggleMessageReaction(messageId, userId, emoji);
    res.status(200).json({ message: "Reaction toggled", data: message });
  } catch (error) {
    console.error("Toggle reaction error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error toggling reaction" });
  }
};

// Pin / unpin a chat
export const setChatPinned = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { pinned } = req.body;

    const chat = await ChatService.setChatPinned(chatId, userId, !!pinned);
    invalidateCachePattern(`user_chats_${userId}`);
    res.status(200).json({ message: "Chat pin updated", chat });
  } catch (error) {
    console.error("Pin chat error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error updating pin" });
  }
};

// Pin / unpin a message inside a chat
export const pinChatMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { messageId } = req.body; // null to unpin

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isParticipant = chat.participants.some((p) => p.toString() === userId);
    if (!isParticipant) return res.status(403).json({ message: "Not a participant" });

    chat.pinnedMessage = messageId || null;
    await chat.save();

    const updated = await Chat.findById(chatId)
      .populate("participants", "username email profilePicture isVendor businessName businessPicture")
      .populate("admins", "username email profilePicture")
      .populate({
        path: "pinnedMessage",
        populate: { path: "sender", select: "username profilePicture" },
      });

    const { getSocketInstance } = await import("../services/socket.service.js");
    const io = getSocketInstance();
    if (io) {
      io.to(`chat:${chatId}`).emit("chat:pinnedMessage", {
        chatId,
        pinnedMessage: updated.pinnedMessage || null,
      });
    }

    res.status(200).json({ message: messageId ? "Message pinned" : "Message unpinned", chat: updated });
  } catch (error) {
    console.error("Pin message error:", error);
    res.status(500).json({ message: error.message || "Error pinning message" });
  }
};

// Mute / unmute a chat
export const setChatMuted = async (req, res) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { muted } = req.body;

    const chat = await ChatService.setChatMuted(chatId, userId, !!muted);
    invalidateCachePattern(`user_chats_${userId}`);
    res.status(200).json({ message: "Chat mute updated", chat });
  } catch (error) {
    console.error("Mute chat error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Error updating mute" });
  }
};

// Search chats and messages
export const searchChatsAndMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;
    const scope = req.query.scope === "vendor" ? "vendor" : "client";

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const results = await ChatService.searchChatsAndMessages(userId, query, scope);

    res.status(200).json(results);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Error searching", error: error.message });
  }
};
