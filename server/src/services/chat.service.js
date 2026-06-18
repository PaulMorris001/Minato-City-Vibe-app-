import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
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
   * Create or get existing direct chat between two users
   */
  async getOrCreateDirectChat(userId1, userId2) {
    // Check if chat already exists
    let chat = await Chat.findOne({
      type: 'direct',
      participants: { $all: [userId1, userId2], $size: 2 },
      isActive: true
    })
      .populate('participants', 'username email profilePicture')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username profilePicture' }
      });

    if (!chat) {
      // Only mutual follows can start new direct chats
      const isMutual = await areMutualFollows(userId1, userId2);
      if (!isMutual) {
        const error = new Error("You can only chat with mutual follows. Both users must follow each other.");
        error.statusCode = 403;
        throw error;
      }

      // Create new chat
      chat = new Chat({
        type: 'direct',
        participants: [userId1, userId2],
        unreadCount: new Map([[userId1.toString(), 0], [userId2.toString(), 0]]),
        isArchived: new Map([[userId1.toString(), false], [userId2.toString(), false]]),
        isMuted: new Map([[userId1.toString(), false], [userId2.toString(), false]])
      });

      await chat.save();
      await chat.populate('participants', 'username email profilePicture');
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
    await chat.populate('participants', 'username email profilePicture');
    await chat.populate('admins', 'username email profilePicture');
    if (eventId) {
      await chat.populate('event', 'title date location image createdBy');
    }

    return chat;
  }

  /**
   * Get all chats for a user
   */
  async getUserChats(userId) {
    const chats = await Chat.find({
      participants: userId,
      isActive: true,
      deletedFor: { $ne: userId }
    })
      .populate('participants', 'username email profilePicture')
      .populate('admins', 'username email profilePicture')
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
    if ((type || 'text') === 'text' && content) {
      const tokens = [...content.matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase());
      if (tokens.length) {
        const participantUsers = await User.find({
          _id: { $in: chat.participants },
        }).select('username');
        mentions = participantUsers
          .filter((u) => u.username && tokens.includes(u.username.toLowerCase()))
          .map((u) => u._id);
      }
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
    const notificationBody = message.type === "image" ? "📷 Photo" : message.content;
    for (const participantId of chat.participants) {
      if (participantId.toString() === senderId.toString()) continue;
      const recipient = await User.findById(participantId).select("fcmToken");
      console.log(`[Chat Push] Recipient ${participantId} push token: ${recipient?.fcmToken ? "present" : "MISSING"}`);
      if (recipient?.fcmToken) {
        await sendPushNotification(
          recipient.fcmToken,
          message.sender.username,
          notificationBody,
          { type: "new_message", chatId: chatId.toString() }
        );
      }
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
      .populate('participants', 'username email profilePicture')
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
