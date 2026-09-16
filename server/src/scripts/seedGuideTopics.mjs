/**
 * Seed the guideTopic collection from the old hardcoded topic list.
 *
 * Guide.topic used to be schema-enforced against a fixed array duplicated in
 * three places (this list, mobile/libs/interfaces.ts's GUIDE_TOPICS, and
 * mobile/app/(tabs)/home.tsx's TOPIC_EMOJI) — meaning a new topic needed a
 * code change and an app release everywhere. Now it's this admin-managed
 * collection (see admin.controller.js's getGuideTopicsAdmin/createGuideTopic/
 * deleteGuideTopic); this seed carries over every existing topic (with the
 * emoji TOPIC_EMOJI already had for it, so home.tsx's guide cards look
 * unchanged) plus three new ones, so nothing that already worked regresses.
 *
 * Idempotent — skips any name that already exists. Run once per environment:
 *
 *   cd server && node src/scripts/seedGuideTopics.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import GuideTopic from "../models/guideTopic.model.js";

const TOPICS = [
  { name: "Chefs", emoji: "👨‍🍳" },
  { name: "Food and Restaurants", emoji: "🍽️" },
  { name: "Music and Bands", emoji: "🎸" },
  { name: "Bars and Clubs", emoji: "🍸" },
  { name: "Casinos", emoji: "🎰" },
  { name: "Concerts", emoji: "🎤" },
  { name: "Events", emoji: "🎉" },
  { name: "Transportation", emoji: "🚕" },
  { name: "Venues", emoji: "🏛️" },
  { name: "Florists", emoji: "💐" },
  { name: "Decorations", emoji: "🎈" },
  { name: "Desserts", emoji: "🍰" },
  { name: "Beverages", emoji: "🥤" },
  { name: "Grocery stores", emoji: "🛒" },
  { name: "Museums", emoji: "🖼️" },
  { name: "Parks", emoji: "🌳" },
  { name: "Hotels", emoji: "🏨" },
  { name: "Spas", emoji: "💆" },
  { name: "Hair and Nail Salons", emoji: "💅" },
  { name: "Barber Shops", emoji: "💈" },
  // New with the move to an admin-managed list.
  { name: "Travel guide", emoji: "🧭" },
  { name: "Tourist spot", emoji: "📍" },
  { name: "Others", emoji: "🗂️" },
];

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);

  const existingNames = new Set((await GuideTopic.find().select("name")).map((t) => t.name));
  const toInsert = TOPICS.filter((t) => !existingNames.has(t.name));

  if (toInsert.length === 0) {
    console.log("✓ Every topic already exists — nothing to seed.");
    return;
  }

  await GuideTopic.insertMany(toInsert);
  console.log(`✓ Seeded ${toInsert.length} topic(s): ${toInsert.map((t) => t.name).join(", ")}`);
}

main()
  .catch((err) => {
    console.error("❌ seedGuideTopics failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
