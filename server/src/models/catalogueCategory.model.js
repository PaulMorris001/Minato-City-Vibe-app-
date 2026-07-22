import mongoose from "mongoose";

/**
 * A top-level catalogue category owned by a vendor (e.g. "Catering",
 * "Photography"). This is the "major category" a vendor creates first; the
 * sellable items inside it are `Service` docs that reference this category.
 *
 * `kind` is declared at creation and locked afterwards because it decides which
 * fields the vendor fills in for each sub-item:
 *   - "product"  → discrete goods (rice, chicken, a bottle of wine…) with a
 *                  selling unit and optional stock.
 *   - "service"  → work rendered, with a duration / turnaround time.
 */
const catalogueCategorySchema = mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    kind: {
      type: String,
      enum: ["product", "service"],
      required: true,
    },
    // Cover art for the category card (Cloudinary URLs).
    images: [{ type: String }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

catalogueCategorySchema.index({ vendor: 1, isActive: 1 });

export const CatalogueCategory = mongoose.model(
  "catalogueCategory",
  catalogueCategorySchema
);
