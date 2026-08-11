import mongoose from "mongoose";

/**
 * Per-event discount code. Codes are created ONLY by admins (admin portal);
 * the event's creator can see them and flip `disabledByCreator` on/off but
 * cannot create, edit, or delete. `isActive` is the admin's own kill switch —
 * a code is usable only when both flags allow it, the validity window is open,
 * and the redemption cap (if any) hasn't been reached. `redemptionCount` is
 * incremented atomically at payment init (reserve) and decremented if the
 * reservation goes stale, so "first 20" caps can't oversell.
 */
const discountCodeSchema = mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "event",
      required: true,
      index: true,
    },

    // Stored uppercase; buyers can type in any case.
    code: { type: String, required: true, uppercase: true, trim: true },

    // percent: value is 1-100. fixed: value is major units of the event currency.
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },

    // Validity window; either side unset = open-ended.
    startsAt: { type: Date },
    endsAt: { type: Date },

    // Total-redemption cap ("first 20"); unset = unlimited.
    maxRedemptions: { type: Number, min: 1 },
    redemptionCount: { type: Number, default: 0 },

    // Admin kill switch.
    isActive: { type: Boolean, default: true },

    // The event creator's own toggle (they can disable but not create).
    disabledByCreator: { type: Boolean, default: false },

    // Admin JWTs carry only a username, no user id — same attribution
    // convention as event.model pendingEdits.reviewedBy.
    createdByAdmin: { type: String, required: true },
  },
  { timestamps: true }
);

// One code text per event; the same text may exist on different events.
discountCodeSchema.index({ event: 1, code: 1 }, { unique: true });

export default mongoose.model("discountCode", discountCodeSchema);
