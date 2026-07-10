import mongoose from "mongoose";
import dotenv from "dotenv";
import { VendorType } from "../models/vendor.model.js";
import { vendorTypes } from "./seed.js";

dotenv.config();

/**
 * Idempotently upsert the vendor type catalog ONLY. Safe to run against
 * production — unlike seed.js, it never touches cities or generates fake
 * vendors. Run after adding new types to the vendorTypes array in seed.js:
 *
 *   node src/seed/upsertVendorTypes.js
 */
async function upsertVendorTypes() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const result = await VendorType.bulkWrite(
    vendorTypes.map((t) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(t._id) },
        update: { $set: { name: t.name, icon: t.icon } },
        upsert: true,
      },
    }))
  );

  console.log(
    `✓ Vendor types upserted: ${result.upsertedCount} new, ${result.modifiedCount} updated, ${vendorTypes.length} total`
  );
  await mongoose.disconnect();
}

upsertVendorTypes().catch((err) => {
  console.error("Error upserting vendor types:", err);
  process.exit(1);
});
