import mongoose from "mongoose";

const reportSchema = mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    targetType: {
      type: String,
      enum: ["user", "event", "guide"],
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    reason: {
      type: String,
      enum: ["spam", "harassment", "hate", "sexual", "violence", "blocked", "other"],
      required: true,
    },
    details: { type: String, default: "" },
    status: {
      type: String,
      enum: ["open", "resolved", "dismissed"],
      default: "open",
    },
    action: {
      type: String,
      enum: ["removed_content", "banned_user", "dismissed", null],
      default: null,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1, status: 1 });

export default mongoose.model("report", reportSchema);
