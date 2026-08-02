/**
 * One-off setup for the official support account.
 *
 * Marks the account configured as SUPPORT_USER_ID as verified — both the
 * `verified` badge flag and email verification — so the checkmark renders
 * everywhere the app already reads those fields. Everything else about the
 * support account is behavioural and lives in code (see
 * server/src/utils/supportAccount.js); this is the only piece that's data.
 *
 * Idempotent — safe to re-run. Run once per environment after setting
 * SUPPORT_USER_ID:
 *
 *   cd server && node src/scripts/setupSupportAccount.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { SUPPORT_USER_ID } from "../utils/supportAccount.js";

async function main() {
  if (!SUPPORT_USER_ID) {
    console.error("❌ SUPPORT_USER_ID is not set. Add it to server/.env first.");
    process.exit(1);
  }

  if (!mongoose.isValidObjectId(SUPPORT_USER_ID)) {
    console.error(`❌ SUPPORT_USER_ID is not a valid ObjectId: ${SUPPORT_USER_ID}`);
    process.exit(1);
  }

  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);

  const before = await User.findById(SUPPORT_USER_ID)
    .select("_id username email verified emailVerifiedAt")
    .lean();

  if (!before) {
    console.error(`❌ No user found with _id ${SUPPORT_USER_ID}.`);
    console.error("   Create the support account first, then re-run this script.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const update = {};
  if (!before.verified) update.verified = true;
  // Only stamp the email-verification date if it isn't already set, so
  // re-running doesn't keep moving the timestamp forward.
  if (!before.emailVerifiedAt) update.emailVerifiedAt = new Date();

  if (Object.keys(update).length === 0) {
    console.log(`✅ Already set up: ${before.username} <${before.email}>`);
    console.log("   verified: true, emailVerifiedAt:", before.emailVerifiedAt);
  } else {
    await User.updateOne({ _id: SUPPORT_USER_ID }, { $set: update });
    console.log(`✅ Support account updated: ${before.username} <${before.email}>`);
    console.log("   Applied:", update);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("❌ Setup failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
