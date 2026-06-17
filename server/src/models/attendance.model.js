import mongoose from "mongoose";
import crypto from "crypto";

/**
 * An event "pass" — a unified attendance record issued to a user when they RSVP
 * (free events) or buy a ticket (paid events). It carries the QR `code` that is
 * emailed to the user; the organizer scans it in-app to mark the holder as
 * attended.
 *
 * One pass per (event, user) — enforced by the compound unique index — so a
 * ticket holder who also RSVPs doesn't get two QR codes.
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

    // Link to the ticket, when this pass came from a paid purchase.
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: "ticket" },

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

// One pass per user per event.
attendanceSchema.index({ event: 1, user: 1 }, { unique: true });

/** Generate a fresh, unguessable QR code token. */
export function generatePassCode() {
  return crypto.randomBytes(24).toString("hex");
}

export default mongoose.model("attendance", attendanceSchema);
