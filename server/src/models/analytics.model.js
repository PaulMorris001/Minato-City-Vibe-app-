import mongoose from "mongoose";

const analyticsLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  event: { type: String, required: true, index: true },
  properties: { type: mongoose.Schema.Types.Mixed, default: {} },
  platform: { type: String },
  osVersion: { type: String },
  appVersion: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("AnalyticsLog", analyticsLogSchema);
