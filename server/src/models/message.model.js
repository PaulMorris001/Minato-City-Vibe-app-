import mongoose from "mongoose";

const messageSchema = mongoose.Schema({
  // Reference to the chat this message belongs to
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "chat",
    required: true
  },

  // Sender of the message
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },

  // Message content and type
  type: {
    type: String,
    enum: ['text', 'image', 'event', 'guide', 'system'],
    default: 'text'
  },

  content: {
    type: String,
    required: function() {
      return this.type === 'text' || this.type === 'system';
    }
  },

  // For image messages
  imageUrl: {
    type: String,
    required: function() {
      return this.type === 'image';
    }
  },

  // For event sharing
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "event"
  },

  // For guide sharing
  guide: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "guide"
  },

  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },

  // Read by (for group chats)
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user"
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "message"
  },

  // Deleted status
  isDeleted: {
    type: Boolean,
    default: false
  },

  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Edited status
  isEdited: {
    type: Boolean,
    default: false
  },

  editedAt: {
    type: Date
  },

  // Emoji reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for performance
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ status: 1 });

export default mongoose.model("message", messageSchema);
