import { City, VendorType, Vendor } from "../models/vendor.model.js";
import Review from "../models/review.model.js";
import ExternalVendor from "../models/externalVendor.model.js";
import {
  ensureFreshExternalVendors,
  ensureFreshExternalVendorsForCity,
  getCachedExternalVendors,
  dedupeExternalVendors,
} from "../services/externalVendors.service.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Shape a cached externalVendor doc like a browse/list vendor so the mobile
// screens can render both through one code path.
function toBrowseShape(ext) {
  return {
    _id: ext._id,
    name: ext.name,
    description: ext.description,
    images: ext.images,
    priceRange: ext.priceRange,
    rating: ext.rating,
    reviewCount: ext.reviewCount,
    verified: false,
    source: ext.source,
    externalUrl: ext.externalUrl,
    vendorType: ext.vendorType,
    city: { name: ext.city, state: ext.state, country: ext.country },
  };
}

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
    const { country, state, city, includeExternal } = req.query;

    const vendorQuery = {};
    if (country || state || city) {
      const cityQuery = {};
      if (country) cityQuery.country = new RegExp(`^${escapeRegex(country)}$`, "i");
      if (state) cityQuery.state = new RegExp(`^${escapeRegex(state)}$`, "i");
      if (city) cityQuery.name = new RegExp(`^${escapeRegex(city)}$`, "i");
      const matchingCities = await City.find(cityQuery).select("_id");
      vendorQuery.city = { $in: matchingCities.map((c) => c._id) };
    }

    const internal = await Vendor.find(vendorQuery)
      .populate("city", "name state country")
      .populate("vendorType", "name icon")
      .sort({ verified: -1, rating: -1 })
      .lean();

    // Opt-in external results (Yelp / Google Places), only meaningful when a
    // specific city is browsed. Old app builds never send includeExternal, so
    // their responses are unchanged.
    let external = [];
    if (includeExternal === "true" && city) {
      // Stale-while-revalidate: never block the request on provider APIs —
      // fresh data lands in the cache for the next load / pull-to-refresh.
      void ensureFreshExternalVendorsForCity({ city, state, country }).catch(() => {});
      const cached = await getCachedExternalVendors({ city });
      external = dedupeExternalVendors(cached).map(toBrowseShape);
    }

    const vendors = [
      ...internal.map((v) => ({ ...v, source: "internal" })),
      ...external,
    ];

    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getVendorsByCityAndType(req, res) {
  try {
    const { cityId, vendorTypeId } = req.params;
    const { includeExternal } = req.query;

    const internal = await Vendor.find({ city: cityId, vendorType: vendorTypeId })
      .populate("city", "name state")
      .populate("vendorType", "name icon")
      .sort({ verified: -1, rating: -1 })
      .lean();

    let external = [];
    if (includeExternal === "true") {
      const [cityDoc, typeDoc] = await Promise.all([
        City.findById(cityId).lean(),
        VendorType.findById(vendorTypeId).lean(),
      ]);
      if (cityDoc && typeDoc) {
        void ensureFreshExternalVendors({
          city: cityDoc.name,
          state: cityDoc.state,
          country: cityDoc.country,
          vendorTypeId: typeDoc._id,
          vendorTypeName: typeDoc.name,
        }).catch(() => {});
        const cached = await getCachedExternalVendors({
          city: cityDoc.name,
          vendorTypeId: typeDoc._id,
        });
        external = dedupeExternalVendors(cached).map(toBrowseShape);
      }
    }

    res.status(200).json([
      ...internal.map((v) => ({ ...v, source: "internal" })),
      ...external,
    ]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Fetch a single vendor (with contact links + images) for the details screen
export async function getVendorById(req, res) {
  try {
    const vendor = await Vendor.findById(req.params.vendorId)
      .populate("city", "name state country")
      .populate("vendorType", "name icon");
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

export async function searchVendors(req, res) {
  try {
    const { query, city, includeExternal } = req.query;
    if (!query || query.trim().length < 2) {
      return res.json({ vendors: [] });
    }
    const results = await Vendor.find({
      name: { $regex: escapeRegex(query.trim()), $options: "i" },
    })
      .populate("city", "name")
      .populate("vendorType", "name")
      .limit(20);

    const vendors = results.map((v) => ({
      _id: v._id,
      name: v.name,
      vendorType: v.vendorType?.name || "",
      location: { city: v.city?.name || "" },
      images: v.images,
      description: v.description,
      verified: v.verified,
      rating: v.rating,
      source: "internal",
    }));

    // Cached external matches only — search never spends provider quota.
    if (includeExternal === "true" && city) {
      const externalResults = await ExternalVendor.find({
        name: { $regex: escapeRegex(query.trim()), $options: "i" },
        city: new RegExp(`^${escapeRegex(city)}$`, "i"),
        isActive: true,
      })
        .populate("vendorType", "name")
        .limit(20)
        .lean();

      for (const v of dedupeExternalVendors(externalResults)) {
        vendors.push({
          _id: v._id,
          name: v.name,
          vendorType: v.vendorType?.name || "",
          location: { city: v.city || "" },
          images: v.images,
          description: v.description,
          verified: false,
          rating: v.rating,
          source: v.source,
          externalUrl: v.externalUrl,
        });
      }
    }

    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Fetch a single external (Yelp / Google) vendor for its detail screen
export async function getExternalVendorById(req, res) {
  try {
    const vendor = await ExternalVendor.findById(req.params.id)
      .populate("vendorType", "name icon")
      .lean();
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
