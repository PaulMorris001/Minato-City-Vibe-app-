import mongoose from "mongoose";
import { City, VendorType, Vendor } from "../models/vendor.model.js";
import dotenv from 'dotenv';

dotenv.config();

const cities = [
  { _id: "691660f69fce6d48f9f04c98", name: "Boston", state: "Massachusetts" },
  { _id: "691660f69fce6d48f9f04c99", name: "New York City", state: "New York" },
  { _id: "691660f69fce6d48f9f04c9a", name: "Atlanta", state: "Georgia" },
  { _id: "691660f69fce6d48f9f04c9b", name: "Los Angeles", state: "California" },
  { _id: "691660f69fce6d48f9f04c9c", name: "Houston", state: "Texas" },
  { _id: "691660f69fce6d48f9f04c9d", name: "Chicago", state: "Illinois" },
  { _id: "691660f69fce6d48f9f04c9e", name: "Washington", state: "DC" },
  { _id: "691660f69fce6d48f9f04c9f", name: "Miami", state: "Florida" },
  { _id: "691660f69fce6d48f9f04ca0", name: "New Orleans", state: "Louisiana" },
  { _id: "691660f69fce6d48f9f04ca1", name: "Detroit", state: "Michigan" },
  { _id: "691660f69fce6d48f9f04ca2", name: "San Francisco", state: "California" },
];

const vendorTypes = [
  { _id: "691660f69fce6d48f9f04ca4", name: "Chefs", icon: "restaurant" },
  { _id: "691660f69fce6d48f9f04ca5", name: "Restaurants", icon: "fast-food" },
  { _id: "691660f69fce6d48f9f04ca6", name: "Music and Bands", icon: "musical-notes" },
  { _id: "691660f69fce6d48f9f04ca7", name: "Bars and Clubs", icon: "beer" },
  { _id: "691660f69fce6d48f9f04ca8", name: "Casinos", icon: "dice" },
  { _id: "691660f69fce6d48f9f04ca9", name: "Concerts", icon: "mic" },
  { _id: "691660f69fce6d48f9f04caa", name: "Events", icon: "calendar" },
  { _id: "691660f69fce6d48f9f04cab", name: "Transportation", icon: "car" },
  { _id: "691660f69fce6d48f9f04cac", name: "Venues", icon: "business" },
  { _id: "691660f69fce6d48f9f04cad", name: "Florists", icon: "flower" },
  { _id: "691660f69fce6d48f9f04cae", name: "Decorations", icon: "color-palette" },
  { _id: "691660f69fce6d48f9f04caf", name: "Desserts", icon: "ice-cream" },
  { _id: "691660f69fce6d48f9f04cb0", name: "Beverages", icon: "wine" },
  { _id: "691660f69fce6d48f9f04cb1", name: "Other", icon: "ellipsis-horizontal" },
];

// Vendor name templates by type
const vendorTemplates = {
  Chefs: [
    "Chef {name}'s Catering",
    "Gourmet Chef {name}",
    "Executive Chef {name}",
    "{name}'s Culinary Services",
    "Private Chef {name}",
  ],
  Restaurants: [
    "The {adjective} {food}",
    "{name}'s Bistro",
    "{adjective} Table",
    "{name}'s Kitchen",
    "The {food} House",
  ],
  "Music and Bands": [
    "The {name} Band",
    "{adjective} Beats",
    "{name} Entertainment",
    "{adjective} Sounds",
    "{name} Music Group",
  ],
  "Bars and Clubs": [
    "The {adjective} Lounge",
    "{name}'s Bar",
    "Club {name}",
    "{adjective} Nightclub",
    "The {name} Tavern",
  ],
  Casinos: [
    "{name} Casino",
    "The {adjective} Casino",
    "{name} Gaming",
    "Royal {name} Casino",
    "{adjective} Palace Casino",
  ],
  Concerts: [
    "{name} Concert Hall",
    "The {adjective} Amphitheater",
    "{name} Arena",
    "{adjective} Music Venue",
    "{name} Pavilion",
  ],
  Events: [
    "{name} Event Planning",
    "{adjective} Events",
    "{name}'s Celebrations",
    "{adjective} Occasions",
    "{name} Event Co.",
  ],
  Transportation: [
    "{name} Limo Service",
    "{adjective} Transportation",
    "{name} Car Service",
    "{adjective} Rides",
    "{name} Executive Transport",
  ],
  Venues: [
    "The {adjective} Hall",
    "{name} Event Space",
    "{adjective} Venue",
    "{name} Ballroom",
    "The {name} Manor",
  ],
  Florists: [
    "{name} Florist",
    "{adjective} Blooms",
    "{name}'s Flowers",
    "{adjective} Petals",
    "{name} Floral Design",
  ],
  Decorations: [
    "{name} Decor",
    "{adjective} Decorations",
    "{name}'s Design Studio",
    "{adjective} Events Decor",
    "{name} Creative Design",
  ],
  Desserts: [
    "{name}'s Bakery",
    "Sweet {name}",
    "{adjective} Desserts",
    "{name} Pastry Shop",
    "The {adjective} Cake Co.",
  ],
  Beverages: [
    "{name} Bar Services",
    "{adjective} Beverages",
    "{name}'s Drinks",
    "{adjective} Bartending",
    "{name} Mobile Bar",
  ],
  Other: [
    "{name} Services",
    "{adjective} Solutions",
    "{name} & Co.",
    "{adjective} Specialists",
    "{name} Group",
  ],
};

