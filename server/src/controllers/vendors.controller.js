import { City, VendorType, Vendor } from "../models/vendor.model.js";

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

export async function searchVendors(req, res) {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) {
      return res.json({ vendors: [] });
    }
    const results = await Vendor.find({
      name: { $regex: query.trim(), $options: "i" },
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
    }));

    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
