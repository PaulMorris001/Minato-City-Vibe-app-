import mongoose from "mongoose";

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
  description: { type: String, required: true, maxlength: 3000 }
});

const guideSchema = mongoose.Schema({
  title: { type: String, required: true },
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
  city: { type: String, required: true },
  cityState: { type: String, required: true },
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
  purchasedBy: [{
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

export const guideTopicsList = guideTopics;
export default mongoose.model("guide", guideSchema);
