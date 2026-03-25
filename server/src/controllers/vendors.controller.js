import { City, Vendor, VendorType } from "../models/vendor.model.js";
import User from "../models/user.model.js";

// Hardcoded maps matching the seeded City/VendorType collections.
// Using these avoids a DB round-trip and handles cases where those
// collections haven't been seeded in a given environment.
const CITY_MAP = {
  "691660f69fce6d48f9f04c98": "Boston",
  "691660f69fce6d48f9f04c99": "New York City",
  "691660f69fce6d48f9f04c9a": "Atlanta",
  "691660f69fce6d48f9f04c9b": "Los Angeles",
  "691660f69fce6d48f9f04c9c": "Houston",
  "691660f69fce6d48f9f04c9d": "Chicago",
  "691660f69fce6d48f9f04c9e": "Washington",
  "691660f69fce6d48f9f04c9f": "Miami",
  "691660f69fce6d48f9f04ca0": "New Orleans",
  "691660f69fce6d48f9f04ca1": "Detroit",
  "691660f69fce6d48f9f04ca2": "San Francisco",
};

const TYPE_MAP = {
  "691660f69fce6d48f9f04ca4": "Chefs",
  "691660f69fce6d48f9f04ca5": "Restaurants",
  "691660f69fce6d48f9f04ca6": "Music and Bands",
  "691660f69fce6d48f9f04ca7": "Bars and Clubs",
  "691660f69fce6d48f9f04ca8": "Casinos",
  "691660f69fce6d48f9f04ca9": "Concerts",
  "691660f69fce6d48f9f04caa": "Events",
  "691660f69fce6d48f9f04cab": "Transportation",
  "691660f69fce6d48f9f04cac": "Venues",
  "691660f69fce6d48f9f04cad": "Florists",
  "691660f69fce6d48f9f04cae": "Decorations",
  "691660f69fce6d48f9f04caf": "Desserts",
  "691660f69fce6d48f9f04cb0": "Beverages",
  "691660f69fce6d48f9f04cb1": "Other",
};

export async function getAllCities(req, res) {
  try {
    const cities = await City.find();
    res.status(200).json(cities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getVendorTypesByCity(req, res) {
  try {
    const vendorTypes = await VendorType.find();
    res.status(200).json(vendorTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getVendorsByCityAndType(req, res) {
  try {
    const { cityId, vendorTypeId } = req.params;

    // Resolve city and vendor type names from the hardcoded maps first.
    // Fall back to a live DB lookup so the endpoint still works if IDs
    // outside the static set are ever passed.
    let cityName = CITY_MAP[cityId];
    let typeName = TYPE_MAP[vendorTypeId];

    if (!cityName) {
      const city = await City.findById(cityId);
      if (!city) return res.status(404).json({ message: "City not found" });
      cityName = city.name;
    }

    if (!typeName) {
      const vendorType = await VendorType.findById(vendorTypeId);
      if (!vendorType) return res.status(404).json({ message: "Vendor type not found" });
      typeName = vendorType.name;
    }

    // Case-insensitive match so vendors who entered "boston" or "CHEFS" still appear.
    const vendorUsers = await User.find({
      isVendor: true,
      "location.city": { $regex: new RegExp(`^${cityName}$`, "i") },
      vendorType: { $regex: new RegExp(`^${typeName}$`, "i") },
    });

    const vendors = vendorUsers.map((user) => ({
      _id: user._id,
      name: user.businessName,
      description: user.businessDescription,
      images: user.businessPicture ? [user.businessPicture] : [],
      priceRange: 2,
      rating: 4.5,
      contact: {
        phone: user.contactInfo?.phone || "",
        instagram: user.contactInfo?.instagram || "",
        website: user.contactInfo?.website || "",
      },
      verified: user.verified,
    }));

    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Debug: returns raw stored fields for every vendor user so you can see what's in the DB
export async function debugVendors(req, res) {
  try {
    const vendorUsers = await User.find({ isVendor: true })
      .select("businessName vendorType location isVendor");
    res.json(vendorUsers.map(u => ({
      _id: u._id,
      businessName: u.businessName,
      vendorType: u.vendorType,
      locationCity: u.location?.city,
      locationFull: u.location,
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getAllVendorTypes(req, res) {
  try {
    const vendorTypes = await VendorType.find();
    res.status(200).json(vendorTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
