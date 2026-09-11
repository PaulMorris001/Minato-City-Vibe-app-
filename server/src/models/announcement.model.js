import mongoose from "mongoose";

/**
 * A one-off broadcast an admin sent to the user base.
 *
 * The send itself is fire-and-forget through notifyUser(); this record exists
 * so the console can show what has already gone out — which is what stops the
 * same announcement being sent twice on a slow afternoon.
 */
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    // "all" — every non-banned account. "targeted" — the `targets` below.
    // "city" is the original single-city form, kept so old rows still render.
    audience: { type: String, enum: ["all", "city", "targeted"], default: "all" },
    city: { type: String, default: null },
    /**
     * Audience targets, OR-ed together: an account matching ANY of them is
     * included, so each target added makes the audience BIGGER rather than
     * narrower. States and cities are qualified by the country (and state)
     * they belong to, so "Lagos, Nigeria" can't sweep in a Lagos elsewhere.
     */
    targets: {
      countries: { type: [String], default: [] },
      states: {
        type: [{ _id: false, country: String, state: String }],
        default: [],
      },
      cities: {
        type: [{ _id: false, country: String, state: String, city: String }],
        default: [],
      },
      userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
      /** Derived cohorts (e.g. "vendors") — see getAnnouncementGroups. */
      groupIds: { type: [String], default: [] },
      /** Human summary, rendered straight into the history table. */
      summary: { type: String, default: "" },
    },
    // Optional in-app destination for the tap, e.g. "/event/<id>".
    deepLink: { type: String, default: "" },
    // Admin username string — the admin JWT carries no user id, same as
    // event.pendingEdits.reviewedBy.
    sentBy: { type: String },
    // Accounts the broadcast was addressed to, and how many we held a push
    // token for. Every recipient gets the in-app notification either way.
    recipientCount: { type: Number, default: 0 },
    pushedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Announcement", announcementSchema);
