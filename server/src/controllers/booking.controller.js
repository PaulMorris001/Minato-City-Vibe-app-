import { Booking } from "../models/booking.model.js";
import { Service } from "../models/service.model.js";
import { Vendor } from "../models/vendor.model.js";

// Client creates a booking request
export async function createBooking(req, res) {
  try {
    const { vendorId, serviceId, preferredDate, message } = req.body;

    if (!vendorId || !serviceId || !preferredDate) {
      return res.status(400).json({ message: "vendorId, serviceId, and preferredDate are required" });
    }

    const parsedDate = new Date(preferredDate);
    if (isNaN(parsedDate.getTime()) || parsedDate <= new Date()) {
      return res.status(400).json({ message: "preferredDate must be a valid future date" });
    }

    // Resolve vendorId (may be a Vendor doc _id or User _id)
    const vendorDoc = await Vendor.findById(vendorId).select("user");
    const vendorUserId = vendorDoc?.user || vendorId;

    const service = await Service.findOne({ _id: serviceId, vendor: vendorUserId, isActive: true });
    if (!service) {
      return res.status(404).json({ message: "Service not found or unavailable" });
    }

    if (service.availability !== "available") {
      return res.status(400).json({ message: "This service is not currently available for booking" });
    }

    // Prevent double-booking the same service by the same client for the same date
    const existing = await Booking.findOne({
      client: req.user.id,
      service: serviceId,
      preferredDate: parsedDate,
      status: { $in: ["pending", "confirmed"] },
    });
    if (existing) {
      return res.status(409).json({ message: "You already have a pending booking for this service at that time" });
    }

    const booking = await Booking.create({
      client: req.user.id,
      vendor: vendorUserId,
      service: serviceId,
      preferredDate: parsedDate,
      message: message || "",
      priceSnapshot: { amount: service.price, currency: service.currency },
    });

    await booking.populate([
      { path: "service", select: "name category images" },
      { path: "vendor", select: "username profilePicture" },
    ]);

    res.status(201).json({ message: "Booking request sent", booking });
  } catch (error) {
    res.status(500).json({ message: "Error creating booking", details: error.message });
  }
}

// Client views their own bookings
export async function getClientBookings(req, res) {
  try {
    const bookings = await Booking.find({ client: req.user.id })
      .populate("service", "name category images")
      .populate("vendor", "username profilePicture")
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Error fetching bookings", details: error.message });
  }
}

// Vendor views incoming bookings
export async function getVendorBookings(req, res) {
  try {
    const { status } = req.query;
    const filter = { vendor: req.user.id };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate("service", "name category images price currency")
      .populate("client", "username profilePicture email")
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Error fetching bookings", details: error.message });
  }
}

// Vendor updates booking status (confirm or reject)
export async function updateBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["confirmed", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status must be 'confirmed' or 'rejected'" });
    }

    const booking = await Booking.findOne({ _id: id, vendor: req.user.id });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({ message: `Cannot update a booking that is already ${booking.status}` });
    }

    booking.status = status;
    await booking.save();

    res.status(200).json({ message: `Booking ${status}`, booking });
  } catch (error) {
    res.status(500).json({ message: "Error updating booking", details: error.message });
  }
}

// Client cancels their own booking
export async function cancelBooking(req, res) {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, client: req.user.id });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!["pending", "confirmed"].includes(booking.status)) {
      return res.status(400).json({ message: "This booking cannot be cancelled" });
    }

    booking.status = "cancelled";
    await booking.save();

    res.status(200).json({ message: "Booking cancelled", booking });
  } catch (error) {
    res.status(500).json({ message: "Error cancelling booking", details: error.message });
  }
}
