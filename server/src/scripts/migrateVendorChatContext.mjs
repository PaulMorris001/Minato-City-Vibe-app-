/**
 * One-off migration for the vendor/client chat separation.
 *
 * Before this feature, a client↔vendor order conversation was an ordinary
 * direct chat, indistinguishable from a friend chat. This script stamps every
 * chat that has at least one order attached as a vendor-context chat
 * (`context: 'vendor'`, `vendorParticipant: <the order's vendor>`), which
 * moves it into the vendor's business inbox and the customer's client inbox.
 *
 * Chats without orders are left untouched — the query layer treats a missing
 * `context` as 'personal'.
 *
 * If a chat somehow carries orders from two different vendors (both users
 * ordered from each other in the same thread), the most recent order wins and
 * a warning is logged so it can be reviewed by hand.
 *
 * Idempotent — safe to re-run:
 *
 *   cd server && node src/scripts/migrateVendorChatContext.mjs
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import Chat from "../models/chat.model.js";
import { Order } from "../models/order.model.js";

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);

  // Newest first, so the first vendor we see per chat is the most recent one.
  const orders = await Order.find({ chat: { $ne: null } })
    .select("chat vendor createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const vendorByChat = new Map();
  const conflicts = new Set();
  for (const order of orders) {
    const chatId = order.chat.toString();
    const vendorId = order.vendor?.toString();
    if (!vendorId) continue;
    const existing = vendorByChat.get(chatId);
    if (!existing) {
      vendorByChat.set(chatId, vendorId);
    } else if (existing !== vendorId) {
      conflicts.add(chatId);
    }
  }

  console.log(`Found ${vendorByChat.size} order-linked chats to stamp.`);
  for (const chatId of conflicts) {
    console.warn(
      `⚠️  Chat ${chatId} has orders from multiple vendors — keeping the most recent vendor (${vendorByChat.get(chatId)}).`
    );
  }

  let updated = 0;
  let alreadyDone = 0;
  for (const [chatId, vendorId] of vendorByChat) {
    const result = await Chat.updateOne(
      {
        _id: chatId,
        $or: [
          { context: { $ne: "vendor" } },
          { vendorParticipant: { $ne: vendorId } },
        ],
      },
      { $set: { context: "vendor", vendorParticipant: vendorId } }
    );
    if (result.modifiedCount > 0) updated += 1;
    else alreadyDone += 1;
  }

  console.log(`✅ Done. Updated ${updated} chats, ${alreadyDone} already migrated.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("❌ Migration failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
