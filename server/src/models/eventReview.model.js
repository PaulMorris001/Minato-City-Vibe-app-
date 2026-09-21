import mongoose from "mongoose";

// A participant may leave one review per event and can edit it later.
const eventReviewSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "event", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: "", maxlength: 500 },
  },
  { timestamps: true }
);

eventReviewSchema.index({ event: 1, user: 1 }, { unique: true });

export default mongoose.model("eventReview", eventReviewSchema);
