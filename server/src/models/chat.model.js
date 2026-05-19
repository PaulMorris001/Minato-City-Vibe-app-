import mongoose from "mongoose";

const chatSchema = mongoose.Schema({
  // Chat type: 'direct' for 1-on-1, 'group' for group chats
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },

  // Participants in the chat
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  }],

  // Group chat specific fields
  name: {
    type: String,
    required: function() {
      return this.type === 'group';
    }
  },

  groupImage: {
    type: String,
    default: ""
  },

  // Group admin(s)
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Last message in the chat (for chat list preview)
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "message"
  },

  // Unread count per user
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },

  // Chat settings
  isArchived: {
    type: Map,
    of: Boolean,
    default: {}
  },

  isMuted: {
    type: Map,
    of: Boolean,
    default: {}
  },

  // Users who have pinned this chat to the top of their inbox
  pinnedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // For event-linked group chats, the event this chat belongs to
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "event"
  },

  // For direct chats, track if blocked
  blockedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
chatSchema.index({ participants: 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ updatedAt: -1 });

// Virtual for getting the other participant in direct chats
chatSchema.virtual('otherParticipant').get(function() {
  if (this.type === 'direct' && this.participants.length === 2) {
    // This would need the current user ID to be passed in
    return this.participants;
  }
  return null;
});

export default mongoose.model("chat", chatSchema);
