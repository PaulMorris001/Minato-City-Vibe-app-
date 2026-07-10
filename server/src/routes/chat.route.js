import express from "express";
import {
  getOrCreateDirectChat,
  createGroupChat,
  getUserChats,
  getChatById,
  sendMessage,
  getChatMessages,
  markMessagesAsRead,
  deleteMessage,
  editMessage,
  deleteChat,
  searchChatsAndMessages,
  updateGroupChat,
  removeParticipantFromGroup,
  inviteUsersToGroup,
  respondToGroupInvite,
  toggleMessageReaction,
  setChatPinned,
  setChatMuted,
  pinChatMessage,
} from "../controllers/chat.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

// ============ Chat Routes ============

// Get all chats for user
router.get("/chats", authenticate, getUserChats);

// Search chats and messages — must be registered before /chats/:chatId or
// Express matches "search" as a chatId and the request 500s on the ObjectId cast
router.get("/chats/search", authenticate, searchChatsAndMessages);

// Get or create direct chat
router.post("/chats/direct", authenticate, getOrCreateDirectChat);

// Create group chat
router.post("/chats/group", authenticate, createGroupChat);

// Get specific chat
router.get("/chats/:chatId", authenticate, getChatById);

// Update group chat name / image (admins only)
router.put("/chats/:chatId", authenticate, updateGroupChat);

// Remove a member from a group chat (admins only)
router.delete("/chats/:chatId/participants/:participantId", authenticate, removeParticipantFromGroup);

// Invite users to a group chat (admins only)
router.post("/chats/:chatId/invite", authenticate, inviteUsersToGroup);

// Respond to a pending group invite (accept / decline)
router.post("/chats/:chatId/invite/respond", authenticate, respondToGroupInvite);

// ============ Message Routes ============

// Send message in a chat
router.post("/chats/:chatId/messages", authenticate, sendMessage);

// Get messages for a chat
router.get("/chats/:chatId/messages", authenticate, getChatMessages);

// Mark messages as read
router.put("/chats/:chatId/read", authenticate, markMessagesAsRead);

// Delete message for everyone (sender only)
router.delete("/messages/:messageId", authenticate, deleteMessage);

// Edit a text message (sender only, within 10 minutes)
router.put("/messages/:messageId", authenticate, editMessage);

// Delete (hide) a conversation for the user
router.delete("/chats/:chatId", authenticate, deleteChat);

// Toggle reaction on a message
router.post("/messages/:messageId/reactions", authenticate, toggleMessageReaction);

// Pin / unpin chat
router.put("/chats/:chatId/pin", authenticate, setChatPinned);

// Mute / unmute chat
router.put("/chats/:chatId/mute", authenticate, setChatMuted);

// Pin / unpin a message inside a chat
router.put("/chats/:chatId/pin-message", authenticate, pinChatMessage);

export default router;
