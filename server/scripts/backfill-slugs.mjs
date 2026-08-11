/**
 * One-off backfill: give every existing Event, Guide and User a share slug.
 *
 * New documents get their slug from the pre-save hooks; this fills in
 * everything created before the field existed so human-readable links
 * (/event/lagos-beach-party, /user/setemil) resolve for old content too.
 * Events/guides slugify their title, users their username (users also check
 * slugHistory so a candidate never collides with a slug someone used to own).
 *
 * Idempotent:
 *   - documents that already have a slug are never touched;
 *   - documents whose title/username yields no latin characters are skipped
 *     (their links keep falling back to shareToken/_id).
 *
 * Run only after the deploy that ships the slug fields — the unique sparse
 * indexes are the concurrency backstop for the generator.
 *
 * Usage:
 *   node scripts/backfill-slugs.mjs --dry-run   # report only
 *   node scripts/backfill-slugs.mjs             # apply
 */
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import Event from "../src/models/event.model.js";
import Guide from "../src/models/guide.model.js";
import User from "../src/models/user.model.js";
import { slugify, generateUniqueSlug } from "../src/utils/slug.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function backfillModel({ label, Model, sourceField, historyField }) {
  const total = await Model.countDocuments({});

  // Only documents that haven't been slugged yet ($in: [null] also matches
  // documents where the field is entirely absent).
  const missing = await Model.find({ slug: { $in: [null, undefined] } }).select(
    `_id ${sourceField}`
  );
  const alreadyHad = total - missing.length;

  let filled = 0;
  let skippedEmpty = 0;

  for (const doc of missing) {
    const base = slugify(doc[sourceField] || "");
    if (!base) {
      skippedEmpty++;
      continue;
    }

    const slug = await generateUniqueSlug(Model, base, {
      excludeId: doc._id,
      ...(historyField && { historyField }),
    });
    if (!slug) {
      skippedEmpty++;
      continue;
    }

    if (!DRY_RUN) {
      await Model.updateOne({ _id: doc._id }, { $set: { slug } });
    }
    filled++;
  }

  console.log(
    `${label}: ${filled} filled, ${skippedEmpty} skipped (empty base), ` +
      `${alreadyHad} already had a slug (${total} total)${DRY_RUN ? " [dry run]" : ""}`
  );
}

async function run() {
  await connectDB();

  await backfillModel({ label: "Events", Model: Event, sourceField: "title" });
  await backfillModel({ label: "Guides", Model: Guide, sourceField: "title" });
  await backfillModel({
    label: "Users",
    Model: User,
    sourceField: "username",
    historyField: "slugHistory",
  });

  await mongoose.connection.close();
  console.log(DRY_RUN ? "Dry run complete (no writes)." : "Backfill complete.");
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
