import mongoose from "mongoose";

/**
 * One selectable event category (Party, Music, Food & Drink, ...). Admin-managed
 * (see admin.controller.js's getEventCategoriesAdmin / createEventCategory /
 * deleteEventCategory) so a category can be added without an app release —
 * same shape as GuideTopic and VendorType.
 *
 * Event.category stays a plain string, not a ref: deleting a category here must
 * not orphan or break events already tagged with it. event.controller.js
 * validates a submitted category against this collection's current names on
 * create/update instead.
 */
const eventCategorySchema = mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // Optional — clients fall back to showing the name alone.
    emoji: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("eventCategory", eventCategorySchema);
