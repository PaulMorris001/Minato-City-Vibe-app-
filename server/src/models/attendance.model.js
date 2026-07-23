import mongoose from "mongoose";
import crypto from "crypto";

/**
 * An event "pass" — a unified attendance record issued to a user when they RSVP
 * (free events) or buy a ticket (paid events). It carries the QR `code` that is
 * emailed to the user; the organizer scans it in-app to mark the holder as
 * attended.
 *
 * Passes come in two shapes:
 *   - RSVP passes (free events): one per (event, user) — a user who RSVPs twice
 *     reuses the same QR.
 *   - Ticket passes (paid events): one per TICKET, so a buyer can hold several
 *     tickets for one event (bought for themselves and/or gifted to others), each
 *     with its own QR emailed to that ticket's recipient.
 */
const attendanceSchema = mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "event",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // How the pass was issued.
    type: { type: String, enum: ["rsvp", "ticket"], required: true },

    // Link to the ticket, when this pass came from a paid purchase. Unique per
    // ticket (partial index below) so each ticket gets exactly one pass.
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: "ticket" },

    // Email the QR was sent to. For gifted tickets this is the recipient's
    // address (not the buyer's). Falls back to the pass owner's account email.
    recipientEmail: { type: String },

    // The opaque token embedded in the QR. High-entropy + unique, so it can't be
    // guessed or forged; the scanner sends it back and we look the pass up.
    code: { type: String, unique: true, required: true },

    // Attendance lifecycle. "issued" until scanned, then "attended".
    status: { type: String, enum: ["issued", "attended"], default: "issued" },
    attendedAt: { type: Date },
    // The organizer/admin who scanned the holder in.
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  },
  { timestamps: true }
);

// RSVP passes: one per (event, user). Partial index so ticket passes (which can
// legitimately repeat per (event, user) when someone buys several) are exempt.
attendanceSchema.index(
  { event: 1, user: 1 },
  { unique: true, partialFilterExpression: { type: "rsvp" } }
);
// Ticket passes: one pass per ticket.
attendanceSchema.index(
  { ticket: 1 },
  { unique: true, partialFilterExpression: { ticket: { $exists: true } } }
);
// NOTE: the previous non-partial unique index on { event, user } must be dropped
// in any existing database (run `Attendance.syncIndexes()` or drop it manually) —
// otherwise it will still block multiple ticket passes per (event, user).

/** Generate a fresh, unguessable QR code token. */
export function generatePassCode() {
  return crypto.randomBytes(24).toString("hex");
}

export default mongoose.model("attendance", attendanceSchema);
