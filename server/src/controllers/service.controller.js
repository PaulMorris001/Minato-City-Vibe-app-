import { Service } from "../models/service.model.js";
import { currencyForUser } from "../services/payments/resolveProvider.js";
import User from "../models/user.model.js";
import { Vendor } from "../models/vendor.model.js";
import { Booking } from "../models/booking.model.js";
import Review from "../models/review.model.js";

// Get all services for a specific vendor (public - for clients to view)
export async function getServicesByVendorId(req, res) {
  try {
    const { vendorId } = req.params;

    // Resolve Vendor ID → User ID (vendorId may be a Vendor doc _id or a User _id)
    const vendorDoc = await Vendor.findById(vendorId).select("user");
    const userId = vendorDoc?.user || vendorId;

    const services = await Service.find({ vendor: userId, isActive: true }).sort({ createdAt: -1 });
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: "Error fetching services", details: error.message });
  }
}

// Get all services for the authenticated vendor
export async function getVendorServices(req, res) {
  try {
    const services = await Service.find({ vendor: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: "Error fetching services", details: error.message });
  }
}

// Get a single service by ID
export async function getServiceById(req, res) {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      vendor: req.user.id
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: "Error fetching service", details: error.message });
  }
}

// Create a new service
export async function createService(req, res) {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.isVendor) {
      return res.status(403).json({ message: "Only vendors can create services" });
    }

    const serviceData = {
      ...req.body,
      vendor: req.user.id,
      // Priced in the vendor's local currency (NGN for Nigerian vendors, USD
      // otherwise). Server-authoritative: it must match the provider the
      // vendor collects through, so any client-sent currency is ignored.
      currency: currencyForUser(user),
    };

    const service = new Service(serviceData);
    await service.save();

    res.status(201).json({
      message: "Service created successfully",
      service
    });
  } catch (error) {
    res.status(400).json({ message: "Error creating service", details: error.message });
  }
}

// Update a service
export async function updateService(req, res) {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      vendor: req.user.id
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Update fields (vendor is immutable; currency is server-assigned at
    // creation and must keep matching the vendor's collection provider)
    Object.keys(req.body).forEach(key => {
      if (key !== 'vendor' && key !== 'currency') {
        service[key] = req.body[key];
      }
    });

    await service.save();

    res.status(200).json({
      message: "Service updated successfully",
      service
    });
  } catch (error) {
    res.status(400).json({ message: "Error updating service", details: error.message });
  }
}

// Delete a service
export async function deleteService(req, res) {
  try {
    const service = await Service.findOneAndDelete({
      _id: req.params.id,
      vendor: req.user.id
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting service", details: error.message });
  }
}

// Get vendor dashboard statistics
export async function getVendorStats(req, res) {
  try {
    const vendorId = req.user.id;

    // Count services
    const totalServices = await Service.countDocuments({ vendor: vendorId });
    const activeServices = await Service.countDocuments({
      vendor: vendorId,
      isActive: true,
      availability: "available"
    });
    const unavailableServices = await Service.countDocuments({
      vendor: vendorId,
      availability: "unavailable"
    });

    // Get recent services
    const recentServices = await Service.find({ vendor: vendorId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate average price
    const services = await Service.find({ vendor: vendorId, isActive: true });
    const avgPrice = services.length > 0
      ? services.reduce((sum, s) => sum + s.price, 0) / services.length
      : 0;

    // Rating + review count (from the linked Vendor doc)
    const vendorDoc = await Vendor.findOne({ user: vendorId }).select("_id rating");
    const rating = vendorDoc?.rating || 0;
    const ratingCount = vendorDoc
      ? await Review.countDocuments({ vendor: vendorDoc._id })
      : 0;

    // Bookings + earnings windows
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const bookingsThisMonth = await Booking.countDocuments({
      vendor: vendorId,
      createdAt: { $gte: startOfThisMonth },
    });

    // Earnings = confirmed bookings' snapshot amount, by month
    const confirmedSinceLastMonth = await Booking.find({
      vendor: vendorId,
      status: "confirmed",
      createdAt: { $gte: startOfLastMonth },
    }).select("priceSnapshot createdAt");

    let earningsThisMonth = 0;
    let earningsLastMonth = 0;
    for (const b of confirmedSinceLastMonth) {
      const amt = b.priceSnapshot?.amount || 0;
      if (b.createdAt >= startOfThisMonth) earningsThisMonth += amt;
      else earningsLastMonth += amt;
    }

    // Sparkline — confirmed earnings per day for the last 12 days (oldest → newest)
    const dailyEarnings = new Array(12).fill(0);
    const start12 = new Date(now);
    start12.setHours(0, 0, 0, 0);
    start12.setDate(start12.getDate() - 11);
    for (const b of confirmedSinceLastMonth) {
      const dayIdx = Math.floor((b.createdAt - start12) / 86400000);
      if (dayIdx >= 0 && dayIdx < 12) dailyEarnings[dayIdx] += b.priceSnapshot?.amount || 0;
    }

    res.status(200).json({
      totalServices,
      activeServices,
      unavailableServices,
      averagePrice: avgPrice.toFixed(2),
      recentServices,
      servicesByCategory: await getServicesByCategory(vendorId),
      rating,
      ratingCount,
      bookingsThisMonth,
      earningsThisMonth,
      earningsLastMonth,
      dailyEarnings,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching statistics", details: error.message });
  }
}

// Helper function to group services by category
async function getServicesByCategory(vendorId) {
  try {
    const services = await Service.find({ vendor: vendorId });
    const categoryCount = {};

    services.forEach(service => {
      const category = service.category || "Uncategorized";
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    return Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count
    }));
  } catch (error) {
    return [];
  }
}
