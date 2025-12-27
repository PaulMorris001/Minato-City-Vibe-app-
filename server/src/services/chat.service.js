import Chat from "../models/chat.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { emitNewMessage, getSocketInstance } from "./socket.service.js";
import { uploadBase64Image, deleteImage } from "./image.service.js";

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
  async createGroupChat(name, participantIds, adminId, groupImage = "") {
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
      isMuted
    });

    await chat.save();
    await chat.populate('participants', 'username email profilePicture');
    await chat.populate('admins', 'username email profilePicture');

    return chat;
  }

  /**
   * Get all chats for a user
   */
  async getUserChats(userId) {
    const chats = await Chat.find({
      participants: userId,
      isActive: true
    })
      .populate('participants', 'username email profilePicture')
      .populate('admins', 'username email profilePicture')
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
    const { type, content, imageUrl, eventId, replyTo } = messageData;

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

    // Create message
    const message = new Message({
      chat: chatId,
      sender: senderId,
      type: type || 'text',
      content,
      imageUrl: finalImageUrl,
      event: eventId,
      replyTo
    });

    await message.save();

    // Update chat's last message and unread counts
    chat.lastMessage = message._id;

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
    await message.populate('replyTo');
    await message.populate('event');

    // Emit message via Socket.IO to chat participants
    emitNewMessage(chatId.toString(), message);

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
      .populate('replyTo')
      .populate('event');

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
   * Delete message for user
   */
  async deleteMessageForUser(messageId, userId) {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (!message.deletedFor.includes(userId)) {
      message.deletedFor.push(userId);
      await message.save();
    }

    return { success: true };
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
