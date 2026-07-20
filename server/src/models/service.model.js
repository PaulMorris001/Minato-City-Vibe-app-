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
    // Optional grouping label so a vendor can organise their catalogue into
    // sections (e.g. "Foods", "Drinks", "Birthday Party"). Empty = ungrouped.
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
    images: [{
        type: String
    }],
    duration: {
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

export const Service = mongoose.model("service", serviceSchema);
