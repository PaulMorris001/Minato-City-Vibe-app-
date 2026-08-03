import mongoose from "mongoose";
import { mediaArrayLimit } from "../utils/mediaLimit.js";

const citySchema = mongoose.Schema({
    name: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: "United States" },
});

// Dedupe target for find-or-create when a city is picked from the CSC API
citySchema.index({ country: 1, state: 1, name: 1 }, { unique: true });

const vendorTypeSchema = mongoose.Schema({
    name: { type: String, required: true },
    icon: { type: String, required: true },
})

const vendorSchema = mongoose.Schema({
    name: { type: String, required: true },
    vendorType: { type: mongoose.Schema.Types.ObjectId, ref: "vendorType", required: true },
    city: { type: mongoose.Schema.Types.ObjectId, ref: "city", required: true },
    description: { type: String },
    // Gallery — photos or videos, max MAX_MEDIA_ITEMS.
    images: {
        type: [String],
        default: [],
        validate: mediaArrayLimit("Vendor media"),
    },
    priceRange: { type: Number, required: true },
    rating: { type: Number, default: 0 },
    contact: {
        phone: { type: String },
        website: { type: String },
        instagram: { type: String },
        twitter: { type: String },
        tiktok: { type: String },
        facebook: { type: String },
    },
    // Link to user account (if vendor has registered)
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    verified: { type: Boolean, default: false },
}, {
    timestamps: true
});

// Vendor browse and search both sort by (verified, rating) and narrow by city.
vendorSchema.index({ city: 1, verified: -1, rating: -1 });
vendorSchema.index({ name: 1 });

export const City = mongoose.model("city", citySchema);
export const VendorType = mongoose.model("vendorType", vendorTypeSchema);
export const Vendor = mongoose.model("vendor", vendorSchema);