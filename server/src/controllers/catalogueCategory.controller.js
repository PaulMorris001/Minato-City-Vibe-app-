import { CatalogueCategory } from "../models/catalogueCategory.model.js";
import { Service } from "../models/service.model.js";
import User from "../models/user.model.js";
import { Vendor } from "../models/vendor.model.js";

// Get all catalogue categories for a specific vendor (public - for clients)
export async function getCategoriesByVendorId(req, res) {
  try {
    const { vendorId } = req.params;

    // Resolve Vendor ID → User ID (vendorId may be a Vendor doc _id or a User _id)
    const vendorDoc = await Vendor.findById(vendorId).select("user");
    const userId = vendorDoc?.user || vendorId;

    const categories = await CatalogueCategory.find({
      vendor: userId,
      isActive: true,
    }).sort({ createdAt: -1 });
    res.status(200).json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching categories", details: error.message });
  }
}

// Get all catalogue categories for the authenticated vendor
export async function getVendorCategories(req, res) {
  try {
    const categories = await CatalogueCategory.find({
      vendor: req.user.id,
    }).sort({ createdAt: -1 });
    res.status(200).json(categories);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching categories", details: error.message });
  }
}

// Create a new catalogue category
export async function createCategory(req, res) {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.isVendor) {
      return res
        .status(403)
        .json({ message: "Only vendors can create categories" });
    }

    const { name, description, kind, images } = req.body;

    if (kind !== "product" && kind !== "service") {
      return res
        .status(400)
        .json({ message: "kind must be either 'product' or 'service'" });
    }

    const category = new CatalogueCategory({
      vendor: req.user.id,
      name,
      description,
      // kind is locked at creation — it drives which fields sub-items expose.
      kind,
      images,
    });
    await category.save();

    res
      .status(201)
      .json({ message: "Category created successfully", category });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error creating category", details: error.message });
  }
}

// Update a catalogue category (name/description/images/isActive; kind is immutable)
export async function updateCategory(req, res) {
  try {
    const category = await CatalogueCategory.findOne({
      _id: req.params.id,
      vendor: req.user.id,
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // `kind` and `vendor` are immutable — kind decides the sub-item field shape,
    // so flipping it would leave existing items with the wrong fields.
    Object.keys(req.body).forEach((key) => {
      if (key !== "vendor" && key !== "kind") {
        category[key] = req.body[key];
      }
    });

    await category.save();

    res
      .status(200)
      .json({ message: "Category updated successfully", category });
  } catch (error) {
    res
      .status(400)
      .json({ message: "Error updating category", details: error.message });
  }
}

// Delete a catalogue category (blocked while it still has items)
export async function deleteCategory(req, res) {
  try {
    const category = await CatalogueCategory.findOne({
      _id: req.params.id,
      vendor: req.user.id,
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Guard against orphaning items — the vendor must clear the category first.
    const itemCount = await Service.countDocuments({
      catalogueCategory: category._id,
    });
    if (itemCount > 0) {
      return res.status(409).json({
        message: `Remove the ${itemCount} item(s) in this category before deleting it`,
        code: "category_not_empty",
      });
    }

    await category.deleteOne();
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting category", details: error.message });
  }
}
