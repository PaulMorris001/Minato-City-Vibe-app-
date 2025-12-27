/**
 * Socket Service - Real-time Communication Handler
 */

import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import config from "../config/env.js";

/**
 * Initialize Socket.io server
 *
 * @param {object} server - HTTP server instance
 */
export const initializeSocket = (server) => {
  const io = new Server(server, config.socket);

  // Store connected users
  const connectedUsers = new Map(); // userId -> socketId

  // Authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication error"));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      socket.userId = decoded.id;
      next();
    } catch (error) {
      next(new Error("Authentication error"));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {

    // Store user connection
    connectedUsers.set(socket.userId, socket.id);

    // Notify others that user is online
    socket.broadcast.emit("user:online", socket.userId);

    // Join user's personal room for direct messages
    socket.join(`user:${socket.userId}`);

    // ============ Chat Events ============

    // Join a chat room
    socket.on("chat:join", (chatId) => {
      socket.join(`chat:${chatId}`);
    });

    // Leave a chat room
    socket.on("chat:leave", (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // ============ Message Events ============

    // Message read
    socket.on("message:read", ({ chatId, userId }) => {
      // Emit to chat participants with readerId
      io.to(`chat:${chatId}`).emit("message:read", {
        chatId,
        readerId: userId
      });
    });

    // ============ Typing Events ============

    // User started typing
    socket.on("typing:start", ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit("typing:start", {
        chatId,
        userId: socket.userId,
      });
    });

    // User stopped typing
    socket.on("typing:stop", ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit("typing:stop", {
        chatId,
        userId: socket.userId,
      });
    });

    // ============ Disconnect ============

    socket.on("disconnect", () => {

      // Remove from connected users
      connectedUsers.delete(socket.userId);

      // Notify others that user is offline
      socket.broadcast.emit("user:offline", socket.userId);
    });
  });

  // Store the instance for use in controllers
  setSocketInstance(io);

  console.log("🔌 Socket.IO initialized");
  return io;
};

/**
 * Get Socket.io instance
 * Use this to emit events from controllers
 */
let socketInstance = null;

export const setSocketInstance = (io) => {
  socketInstance = io;
};

export const getSocketInstance = () => {
  return socketInstance;
};

/**
 * Emit new message to chat participants
 *
 * @param {string} chatId - Chat ID
 * @param {object} message - Message object
 */
export const emitNewMessage = (chatId, message) => {
  if (socketInstance) {
    socketInstance.to(`chat:${chatId}`).emit("message:new", message);
  }
};

/**
 * Emit message read status
 *
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID who read the message
 */
export const emitMessageRead = (chatId, userId) => {
  if (socketInstance) {
    socketInstance.to(`chat:${chatId}`).emit("message:read", { chatId, userId });
  }
};

/**
 * Check if user is online
 *
 * @param {string} userId - User ID to check
 * @returns {boolean} - Whether user is online
 */
export const isUserOnline = (userId) => {
  if (socketInstance) {
    const sockets = socketInstance.sockets.sockets;
    for (const [_, socket] of sockets) {
      if (socket.userId === userId) {
        return true;
      }
    }
  }
  return false;
};
