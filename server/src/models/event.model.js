import mongoose from "mongoose";

const eventSchema = mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  image: { type: String, default: "" },
  description: { type: String, default: "" },

  // Creator of the event
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },

  // Confirmed attendees (accepted the invite or joined via link/purchase)
  invitedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Users who have been invited but have not yet responded
  pendingInvites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Event visibility
  isPublic: { type: Boolean, default: false },

  // Pricing options (only for public events)
  isPaid: { type: Boolean, default: false },
  ticketPrice: { type: Number, default: 0 },
  maxGuests: { type: Number, default: 0 },

  // Group chat for this event (auto-created when first user is invited)
  groupChatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "chat",
    default: null
  },

  // Shareable link token
  shareToken: { type: String, unique: true, sparse: true },

  // RSVP: users who confirmed attendance
  rsvpUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],

  // Vendors attached to this event by the creator
  vendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "vendor"
  }],

  // Event status
  isActive: { type: Boolean, default: true },

  // Prevents the 24-hour reminder from firing more than once
  reminderSent: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Generate share token before saving
eventSchema.pre('save', function(next) {
  if (!this.shareToken) {
    this.shareToken = new mongoose.Types.ObjectId().toString();
  }
  next();
});

export default mongoose.model("event", eventSchema);
