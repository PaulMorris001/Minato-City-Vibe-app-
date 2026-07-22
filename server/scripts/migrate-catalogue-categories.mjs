/**
 * One-off migration: give every legacy flat `Service` a parent
 * `CatalogueCategory`.
 *
 * Before this change a vendor's catalogue was a flat list of services grouped
 * only by a free-text `section` string. The catalogue is now two-level
 * (Category → items), so each existing service needs a real category to live
 * in. We group each vendor's services by their `section` (falling back to the
 * legacy `category` string, then "General"), create one category per distinct
 * group (kind "service", since everything pre-migration was a rendered
 * service), and link each service to it.
 *
 * Idempotent:
 *   - services that already have `catalogueCategory` set are skipped;
 *   - categories are found-or-created by {vendor, name}, so a re-run never
 *     duplicates them.
 *
 * Usage:
 *   node scripts/migrate-catalogue-categories.mjs --dry-run   # report only
 *   node scripts/migrate-catalogue-categories.mjs             # apply
 */
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { Service } from "../src/models/service.model.js";
import { CatalogueCategory } from "../src/models/catalogueCategory.model.js";

const DRY_RUN = process.argv.includes("--dry-run");

function groupName(service) {
  const section = (service.section || "").trim();
  if (section) return section;
  const category = (service.category || "").trim();
  if (category) return category;
  return "General";
}

async function run() {
  await connectDB();

  // Only services that haven't been migrated yet.
  const services = await Service.find({
    catalogueCategory: { $in: [null, undefined] },
  }).select("_id vendor section category");

  console.log(
    `Found ${services.length} un-migrated service(s)${DRY_RUN ? " (dry run)" : ""}`
  );

  // Group by vendor → category name.
  const byVendor = new Map(); // vendorId -> Map(name -> [serviceId])
  for (const s of services) {
    const vendorId = String(s.vendor);
    const name = groupName(s);
    if (!byVendor.has(vendorId)) byVendor.set(vendorId, new Map());
    const groups = byVendor.get(vendorId);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(s._id);
  }

  let categoriesCreated = 0;
  let categoriesReused = 0;
  let servicesLinked = 0;

  for (const [vendorId, groups] of byVendor) {
    for (const [name, serviceIds] of groups) {
      let category = await CatalogueCategory.findOne({ vendor: vendorId, name });
      if (category) {
        categoriesReused++;
      } else if (DRY_RUN) {
        categoriesCreated++;
      } else {
        category = await CatalogueCategory.create({
          vendor: vendorId,
          name,
          kind: "service",
        });
        categoriesCreated++;
      }

      if (!DRY_RUN && category) {
        const result = await Service.updateMany(
          { _id: { $in: serviceIds } },
          { $set: { catalogueCategory: category._id, kind: "service" } }
        );
        servicesLinked += result.modifiedCount;
      } else {
        servicesLinked += serviceIds.length;
      }
    }
  }

  console.log(
    `Categories: ${categoriesCreated} to create, ${categoriesReused} reused. ` +
      `Services linked: ${servicesLinked}.`
  );

  await mongoose.connection.close();
  console.log(DRY_RUN ? "Dry run complete (no writes)." : "Migration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
