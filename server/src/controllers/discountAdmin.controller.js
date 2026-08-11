import mongoose from "mongoose";
import DiscountCode from "../models/discountCode.model.js";
import Event from "../models/event.model.js";
import { notifyUser } from "../services/notification.service.js";

const CODE_REGEX = /^[A-Z0-9-]{3,24}$/;

// ── Discount codes (admin-created; creators can only toggle theirs) ────────

export async function getDiscountCodes(req, res) {
  try {
    const { search = "", page = 1, limit = 20, eventId } = req.query;
    const query = {};
    if (search) query.code = { $regex: search, $options: "i" };
    if (eventId) {
      if (!mongoose.isValidObjectId(eventId)) {
        return res.status(400).json({ message: "Invalid eventId" });
      }
      query.event = eventId;
    }
    const skip = (Number(page) - 1) * Number(limit);

    const [codes, total] = await Promise.all([
      DiscountCode.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("event", "title date currency"),
      DiscountCode.countDocuments(query),
    ]);

    res.json({ codes, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createDiscountCode(req, res) {
  try {
    const { eventId, code, type, value, startsAt, endsAt, maxRedemptions } = req.body;

    if (!eventId || !code || !type || value == null) {
      return res.status(400).json({ message: "eventId, code, type, and value are required" });
    }

    const event = mongoose.isValidObjectId(eventId)
      ? await Event.findById(eventId).select("title createdBy isPaid")
      : null;
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (!event.isPaid) {
      return res.status(400).json({ message: "Discount codes only apply to paid events" });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    if (!CODE_REGEX.test(normalizedCode)) {
      return res.status(400).json({
        message: "Code must be 3-24 characters: letters, numbers, and dashes only",
      });
    }

    if (type !== "percent" && type !== "fixed") {
      return res.status(400).json({ message: "Type must be percent or fixed" });
    }
    if (type === "percent" && (value < 1 || value > 100)) {
      return res.status(400).json({ message: "Percent value must be between 1 and 100" });
    }
    if (type === "fixed" && value <= 0) {
      return res.status(400).json({ message: "Fixed value must be greater than 0" });
    }

    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      return res.status(400).json({ message: "startsAt must be before endsAt" });
    }

    if (maxRedemptions != null && (!Number.isInteger(Number(maxRedemptions)) || Number(maxRedemptions) < 1)) {
      return res.status(400).json({ message: "maxRedemptions must be a whole number of at least 1" });
    }

    const discountCode = await new DiscountCode({
      event: event._id,
      code: normalizedCode,
      type,
      value,
      startsAt: startsAt || undefined,
      endsAt: endsAt || undefined,
      maxRedemptions: maxRedemptions != null ? Number(maxRedemptions) : undefined,
      createdByAdmin: req.user.username,
    }).save();

    // Let the creator know a code now exists on their event (they can disable
    // it from the event screen). notifyUser is non-throwing.
    notifyUser(event.createdBy, {
      type: "discount_code_created",
      title: "Discount code added",
      body: `CityVibe added the discount code ${normalizedCode} to your event "${event.title}". You can disable it from your event page.`,
      data: { eventId: String(event._id) },
      push: true,
    });

    res.status(201).json(discountCode);
  } catch (error) {
    // Duplicate { event, code } from the unique index.
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That code already exists for this event" });
    }
    res.status(500).json({ message: error.message });
  }
}

export async function toggleDiscountCode(req, res) {
  try {
    const { id } = req.params;
    const discountCode = await DiscountCode.findById(id);
    if (!discountCode) return res.status(404).json({ message: "Discount code not found" });
    discountCode.isActive = !discountCode.isActive;
    await discountCode.save();
    res.json({ isActive: discountCode.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteDiscountCode(req, res) {
  try {
    const { id } = req.params;
    const discountCode = await DiscountCode.findById(id);
    if (!discountCode) return res.status(404).json({ message: "Discount code not found" });
    if (discountCode.redemptionCount > 0) {
      return res.status(409).json({
        message: "This code has been redeemed and can't be deleted — deactivate it instead",
      });
    }
    await DiscountCode.findByIdAndDelete(id);
    res.json({ message: "Discount code deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
