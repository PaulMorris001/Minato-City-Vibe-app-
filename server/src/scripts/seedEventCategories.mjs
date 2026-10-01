/**
 * Seed the eventCategory collection with a starter list, so the create-event
 * picker and the browse filters aren't empty the day categories ship. The list
 * is admin-managed from then on (see admin.controller.js's
 * getEventCategoriesAdmin/createEventCategory/deleteEventCategory).
 *
 * Idempotent — skips any name that already exists. Run once per environment:
 *
 *   cd server && node src/scripts/seedEventCategories.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import EventCategory from "../models/eventCategory.model.js";

const CATEGORIES = [
  { name: "Party", emoji: "🎉" },
  { name: "Music", emoji: "🎵" },
  { name: "Nightlife", emoji: "🌙" },
  { name: "Food & Drink", emoji: "🍽️" },
  { name: "Arts & Culture", emoji: "🎨" },
  { name: "Comedy", emoji: "😂" },
  { name: "Sports & Fitness", emoji: "🏃" },
  { name: "Networking", emoji: "🤝" },
  { name: "Workshops & Classes", emoji: "📚" },
  { name: "Wellness", emoji: "🧘" },
  { name: "Birthday", emoji: "🎂" },
  { name: "Community", emoji: "🫶" },
  { name: "Others", emoji: "🗂️" },
];

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);

  const existingNames = new Set((await EventCategory.find().select("name")).map((c) => c.name));
  const toInsert = CATEGORIES.filter((c) => !existingNames.has(c.name));

  if (toInsert.length === 0) {
    console.log("✓ Every category already exists — nothing to seed.");
    return;
  }

  await EventCategory.insertMany(toInsert);
  console.log(`✓ Seeded ${toInsert.length} categor${toInsert.length === 1 ? "y" : "ies"}: ${toInsert.map((c) => c.name).join(", ")}`);
}

main()
  .catch((err) => {
    console.error("❌ seedEventCategories failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
