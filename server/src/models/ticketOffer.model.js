import mongoose from "mongoose";

const ticketOfferSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: "event", required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  chat: { type: mongoose.Schema.Types.ObjectId, ref: "chat", required: true },
  eventTitle: { type: String, required: true },
  ticketName: { type: String, required: true },
  subEvent: { type: mongoose.Schema.Types.ObjectId, default: null },
  tierId: { type: mongoose.Schema.Types.ObjectId, default: null },
  locationIndex: { type: Number },
  locationName: { type: String },
  locationCity: { type: String },
  eventDate: { type: Date },
  quantity: { type: Number, required: true, min: 1, max: 20 },
  currency: { type: String, required: true },
  standardPrice: { type: Number, required: true },
  offeredPrice: { type: Number, required: true },
  finalPrice: { type: Number },
  note: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["requested", "quoted", "declined", "cancelled"], default: "requested" },
}, { timestamps: true });

ticketOfferSchema.index({ buyer: 1, event: 1, createdAt: -1 });
export default mongoose.model("ticketOffer", ticketOfferSchema);
