import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

/**
 * One-time cleanup before relaunch. Removes:
 *
 *   1. The personal dev account `setemiloye@gmail.com`
 *      → all its events, guides, tickets, group chats
 *   2. All `@demo.nightvibe.app` accounts created by `seed-demo.js`
 *      → all their events, guides, tickets, group chats, follows
 *   3. The standalone seeded vendors from `src/seed/seed.js`
 *      (one per vendor-type per city; identifiable because they have no
 *      linked `user` ObjectId — real vendors always do)
 *      → those vendors' services and bookings
 *
 * Does NOT touch:
 *   - Cities (reused as reference data)
 *   - VendorTypes (reused as reference data)
 *   - Real user accounts and their content
 *   - ExternalEvents (provider-ingested events)
 *
 * Defaults to dry-run. Add --execute to actually delete:
 *   node migrate-clear-test-data.js              # dry run, prints counts
 *   node migrate-clear-test-data.js --execute    # actually deletes
 */

const TEST_EMAIL_REGEX = /^setemiloye@gmail\.com$|@demo\.nightvibe\.app$/i;

async function migrate() {
  const execute = process.argv.includes("--execute");
  const tag = execute ? "[EXECUTE]" : "[DRY-RUN]";

  try {
    console.log(`${tag} Connecting to MongoDB...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`${tag} Connected.\n`);

    // Use loose schemas so we don't depend on model imports & defaults.
    const User = mongoose.model("user", new mongoose.Schema({}, { strict: false }));
    const Event = mongoose.model("event", new mongoose.Schema({}, { strict: false }));
    const Guide = mongoose.model("guide", new mongoose.Schema({}, { strict: false }));
    const Ticket = mongoose.model("ticket", new mongoose.Schema({}, { strict: false }));
    const Chat = mongoose.model("chat", new mongoose.Schema({}, { strict: false }));
    const Vendor = mongoose.model("vendor", new mongoose.Schema({}, { strict: false }));
    const Service = mongoose.model(
      "service",
      new mongoose.Schema({}, { strict: false })
    );
    const Booking = mongoose.model(
      "booking",
      new mongoose.Schema({}, { strict: false })
    );
    const Follow = mongoose.model("follow", new mongoose.Schema({}, { strict: false }));
    const Notification = mongoose.model(
      "notification",
      new mongoose.Schema({}, { strict: false })
    );

    // ── 1. Identify test users ──────────────────────────────────────────────
    const testUsers = await User.find(
      { email: { $regex: TEST_EMAIL_REGEX } },
      { _id: 1, email: 1, username: 1 }
    ).lean();

    const testUserIds = testUsers.map((u) => u._id);
    console.log(`Test users to delete: ${testUsers.length}`);
    testUsers.slice(0, 10).forEach((u) =>
      console.log(`  - ${u.email} (${u.username || "no username"})`)
    );
    if (testUsers.length > 10) console.log(`  ... and ${testUsers.length - 10} more`);

    // ── 2. Find their events + collect chat IDs ─────────────────────────────
    const testEvents = await Event.find(
      { createdBy: { $in: testUserIds } },
      { _id: 1, groupChatId: 1 }
    ).lean();
    const testEventIds = testEvents.map((e) => e._id);
    const testChatIds = testEvents
      .map((e) => e.groupChatId)
      .filter((id) => id != null);
    console.log(
      `\nEvents by test users: ${testEvents.length} (with ${testChatIds.length} group chats)`
    );

    // ── 3. Find their guides ────────────────────────────────────────────────
    const testGuides = await Guide.find(
      { author: { $in: testUserIds } },
      { _id: 1 }
    ).lean();
    console.log(`Guides by test users: ${testGuides.length}`);

    // ── 4. Find seed vendors (no `user` reference, OR matching seed patterns)
    // Real vendors are created via the vendor signup flow and always have
    // `user` set. The seed script in src/seed/seed.js creates standalone
    // vendor records with no `user` field — that's our signature.
    const seedVendors = await Vendor.find(
      {
        $or: [
          { user: { $exists: false } },
          { user: null },
          // Fallback signature: images hosted on picsum.photos (used by the
          // seed script) or phone numbers starting with the test "(555) " block.
          { "images.0": /picsum\.photos/ },
          { "contact.phone": /^\(555\)/ },
        ],
      },
      { _id: 1, name: 1, user: 1 }
    ).lean();
    const seedVendorIds = seedVendors.map((v) => v._id);
    console.log(`\nSeed vendors to delete: ${seedVendors.length}`);
    seedVendors.slice(0, 5).forEach((v) =>
      console.log(`  - ${v.name} (user: ${v.user || "null"})`)
    );
    if (seedVendors.length > 5) console.log(`  ... and ${seedVendors.length - 5} more`);

    // ── 5. Find services + bookings tied to seed vendors ────────────────────
    const seedServices = await Service.find(
      { vendor: { $in: seedVendorIds } },
      { _id: 1 }
    ).lean();
    const seedServiceIds = seedServices.map((s) => s._id);
    console.log(`Services under seed vendors: ${seedServices.length}`);

    const seedBookingsCount = await Booking.countDocuments({
      vendor: { $in: seedVendorIds },
    });
    console.log(`Bookings under seed vendors: ${seedBookingsCount}`);

    // ── 6. Tickets to nuke: bought by test users OR for test events ─────────
    const ticketCount = await Ticket.countDocuments({
      $or: [
        { user: { $in: testUserIds } },
        { event: { $in: testEventIds } },
      ],
    });
    console.log(`\nTickets to delete: ${ticketCount}`);

    console.log("\n──────────────────────────────────────────────────");
    if (!execute) {
      console.log("DRY RUN — nothing was deleted.");
      console.log("Re-run with --execute to actually delete.");
      await mongoose.disconnect();
      return;
    }

    // ── 7. Cascade delete in dependency order ───────────────────────────────
    console.log("\nExecuting deletes...\n");

    const ticketRes = await Ticket.deleteMany({
      $or: [
        { user: { $in: testUserIds } },
        { event: { $in: testEventIds } },
      ],
    });
    console.log(`✓ Deleted ${ticketRes.deletedCount} tickets`);

    const bookingRes = await Booking.deleteMany({
      vendor: { $in: seedVendorIds },
    });
    console.log(`✓ Deleted ${bookingRes.deletedCount} bookings`);

    const serviceRes = await Service.deleteMany({
      _id: { $in: seedServiceIds },
    });
    console.log(`✓ Deleted ${serviceRes.deletedCount} services`);

    const chatRes = await Chat.deleteMany({ _id: { $in: testChatIds } });
    console.log(`✓ Deleted ${chatRes.deletedCount} chats`);

    const eventRes = await Event.deleteMany({ _id: { $in: testEventIds } });
    console.log(`✓ Deleted ${eventRes.deletedCount} events`);

    const guideRes = await Guide.deleteMany({
      _id: { $in: testGuides.map((g) => g._id) },
    });
    console.log(`✓ Deleted ${guideRes.deletedCount} guides`);

    const vendorRes = await Vendor.deleteMany({ _id: { $in: seedVendorIds } });
    console.log(`✓ Deleted ${vendorRes.deletedCount} vendors`);

    // Best-effort cleanup of follows + notifications referencing test users
    // (these aren't critical to remove — orphaned refs are harmless — but
    // they keep the DB tidy).
    const followRes = await Follow.deleteMany({
      $or: [
        { follower: { $in: testUserIds } },
        { following: { $in: testUserIds } },
      ],
    });
    console.log(`✓ Deleted ${followRes.deletedCount} follow records`);

    const notifRes = await Notification.deleteMany({
      $or: [
        { user: { $in: testUserIds } },
        { from: { $in: testUserIds } },
      ],
    });
    console.log(`✓ Deleted ${notifRes.deletedCount} notifications`);

    const userRes = await User.deleteMany({ _id: { $in: testUserIds } });
    console.log(`✓ Deleted ${userRes.deletedCount} users`);

    console.log("\n──────────────────────────────────────────────────");
    console.log("Cleanup complete.");

    await mongoose.disconnect();
  } catch (err) {
    console.error("\nMigration error:", err);
    process.exit(1);
  }
}

migrate();
