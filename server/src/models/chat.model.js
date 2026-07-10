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

  // Whether this direct chat is a personal conversation or a client↔business
  // conversation. Group chats are always 'personal'. Legacy docs lack this
  // field, so queries must treat missing as personal (contextType: { $ne: 'vendor' }).
  contextType: {
    type: String,
    enum: ['personal', 'vendor'],
    default: 'personal'
  },

  // For contextType='vendor': the participant being contacted as a business.
  // Their vendor dashboard shows this chat; the other participant sees it in
  // their client inbox.
  vendorUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    default: null
  },

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

  // Pending invites for group chats. A user added by an admin lands here first
  // and must accept before being moved into `participants`. Used only for group
  // chats that aren't tied to an event (event groups auto-enroll members).
  pendingInvites: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user"
    },
    invitedAt: {
      type: Date,
      default: Date.now
    }
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

  // A single pinned message visible at the top of the chat for all participants
  pinnedMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "message",
    default: null
  },

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

  // Users who have deleted (hidden) this chat from their inbox.
  // Cleared on new activity so the conversation re-surfaces with new messages.
  deletedFor: [{
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
chatSchema.index({ participants: 1, contextType: 1, vendorUser: 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ "pendingInvites.user": 1 });

// Virtual for getting the other participant in direct chats
chatSchema.virtual('otherParticipant').get(function() {
  if (this.type === 'direct' && this.participants.length === 2) {
    // This would need the current user ID to be passed in
    return this.participants;
  }
  return null;
});

export default mongoose.model("chat", chatSchema);
