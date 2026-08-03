import { City, VendorType, Vendor } from "../models/vendor.model.js";
import Review from "../models/review.model.js";
import { escapeRegex } from "../utils/escapeRegex.js";

/**
 * Resolve a City document from a picker selection, creating it on first use.
 * Cities are no longer a fixed admin list — they're materialized the first
 * time a vendor (or anything else) picks one from the CSC API. Keyed by
 * {country, state, name} to match the unique index.
 */
export async function findOrCreateCity({ name, state, country }) {
  if (!name || !state) return null;
  const resolvedCountry = country || "United States";
  return City.findOneAndUpdate(
    { name, state, country: resolvedCountry },
    { $setOnInsert: { name, state, country: resolvedCountry } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function getAllCities(req, res) {
  try {
    const cities = await City.find().sort({ name: 1 });
    res.status(200).json(cities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getAllVendorTypes(req, res) {
  try {
    const vendorTypes = await VendorType.find().sort({ name: 1 });
    res.status(200).json(vendorTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getVendorTypesByCity(req, res) {
  try {
    // All vendor types are available for all cities
    const vendorTypes = await VendorType.find().sort({ name: 1 });
    res.status(200).json(vendorTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Browse vendors for the carousel view — flat list, populated with city +
// vendorType, optionally narrowed to a location (country / state / city).
// The client groups the result into per-vendor-type carousels.
export async function browseVendors(req, res) {
  try {
    const { country, state, city } = req.query;

    const vendorQuery = {};
    if (country || state || city) {
      const cityQuery = {};
      if (country) cityQuery.country = new RegExp(`^${escapeRegex(country)}$`, "i");
      if (state) cityQuery.state = new RegExp(`^${escapeRegex(state)}$`, "i");
      if (city) cityQuery.name = new RegExp(`^${escapeRegex(city)}$`, "i");
      const matchingCities = await City.find(cityQuery).select("_id");
      vendorQuery.city = { $in: matchingCities.map((c) => c._id) };
    }

    const vendors = await Vendor.find(vendorQuery)
      .populate("city", "name state country")
      .populate("vendorType", "name icon")
      .sort({ verified: -1, rating: -1 });

    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getVendorsByCityAndType(req, res) {
  try {
    const { cityId, vendorTypeId } = req.params;
    const vendors = await Vendor.find({ city: cityId, vendorType: vendorTypeId })
      .populate("city", "name state")
      .populate("vendorType", "name icon")
      .sort({ verified: -1, rating: -1 });
    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Fetch a single vendor (with contact links + images) for the details screen
export async function getVendorById(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.vendorId)
      .populate("city", "name state country")
      .populate("vendorType", "name icon")
      // Owner account, so the details screen can link through to their profile
      .populate("user", "username profilePicture businessName");
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function rateVendor(req, res) {
  try {
    const { vendorId } = req.params;
    const userId = req.user.id;
    const { rating, review = "" } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    // Upsert: update existing review or create new one
    await Review.findOneAndUpdate(
      { vendor: vendorId, user: userId },
      { rating, review: review.trim() },
      { upsert: true, new: true }
    );

    // Recompute vendor average rating
    const agg = await Review.aggregate([
      { $match: { vendor: vendor._id } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const avg = agg.length > 0 ? Math.round(agg[0].avg * 10) / 10 : 0;
    await Vendor.findByIdAndUpdate(vendorId, { rating: avg });

    res.json({ rating: avg });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getVendorReviews(req, res) {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [reviews, total, userReview] = await Promise.all([
      Review.find({ vendor: vendorId })
        .populate("user", "username profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Review.countDocuments({ vendor: vendorId }),
      req.user
        ? Review.findOne({ vendor: vendorId, user: req.user.id })
        : null,
    ]);

    res.json({ reviews, total, userReview });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Build the Vendor filter for a text search, matching on the vendor's own
 * fields plus its city and vendor-type names (so "Lagos" or "Photographer"
 * find vendors, not just literal name matches).
 *
 * Shared with the unified /search endpoint. Returns null when `q` is too short,
 * meaning "no text filter" rather than "no results" — callers decide whether
 * that's a browse or an empty response.
 */
export async function buildVendorSearchQuery({ q, city }) {
  const vendorQuery = {};

  // Narrow to a city first, the same way browseVendors does.
  if (city) {
    const matchingCities = await City.find({
      name: new RegExp(`^${escapeRegex(city)}$`, "i"),
    }).select("_id");
    vendorQuery.city = { $in: matchingCities.map((c) => c._id) };
  }

  const term = (q || "").trim();
  if (term.length >= 2) {
    const safe = escapeRegex(term);
    const rx = { $regex: safe, $options: "i" };
    // Resolve name matches on the related collections up front — two small
    // queries beat an aggregation with $lookup at this scale.
    const [cityMatches, typeMatches] = await Promise.all([
      City.find({ name: rx }).select("_id"),
      VendorType.find({ name: rx }).select("_id"),
    ]);
    vendorQuery.$and = [
      {
        $or: [
          { name: rx },
          { description: rx },
          { city: { $in: cityMatches.map((c) => c._id) } },
          { vendorType: { $in: typeMatches.map((t) => t._id) } },
        ],
      },
    ];
  }

  return vendorQuery;
}

/**
 * GET /vendors/search?query=&city=&limit=
 *
 * Returns the same populated shape as browseVendors so one row component can
 * render both. An empty/short `query` is a BROWSE, not an error — home's vendor
 * carousel calls this with `query=` and relied on that.
 */
export async function searchVendors(req, res) {
  try {
    const { query, city } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const vendorQuery = await buildVendorSearchQuery({ q: query, city });

    const vendors = await Vendor.find(vendorQuery)
      .populate("city", "name state country")
      .populate("vendorType", "name icon")
      .sort({ verified: -1, rating: -1 })
      .limit(limit);

    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
