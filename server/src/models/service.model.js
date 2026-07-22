import mongoose from "mongoose";

const serviceSchema = mongoose.Schema({
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    // The parent catalogue category this item belongs to. Optional only so
    // legacy pre-migration docs still validate; new items always set it and the
    // controller derives `kind` from it.
    catalogueCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "catalogueCategory"
    },
    // Denormalised from the parent category (server-set) so the app can render
    // the right fields without a populate. "product" = a good sold by a unit;
    // "service" = work rendered over a duration.
    kind: {
        type: String,
        enum: ["product", "service"],
        default: "service"
    },
    // Optional grouping label so a vendor can organise their catalogue into
    // sections (e.g. "Foods", "Drinks", "Birthday Party"). Empty = ungrouped.
    // Superseded by `catalogueCategory`; kept for backward compatibility.
    section: {
        type: String,
        default: ""
    },
    price: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "USD"
    },
    // ── Product-kind fields ──
    // The selling unit shown next to the price, e.g. "per plate", "per kg",
    // "per bottle". Free text so vendors aren't boxed into a fixed list.
    unit: {
        type: String,
        default: ""
    },
    // Smallest quantity a client may order of this product.
    minOrderQty: {
        type: Number,
        default: 1,
        min: 1
    },
    // Units in stock. null = untracked / made-to-order (the default).
    stock: {
        type: Number,
        default: null
    },
    images: [{
        type: String
    }],
    // ── Service-kind fields ──
    duration: {
        value: { type: Number },
        unit: {
            type: String,
            enum: ["hours", "days", "weeks", "months"]
        }
    },
    // How long before the vendor can deliver / turn the service around.
    leadTime: {
        value: { type: Number },
        unit: {
            type: String,
            enum: ["hours", "days", "weeks", "months"]
        }
    },
    availability: {
        type: String,
        enum: ["available", "unavailable", "coming_soon"],
        default: "available"
    },
    features: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for faster queries
serviceSchema.index({ vendor: 1, isActive: 1 });
serviceSchema.index({ category: 1 });
serviceSchema.index({ catalogueCategory: 1, isActive: 1 });

export const Service = mongoose.model("service", serviceSchema);
