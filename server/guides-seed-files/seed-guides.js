/**
 * Real-world guide seeder — inserts ~100 hand-written city guides covering
 * real venues, restaurants, bars, museums and experiences in the world's top
 * tourist destinations, so the Guides feature looks alive and shows users
 * (and future guide sellers) what great guides look like.
 *
 *   node seed-guides.js                       # insert all guides (safe to re-run, skips existing)
 *   node seed-guides.js --clean               # remove every guide this script created
 *   node seed-guides.js --author you@mail.com # attach guides to a different account
 *
 * All guides are FREE (price 0), text-only (no images) and attributed to the
 * main NightVibe account (setemiloye@gmail.com by default). The account must
 * already exist in the database.
 *
 * Guide content lives in src/seed/guides-data/ — one file per city. Edit or
 * add cities there; this script just validates and inserts.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

import User from "./src/models/user.model.js";
import Guide from "./src/models/guide.model.js";
import { allGuides } from "./src/seed/guides-data/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const DEFAULT_AUTHOR_EMAIL = "setemiloye@gmail.com";

function getAuthorEmail() {
  const i = process.argv.indexOf("--author");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.SEED_AUTHOR_EMAIL || DEFAULT_AUTHOR_EMAIL;
}

// Deterministic view count per guide so the "top guides" carousel has a
// stable, plausible ordering (re-running the seed never reshuffles it).
function viewsFor(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return 150 + (h % 1350);
}

async function resolveAuthor() {
  const email = getAuthorEmail();
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error(
      `Author account not found for email "${email}". ` +
        `Create the account first or pass --author <email> / set SEED_AUTHOR_EMAIL.`
    );
  }
  return user;
}

async function clean() {
  const author = await resolveAuthor();
  // Only touch guides that exactly match this dataset (title + city + author),
  // so the author's own hand-made guides are never deleted.
  const keys = allGuides.map((g) => ({ title: g.title, city: g.city, author: author._id }));
  const res = await Guide.deleteMany({ $or: keys });
  console.log(`Removed ${res.deletedCount} seeded guides for ${author.email}.`);
}

async function seed() {
  const author = await resolveAuthor();
  console.log(`Author: ${author.username} <${author.email}>`);

  const existing = await Guide.find({ author: author._id }).select("title city");
  const existingKeys = new Set(existing.map((g) => `${g.title}|${g.city}`));

  const docs = [];
  let skipped = 0;
  for (const g of allGuides) {
    if (existingKeys.has(`${g.title}|${g.city}`)) {
      skipped++;
      continue;
    }
    docs.push({
      title: g.title,
      coverImage: "",
      author: author._id,
      authorName: author.username,
      description: g.description,
      price: 0,
      city: g.city,
      cityState: g.cityState,
      country: g.country,
      topic: g.topic,
      sections: g.sections.map((s) => ({
        title: s.title,
        rank: s.rank,
        description: s.description,
        image: "",
      })),
      isDraft: false,
      isActive: true,
      views: viewsFor(g.title),
    });
  }

  if (docs.length === 0) {
    console.log(`Nothing to insert — all ${allGuides.length} guides already exist (${skipped} skipped).`);
    return;
  }

  const inserted = await Guide.insertMany(docs, { ordered: false });

  const cities = new Set(inserted.map((g) => `${g.city}, ${g.country}`));
  console.log(`\n✅ Inserted ${inserted.length} guides (${skipped} already existed).`);
  console.log(`   Cities covered: ${cities.size}`);
  for (const c of [...cities].sort()) console.log(`   • ${c}`);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set — configure server/.env first.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");
  try {
    if (process.argv.includes("--clean")) {
      await clean();
    } else {
      await seed();
    }
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

main().catch((e) => {
  console.error("Seed error:", e.message || e);
  process.exit(1);
});
