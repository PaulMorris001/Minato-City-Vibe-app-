import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Notification from "../models/notification.model.js";
import { emitNewMessage, getSocketInstance } from "./socket.service.js";
import { uploadBase64Image, deleteImage } from "./image.service.js";
import { sendPushNotification } from "./notification.service.js";
import { areMutualFollows } from "../utils/followCheck.js";

/**
 * Chat Service - Business logic layer for chat operations
 * Handles complex operations and keeps controllers thin
 */

class ChatService {
  /**
   * Create or get existing direct chat between two users.
   *
   * context 'personal' (default) is a regular user-to-user chat.
   * context 'vendor' is a client↔business conversation: vendorUserId is the
   * participant acting as the business. The same pair of users can hold one
   * personal chat and one vendor chat — they are separate conversations.
   */
  async getOrCreateDirectChat(userId1, userId2, { context = 'personal', vendorUserId = null } = {}) {
    const isVendorContext = context === 'vendor';

    // Check if chat already exists. Legacy docs have no contextType, so
    // personal lookups match on "not vendor" rather than an exact value.
    let chat = await Chat.findOne({
      type: 'direct',
      participants: { $all: [userId1, userId2], $size: 2 },
      isActive: true,
      ...(isVendorContext
        ? { contextType: 'vendor', vendorUser: vendorUserId }
        : { contextType: { $ne: 'vendor' } })
    })
      .populate('participants', 'username email profilePicture isVendor businessName')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username profilePicture' }
      });

    if (!chat) {
      let allowed = false;
      let denialMessage = "You can only chat with mutual follows. Both users must follow each other.";

      if (isVendorContext && vendorUserId.toString() === userId2.toString()) {
        // Initiator is contacting a business — no follow relationship required,
        // but the target must actually be a vendor.
        const vendor = await User.findById(vendorUserId).select('isVendor');
        allowed = !!vendor?.isVendor;
        denialMessage = "This user is not a vendor.";
      } else if (isVendorContext) {
        // Business reaching out to a user: allowed if they share a booking,
        // otherwise fall back to the mutual-follows rule (anti-spam).
        const { default: Booking } = await import("../models/booking.model.js");
        const hasBooking = await Booking.exists({
          $or: [
            { client: userId2, vendor: userId1 },
            { client: userId1, vendor: userId2 }
          ]
        });
        allowed = !!hasBooking || await areMutualFollows(userId1, userId2);
        denialMessage = "You can message clients who have booked with you or mutual follows.";
      } else {
        // Only mutual follows can start new personal direct chats
        allowed = await areMutualFollows(userId1, userId2);
      }

      if (!allowed) {
        const error = new Error(denialMessage);
        error.statusCode = 403;
        throw error;
      }

      // Create new chat
      chat = new Chat({
        type: 'direct',
        contextType: isVendorContext ? 'vendor' : 'personal',
        vendorUser: isVendorContext ? vendorUserId : null,
        participants: [userId1, userId2],
        unreadCount: new Map([[userId1.toString(), 0], [userId2.toString(), 0]]),
        isArchived: new Map([[userId1.toString(), false], [userId2.toString(), false]]),
        isMuted: new Map([[userId1.toString(), false], [userId2.toString(), false]])
      });

      await chat.save();
      await chat.populate('participants', 'username email profilePicture isVendor businessName');
    }

    return chat;
  }

  /**
   * Create a group chat
   */
  async createGroupChat(name, participantIds, adminId, groupImage = "", eventId = null) {
    // Ensure admin is in participants
    if (!participantIds.includes(adminId)) {
      participantIds.push(adminId);
    }

    const unreadCount = new Map();
    const isArchived = new Map();
    const isMuted = new Map();

    participantIds.forEach(id => {
      const idStr = id.toString();
      unreadCount.set(idStr, 0);
      isArchived.set(idStr, false);
      isMuted.set(idStr, false);
    });

    const chat = new Chat({
      type: 'group',
      name,
      participants: participantIds,
      admins: [adminId],
      groupImage,
      unreadCount,
      isArchived,
      isMuted,
      ...(eventId ? { event: eventId } : {})
    });

    await chat.save();
    await chat.populate('participants', 'username email profilePicture isVendor businessName');
    await chat.populate('admins', 'username email profilePicture');
    if (eventId) {
      await chat.populate('event', 'title date location image createdBy');
    }

    return chat;
  }

  /**
   * Get all chats for a user.
   *
   * mode 'client': everything except chats where the user is the business side
   *   (their inquiries TO vendors stay in their client inbox).
   * mode 'vendor': only chats where the user is being contacted as a business.
   * mode absent: all chats (legacy app behavior).
   */
  async getUserChats(userId, mode) {
    const modeFilter =
      mode === 'vendor'
        ? { contextType: 'vendor', vendorUser: userId }
        : mode === 'client'
          ? { $or: [{ contextType: { $ne: 'vendor' } }, { vendorUser: { $ne: userId } }] }
          : {};

    const chats = await Chat.find({
      $and: [
        {
          // Include groups the user has only been invited to (not yet a participant)
          // so the pending invite surfaces in their inbox where they can respond.
          $or: [
            { participants: userId },
            { "pendingInvites.user": userId }
          ]
        },
        modeFilter
      ],
      isActive: true,
      deletedFor: { $ne: userId }
    })
      .populate('participants', 'username email profilePicture isVendor businessName')
      .populate('admins', 'username email profilePicture')
      .populate('pendingInvites.user', 'username email profilePicture')
      .populate('pendingInvites.invitedBy', 'username email profilePicture')
      .populate('event', 'title date location image createdBy')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username profilePicture' }
      })
      .sort({ updatedAt: -1 });

    return chats;
  }

  /**
   * Send a message in a chat
   */
  async sendMessage(chatId, senderId, messageData) {
    const { type, content, imageUrl, eventId, guideId, replyTo } = messageData;

    // Verify chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.participants.includes(senderId)) {
      throw new Error('User is not a participant in this chat');
    }

    // Handle image upload to Cloudinary if it's a base64 image
    let finalImageUrl = imageUrl;
    if (type === 'image' && imageUrl) {
      if (imageUrl.startsWith('data:image')) {
        try {
          const result = await uploadBase64Image(imageUrl, 'chat_images');
          finalImageUrl = result.url;
        } catch (error) {
          console.error("Error uploading chat image to Cloudinary:", error);
          throw new Error("Failed to upload image");
        }
      }
      // If imageUrl doesn't start with 'data:image', it's already a Cloudinary URL
    }

    // Resolve @mentions in text messages against the chat's participants so we
    // only ever store real members (an @ typed against a stranger is ignored).
    let mentions = [];
    const mentionsAll = (type || 'text') === 'text' && !!content && /\@all\b/i.test(content);
    if ((type || 'text') === 'text' && content && content.includes('@')) {
      const lower = content.toLowerCase();
      const participantUsers = await User.find({
        _id: { $in: chat.participants },
      }).select('username');
      // Match the full "@username" (usernames may contain spaces/symbols, e.g.
      // "@setemi Loye"), so the whole name is captured rather than one word.
      mentions = participantUsers
        .filter((u) => u.username && lower.includes('@' + u.username.toLowerCase()))
        .map((u) => u._id);
    }

    // Create message
    const message = new Message({
      chat: chatId,
      sender: senderId,
      type: type || 'text',
      content,
      imageUrl: finalImageUrl,
      event: eventId,
      guide: guideId,
      replyTo,
      mentions
    });

    await message.save();

    // Update chat's last message and unread counts
    chat.lastMessage = message._id;

    // New activity re-surfaces the conversation for anyone who had deleted it.
    if (chat.deletedFor && chat.deletedFor.length) {
      chat.deletedFor = [];
    }

    // Increment unread count for all participants except sender
    chat.participants.forEach(participantId => {
      const participantIdStr = participantId.toString();
      if (participantIdStr !== senderId.toString()) {
        const currentCount = chat.unreadCount.get(participantIdStr) || 0;
        chat.unreadCount.set(participantIdStr, currentCount + 1);
      }
    });

    await chat.save();

    // Populate message data
    await message.populate('sender', 'username email profilePicture');
    await message.populate({
      path: 'replyTo',
      populate: { path: 'sender', select: 'username profilePicture' }
    });
    await message.populate('event');
    await message.populate('guide', 'title authorName city cityState topic price');

    // Emit message via Socket.IO to the active chat room
    emitNewMessage(chatId.toString(), message);

    // Also deliver to each participant's personal room so they receive
    // the message even when they're not inside the chat (e.g. on the chats list)
    const io = getSocketInstance();
    if (io) {
      chat.participants.forEach(participantId => {
        io.to(`user:${participantId.toString()}`).emit("message:new", message);
      });
    }

    // Push notification to each recipient (fires even when app is in background)
    const senderName = message.sender.username;
    const isGroup = chat.type === 'group';
    const notificationTitle = isGroup && chat.name ? chat.name : senderName;
    const rawContent = message.type === "image" ? "📷 Photo" : (message.content || "");

    const mentionedIds = new Set(mentions.map((id) => id.toString()));

    for (const participantId of chat.participants) {
      if (participantId.toString() === senderId.toString()) continue;
      const recipient = await User.findById(participantId).select("fcmToken");
      if (!recipient?.fcmToken) continue;

      let body;
      if (mentionsAll) {
        body = `${senderName} mentioned all: ${rawContent}`;
      } else if (mentionedIds.has(participantId.toString())) {
        body = `${senderName} mentioned you: ${rawContent}`;
      } else {
        body = isGroup ? `${senderName}: ${rawContent}` : rawContent;
      }

      await sendPushNotification(
        recipient.fcmToken,
        notificationTitle,
        body,
        { type: "new_message", chatId: chatId.toString() }
      );
    }

    return message;
  }

  /**
   * Get messages for a chat with pagination
   */
  async getChatMessages(chatId, userId, page = 1, limit = 50) {
    // Verify user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.participants.includes(userId)) {
      // A user who only has a pending invite may open the chat to respond, but
      // shouldn't read the history until they accept and join the group.
      const isInvited = (chat.pendingInvites || []).some(
        (inv) => inv.user.toString() === userId.toString()
      );
      if (isInvited) {
        return {
          messages: [],
          pagination: { page, limit, total: 0, totalPages: 0 }
        };
      }
      throw new Error('User is not a participant in this chat');
    }

    const skip = (page - 1) * limit;

    const messages = await Message.find({
      chat: chatId,
      isDeleted: false,
      deletedFor: { $ne: userId }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username email profilePicture')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username profilePicture' }
      })
      .populate('event')
      .populate('guide', 'title authorName city cityState topic price')
      .populate('reactions.user', 'username profilePicture');

    const total = await Message.countDocuments({
      chat: chatId,
      isDeleted: false,
      deletedFor: { $ne: userId }
    });

    return {
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(chatId, userId) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Reset unread count for user
    chat.unreadCount.set(userId.toString(), 0);
    await chat.save();

    // Update message status
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        status: { $ne: 'read' }
      },
      {
        status: 'read',
        $addToSet: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    // Emit socket event to notify chat participants
    const io = getSocketInstance();
    if (io) {
      io.to(`chat:${chatId}`).emit("message:read", {
        chatId: chatId.toString(),
        readerId: userId.toString()
      });
    }

    return { success: true };
  }

  /**
   * Delete a message for everyone. Only the sender may delete their own message.
   * Soft-deletes (isDeleted) so it's filtered everywhere, and broadcasts so the
   * message disappears in real time for everyone in the chat.
   */
  async deleteMessage(messageId, userId) {
    const message = await Message.findById(messageId);
    if (!message) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      throw err;
    }

    if (message.sender.toString() !== userId.toString()) {
      const err = new Error('You can only delete your own messages');
      err.statusCode = 403;
      throw err;
    }

    message.isDeleted = true;
    await message.save();

    // If this was the chat's preview message, repoint it to the previous
    // visible one so the inbox list doesn't show a deleted message.
    const chat = await Chat.findById(message.chat);
    if (chat && chat.lastMessage && chat.lastMessage.toString() === message._id.toString()) {
      const prev = await Message.findOne({
        chat: chat._id,
        isDeleted: false,
        _id: { $ne: message._id }
      }).sort({ createdAt: -1 });
      chat.lastMessage = prev ? prev._id : undefined;
      await chat.save();
    }

    const io = getSocketInstance();
    if (io) {
      const payload = {
        chatId: message.chat.toString(),
        messageId: message._id.toString()
      };
      io.to(`chat:${message.chat.toString()}`).emit("message:deleted", payload);
      // Personal rooms so the chat-list preview refreshes even when the
      // recipient isn't inside the conversation.
      if (chat) {
        chat.participants.forEach((pid) => {
          io.to(`user:${pid.toString()}`).emit("message:deleted", payload);
        });
      }
    }

    return { success: true };
  }

  /**
   * Edit a text message. Sender-only, text-only, within a 10 minute window.
   */
  async editMessage(messageId, userId, content) {
    if (!content || !content.trim()) {
      const err = new Error('Message content is required');
      err.statusCode = 400;
      throw err;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      const err = new Error('Message not found');
      err.statusCode = 404;
      throw err;
    }

    if (message.sender.toString() !== userId.toString()) {
      const err = new Error('You can only edit your own messages');
      err.statusCode = 403;
      throw err;
    }

    if (message.type !== 'text') {
      const err = new Error('Only text messages can be edited');
      err.statusCode = 400;
      throw err;
    }

    const EDIT_WINDOW_MS = 10 * 60 * 1000;
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
      const err = new Error('This message can no longer be edited (10 minute limit).');
      err.statusCode = 403;
      throw err;
    }

    message.content = content.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('sender', 'username email profilePicture');
    await message.populate({
      path: 'replyTo',
      populate: { path: 'sender', select: 'username profilePicture' }
    });
    await message.populate('event');
    await message.populate('guide', 'title authorName city cityState topic price');
    await message.populate('reactions.user', 'username profilePicture');

    const io = getSocketInstance();
    if (io) {
      io.to(`chat:${message.chat.toString()}`).emit("message:edited", {
        chatId: message.chat.toString(),
        message
      });
    }

    return message;
  }

  /**
   * Delete (hide) a conversation for one user. Their existing messages are
   * cleared from their view and the chat drops out of their inbox until new
   * activity re-surfaces it. Other participants are unaffected.
   */
  async deleteChatForUser(chatId, userId) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const err = new Error('Chat not found');
      err.statusCode = 404;
      throw err;
    }

    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      const err = new Error("You don't have access to this chat");
      err.statusCode = 403;
      throw err;
    }

    if (!chat.deletedFor.some(u => u.toString() === userId.toString())) {
      chat.deletedFor.push(userId);
    }
    chat.unreadCount.set(userId.toString(), 0);
    await chat.save();

    // Clear existing messages for this user so a re-surfaced chat starts clean.
    await Message.updateMany(
      { chat: chatId },
      { $addToSet: { deletedFor: userId } }
    );

    return { success: true };
  }

  /**
   * Toggle a reaction on a message (add if absent, remove if same user+emoji present)
   * Server-enforced: each user can have at most one reaction per message; sending a
   * different emoji replaces the previous one.
   */
  async toggleMessageReaction(messageId, userId, emoji) {
    if (!emoji || typeof emoji !== "string") {
      const err = new Error("Emoji is required");
      err.statusCode = 400;
      throw err;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      const err = new Error("Message not found");
      err.statusCode = 404;
      throw err;
    }

    // Verify user is participant of the chat
    const chat = await Chat.findById(message.chat);
    if (!chat || !chat.participants.some(p => p.toString() === userId.toString())) {
      const err = new Error("You don't have access to this chat");
      err.statusCode = 403;
      throw err;
    }

    const userIdStr = userId.toString();
    const existing = message.reactions.find(r => r.user.toString() === userIdStr);

    if (existing && existing.emoji === emoji) {
      // Same user + same emoji → toggle off
      message.reactions = message.reactions.filter(r => r.user.toString() !== userIdStr);
    } else if (existing) {
      // Different emoji from same user → replace
      existing.emoji = emoji;
      existing.createdAt = new Date();
    } else {
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();
    await message.populate('reactions.user', 'username profilePicture');

    const io = getSocketInstance();
    if (io) {
      io.to(`chat:${message.chat.toString()}`).emit("message:reaction", {
        chatId: message.chat.toString(),
        messageId: message._id.toString(),
        reactions: message.reactions
      });
    }

    return message;
  }

  /**
   * Pin / unpin a chat for a user. Limit: 3 pinned per user.
   */
  async setChatPinned(chatId, userId, pinned) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const err = new Error("Chat not found");
      err.statusCode = 404;
      throw err;
    }
    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      const err = new Error("You don't have access to this chat");
      err.statusCode = 403;
      throw err;
    }

    const userIdStr = userId.toString();
    const isPinned = chat.pinnedBy.some(p => p.toString() === userIdStr);

    if (pinned && !isPinned) {
      // Enforce limit
      const pinnedCount = await Chat.countDocuments({ pinnedBy: userId });
      if (pinnedCount >= 3) {
        const err = new Error("You can pin at most 3 chats");
        err.statusCode = 400;
        throw err;
      }
      chat.pinnedBy.push(userId);
    } else if (!pinned && isPinned) {
      chat.pinnedBy = chat.pinnedBy.filter(p => p.toString() !== userIdStr);
    }

    await chat.save();

    const io = getSocketInstance();
    if (io) {
      io.to(`user:${userIdStr}`).emit("chat:pinned", {
        chatId: chat._id.toString(),
        pinned: chat.pinnedBy.some(p => p.toString() === userIdStr)
      });
    }

    return chat;
  }

  /**
   * Mute / unmute a chat for a user.
   */
  async setChatMuted(chatId, userId, muted) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const err = new Error("Chat not found");
      err.statusCode = 404;
      throw err;
    }
    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      const err = new Error("You don't have access to this chat");
      err.statusCode = 403;
      throw err;
    }

    chat.isMuted.set(userId.toString(), !!muted);
    await chat.save();

    const io = getSocketInstance();
    if (io) {
      io.to(`user:${userId.toString()}`).emit("chat:muted", {
        chatId: chat._id.toString(),
        muted: !!muted
      });
    }

    return chat;
  }

  /**
   * Post a system message ("X invited Y", "Z joined", …) into a chat and
   * broadcast it like a normal message so it shows up live for everyone.
   * `actorId` is stored as the sender (the schema requires one) but the bubble
   * renders centered without attribution for `system` messages.
   */
  async postSystemMessage(chat, actorId, content) {
    const message = new Message({
      chat: chat._id,
      sender: actorId,
      type: 'system',
      content
    });
    await message.save();

    chat.lastMessage = message._id;
    if (chat.deletedFor && chat.deletedFor.length) {
      chat.deletedFor = [];
    }
    chat.participants.forEach((participantId) => {
      const idStr = participantId.toString();
      if (idStr !== actorId.toString()) {
        const current = chat.unreadCount.get(idStr) || 0;
        chat.unreadCount.set(idStr, current + 1);
      }
    });
    await chat.save();

    await message.populate('sender', 'username email profilePicture');

    emitNewMessage(chat._id.toString(), message);
    const io = getSocketInstance();
    if (io) {
      chat.participants.forEach((participantId) => {
        io.to(`user:${participantId.toString()}`).emit("message:new", message);
      });
    }

    return message;
  }

  /**
   * Invite one or more users to a (non-event) group chat. Invitees are added to
   * `pendingInvites` and must accept before joining. Each invite posts a system
   * message, fires a notification, and emits a realtime `group:invite` event.
   * Only group admins may invite, and only mutual follows can be invited.
   */
  async inviteUsersToGroup(chatId, adminId, userIds) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const err = new Error("Chat not found");
      err.statusCode = 404;
      throw err;
    }
    if (chat.type !== "group") {
      const err = new Error("Not a group chat");
      err.statusCode = 400;
      throw err;
    }
    if (chat.event) {
      const err = new Error("Members of an event group are managed through the event");
      err.statusCode = 400;
      throw err;
    }
    if (!chat.admins.some((a) => a.toString() === adminId.toString())) {
      const err = new Error("Only group admins can add members");
      err.statusCode = 403;
      throw err;
    }

    const ids = Array.isArray(userIds) ? [...new Set(userIds.map(String))] : [];
    if (ids.length === 0) {
      const err = new Error("Select at least one person to add");
      err.statusCode = 400;
      throw err;
    }

    const admin = await User.findById(adminId).select("username");
    const invited = [];
    const skipped = [];

    for (const targetId of ids) {
      if (chat.participants.some((p) => p.toString() === targetId)) {
        skipped.push({ userId: targetId, reason: "already a member" });
        continue;
      }
      if ((chat.pendingInvites || []).some((inv) => inv.user.toString() === targetId)) {
        skipped.push({ userId: targetId, reason: "already invited" });
        continue;
      }
      const isMutual = await areMutualFollows(adminId, targetId);
      if (!isMutual) {
        skipped.push({ userId: targetId, reason: "not a mutual follow" });
        continue;
      }
      const targetUser = await User.findById(targetId).select("username fcmToken");
      if (!targetUser) {
        skipped.push({ userId: targetId, reason: "user not found" });
        continue;
      }

      chat.pendingInvites.push({ user: targetId, invitedBy: adminId });
      invited.push(targetUser);
    }

    if (invited.length === 0) {
      const err = new Error(
        skipped[0]?.reason
          ? `Couldn't add anyone (${skipped[0].reason})`
          : "Couldn't add the selected people"
      );
      err.statusCode = 400;
      throw err;
    }

    await chat.save();

    // System message in the group so existing members see who was invited.
    const names = invited.map((u) => u.username).join(", ");
    await this.postSystemMessage(
      chat,
      adminId,
      `${admin?.username || "An admin"} invited ${names} to the group`
    );

    // Notify + realtime-ping each invitee so the invite reaches them.
    const io = getSocketInstance();
    for (const target of invited) {
      try {
        await Notification.create({
          user: target._id,
          type: "group_invite",
          title: "Group Invitation",
          body: `${admin?.username || "Someone"} invited you to join "${chat.name}"`,
          data: { chatId: chat._id.toString() }
        });
      } catch (e) {
        console.error("group_invite notification error:", e);
      }
      if (io) {
        io.to(`user:${target._id.toString()}`).emit("group:invite", {
          chatId: chat._id.toString(),
          groupName: chat.name,
          inviterUsername: admin?.username || "Someone"
        });
      }
      if (target.fcmToken) {
        await sendPushNotification(
          target.fcmToken,
          "Group Invitation",
          `${admin?.username || "Someone"} invited you to join "${chat.name}"`,
          { type: "group_invite", chatId: chat._id.toString() }
        );
      }
    }

    const updated = await Chat.findById(chatId)
      .populate("participants", "username email profilePicture isVendor businessName")
      .populate("admins", "username email profilePicture")
      .populate("pendingInvites.user", "username email profilePicture")
      .populate("pendingInvites.invitedBy", "username email profilePicture");

    return { chat: updated, invitedCount: invited.length, skipped };
  }

  /**
   * Accept or decline a pending group invite. On accept the user is moved into
   * `participants`; on decline they're simply dropped from `pendingInvites`.
   */
  async respondToGroupInvite(chatId, userId, accept) {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      const err = new Error("Chat not found");
      err.statusCode = 404;
      throw err;
    }

    const userIdStr = userId.toString();
    const hasInvite = (chat.pendingInvites || []).some(
      (inv) => inv.user.toString() === userIdStr
    );
    if (!hasInvite) {
      const err = new Error("No pending invite found for this group");
      err.statusCode = 400;
      throw err;
    }

    // Remove the pending invite regardless of the response.
    chat.pendingInvites = chat.pendingInvites.filter(
      (inv) => inv.user.toString() !== userIdStr
    );

    const io = getSocketInstance();

    if (accept) {
      if (!chat.participants.some((p) => p.toString() === userIdStr)) {
        chat.participants.push(userId);
      }
      chat.unreadCount.set(userIdStr, 0);
      if (chat.isArchived) chat.isArchived.set(userIdStr, false);
      if (chat.isMuted) chat.isMuted.set(userIdStr, false);
      await chat.save();

      // If this group is linked to an event, also add the user to the event
      if (chat.event) {
        await Event.findByIdAndUpdate(chat.event, {
          $addToSet: { invitedUsers: userId },
          $pull: { pendingInvites: userId },
        });
      }

      const joiner = await User.findById(userId).select("username");
      await this.postSystemMessage(
        chat,
        userId,
        `${joiner?.username || "Someone"} joined the group`
      );

      if (io) {
        io.to(`chat:${chatId}`).emit("group:updated", { chatId: chatId.toString() });
      }
    } else {
      await chat.save();
      if (io) {
        io.to(`user:${userIdStr}`).emit("group:removed", { chatId: chatId.toString() });
      }
    }

    const updated = await Chat.findById(chatId)
      .populate("participants", "username email profilePicture isVendor businessName")
      .populate("admins", "username email profilePicture")
      .populate("pendingInvites.user", "username email profilePicture")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username profilePicture" }
      });

    return updated;
  }

  /**
   * Search chats and messages
   */
  async searchChatsAndMessages(userId, query) {
    // Search in chat names
    const chats = await Chat.find({
      participants: userId,
      isActive: true,
      $or: [
        { name: { $regex: query, $options: 'i' } }
      ]
    })
      .populate('participants', 'username email profilePicture isVendor businessName')
      .limit(10);

    // Search in messages
    const messages = await Message.find({
      chat: { $in: await Chat.find({ participants: userId }).distinct('_id') },
      type: 'text',
      content: { $regex: query, $options: 'i' },
      isDeleted: false,
      deletedFor: { $ne: userId }
    })
      .populate('sender', 'username email profilePicture')
      .populate('chat')
      .limit(20)
      .sort({ createdAt: -1 });

    return { chats, messages };
  }
}

export default new ChatService();
