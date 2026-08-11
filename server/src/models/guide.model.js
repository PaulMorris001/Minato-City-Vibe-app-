import mongoose from "mongoose";
import { mediaArrayLimit } from "../utils/mediaLimit.js";
import { slugify, generateUniqueSlug } from "../utils/slug.js";

const guideTopics = [
  "Chefs",
  "Food and Restaurants",
  "Music and Bands",
  "Bars and Clubs",
  "Casinos",
  "Concerts",
  "Events",
  "Transportation",
  "Venues",
  "Florists",
  "Decorations",
  "Desserts",
  "Beverages",
  "Grocery stores",
  "Museums",
  "Parks",
  "Hotels",
  "Spas",
  "Hair and Nail Salons",
  "Barber Shops"
];

const guideSectionSchema = mongoose.Schema({
  title: { type: String, required: true },
  rank: { type: Number, required: true },
  description: { type: String, required: true, maxlength: 3000 },
  /**
   * @deprecated Superseded by `media`. Sections held exactly one photo before
   * galleries and video shipped. Kept so guides written under the old shape
   * keep rendering — the controller reads `media` and falls back to `[image]`,
   * and writes both (media plus its first entry mirrored here) so any client
   * still reading `image` sees the cover.
   */
  image: { type: String, default: "" },
  // Photos and videos for this section, max MAX_MEDIA_ITEMS. Each entry is a
  // Cloudinary URL whose delivery path identifies the kind.
  media: {
    type: [String],
    default: [],
    validate: mediaArrayLimit("Section media"),
  },
});

const guideSchema = mongoose.Schema({
  title: { type: String, required: true },
  // Human-readable share slug generated from the title once at creation.
  // Never regenerated on title edits so already-shared links stay valid.
  // Unset (sparse) when the title has no latin characters — links fall back
  // to the _id.
  slug: { type: String, unique: true, sparse: true },
  coverImage: { type: String, default: "" }, // optional cover photo
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },
  authorName: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0, max: 100, validate: {
      validator: function(price) {
        return price <= 100;
      },
      message: "A guide must not cost more than 100$"
    } },
  // Currency the author prices the guide in (USD for Stripe sellers, e.g. NGN
  // for Paystack sellers). The max-100 cap above is a USD-era constraint.
  currency: { type: String, default: "USD" },
  city: { type: String, required: true },
  cityState: { type: String, required: true },
  country: { type: String, default: "United States" },
  topic: {
    type: String,
    required: true,
    enum: guideTopics
  },
  sections: {
    type: [guideSectionSchema],
    required: true,
    validate: {
      validator: function(sections) {
        return sections.length > 0 && sections.length <= 10;
      },
      message: "A guide must have between 1 and 10 sections"
    }
  },
  isDraft: { type: Boolean, default: false },
  isPurchased: { type: Boolean, default: false },
  // Access-control list: who may read this guide. Kept as a plain id array
  // because a lot of code checks membership with `.some()`.
  purchasedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],
  // Sales ledger, written alongside purchasedBy at fulfillment time.
  //
  // purchasedBy alone can't answer "what did I earn, and when?" — it has no
  // timestamp and no amount, and `price` is mutable, so multiplying it by the
  // buyer count misreports every guide whose price ever changed. These entries
  // snapshot what actually happened. Free unlocks are recorded too (gross 0),
  // which is why the seller-facing UI labels zero-price guides "unlocks" rather
  // than "sold".
  sales: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    purchasedAt: { type: Date, default: Date.now },
    gross: { type: Number, default: 0 },   // major units of `currency`
    net: { type: Number, default: 0 },     // seller's share after the platform fee
    currency: { type: String },
    _id: false,
  }],
  // Users who bookmarked this guide (saved for later)
  savedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "user"
  }],
  views: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Index for efficient queries
guideSchema.index({ city: 1, topic: 1 });
guideSchema.index({ author: 1, isDraft: 1 });
guideSchema.index({ city: 1, price: 1 });

// Generate the share slug before saving. Async hook — mongoose waits on the
// returned promise, so no next() callback is needed.
guideSchema.pre('save', async function() {
  if (!this.slug && this.title) {
    const base = slugify(this.title);
    // Only assign when a slug was produced — an explicit null would still be
    // indexed by the sparse unique index and collide with other null slugs.
    const slug = await generateUniqueSlug(this.constructor, base, {
      excludeId: this._id,
    });
    if (slug) this.slug = slug;
  }
});

export const guideTopicsList = guideTopics;
export default mongoose.model("guide", guideSchema);
