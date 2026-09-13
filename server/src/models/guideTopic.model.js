import mongoose from "mongoose";

/**
 * One selectable "Topic" a guide can be tagged with (Chefs, Concerts, Travel
 * guide, ...). Admin-managed (see admin.controller.js's getGuideTopicsAdmin /
 * createGuideTopic / deleteGuideTopic) so a new topic can be added without an
 * app release — mirrors how VendorType works for vendor categories.
 *
 * Guide.topic itself stays a plain string, not a ref to this collection:
 * deleting a topic here must not orphan or break guides already tagged with
 * it. guide.controller.js validates a submitted topic against this
 * collection's current names on create/update instead.
 */
const guideTopicSchema = mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // Shown next to the topic in guide listings. Optional — the mobile client
    // falls back to a generic icon when empty, so an admin-added topic works
    // immediately without needing one picked first.
    emoji: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("guideTopic", guideTopicSchema);