const adjectives = ["Elegant", "Premium", "Royal", "Golden", "Silver", "Divine", "Grand", "Elite", "Luxury", "Classic"];
const names = ["Alexander", "Victoria", "Madison", "Savannah", "Jackson", "Brooklyn", "Austin", "Phoenix", "Harper", "Lincoln"];
const foods = ["Plate", "Grill", "Kitchen", "Dining", "Feast", "Table", "Cuisine", "Fork"];

const descriptions = [
  "Providing exceptional service for your special occasions with attention to detail and professionalism.",
  "Creating unforgettable experiences with our premium offerings and dedicated team.",
  "Your trusted partner for elegant events and celebrations throughout the year.",
  "Delivering quality and excellence with every service we provide to our valued clients.",
  "Bringing your vision to life with our experienced professionals and creative solutions.",
  "Specializing in upscale events with a commitment to perfection and customer satisfaction.",
  "Making your celebrations memorable with our comprehensive range of premium services.",
  "Expert services tailored to your needs with years of industry experience.",
  "Transforming ordinary moments into extraordinary memories with style and grace.",
  "Premium quality services designed to exceed your expectations every time.",
];

const phoneFormats = ["(555) 123-", "(555) 234-", "(555) 345-", "(555) 456-", "(555) 567-"];
const instagramHandles = ["deluxe", "premium", "elite", "royal", "golden", "signature", "exclusive", "luxury"];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateVendorName(vendorType) {
  const templates = vendorTemplates[vendorType];
  const template = randomElement(templates);
  return template
    .replace("{name}", randomElement(names))
    .replace("{adjective}", randomElement(adjectives))
    .replace("{food}", randomElement(foods));
}

function generatePhone() {
  return `${randomElement(phoneFormats)}${randomNumber(1000, 9999)}`;
}

function generateInstagram(vendorName) {
  const cleanName = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${cleanName.substring(0, 15)}${randomElement(instagramHandles)}`;
}

function generateWebsite(vendorName) {
  const cleanName = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://www.${cleanName.substring(0, 20)}.com`;
}

function generateVendors() {
  const vendors = [];
  cities.forEach((city) => {
    vendorTypes.forEach((vendorType) => {
      const vendorName = generateVendorName(vendorType.name);
      const phone = generatePhone();
      vendors.push({
        name: vendorName,
        vendorType: new mongoose.Types.ObjectId(vendorType._id),
        city: new mongoose.Types.ObjectId(city._id),
        description: randomElement(descriptions),
        images: [
          `https://picsum.photos/800/600?random=${Math.random()}`,
          `https://picsum.photos/800/600?random=${Math.random()}`,
          `https://picsum.photos/800/600?random=${Math.random()}`,
        ],
        priceRange: randomNumber(1, 5),
        rating: parseFloat((Math.random() * 2 + 3).toFixed(1)),
        contact: {
          phone: phone,
          instagram: generateInstagram(vendorName),
          website: generateWebsite(vendorName),
        },
      });
    });
  });
  return vendors;
}

async function seedAll() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // 1. Upsert Cities
    await City.bulkWrite(
      cities.map((c) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(c._id) },
          update: { $set: { name: c.name, state: c.state } },
          upsert: true,
        },
      }))
    );
    console.log(`✓ Seeded ${cities.length} cities`);

    // 2. Upsert VendorTypes
    await VendorType.bulkWrite(
      vendorTypes.map((t) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(t._id) },
          update: { $set: { name: t.name, icon: t.icon } },
          upsert: true,
        },
      }))
    );
    console.log(`✓ Seeded ${vendorTypes.length} vendor types`);

    // 3. Seed Vendors (skip existing to avoid duplicates)
    const existingCount = await Vendor.countDocuments();
    if (existingCount === 0) {
      const vendors = generateVendors();
      await Vendor.insertMany(vendors, { ordered: false });
      console.log(`✓ Seeded ${vendors.length} vendors`);
    } else {
      console.log(`⚠ Vendors already exist (${existingCount} found), skipping vendor seed`);
      console.log(`  To reseed vendors, drop the vendors collection first`);
    }

    console.log("\nSeed complete!");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error seeding:", error);
    process.exit(1);
  }
}

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  seedAll();
}
