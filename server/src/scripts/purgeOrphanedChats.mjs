/**
 * One-off cleanup for accounts deleted BEFORE the deletion path started
 * purging conversations.
 *
 * Account deletion used to remove only the User, Follow and Notification
 * documents, so every chat a deleted account was in is still sitting in the
 * database with a participant id that resolves to nothing. The surviving side
 * can still open those threads and read the whole history.
 *
 * Finds every participant (and pending invitee) id that no longer has a User
 * document and runs the same purge the live deletion paths now run:
 * direct chats are deleted with their messages, group chats keep their
 * messages and just lose the ghost from their membership arrays.
 *
 * Phones hold their own copy of these threads in SQLite. They drop it on the
 * next inbox fetch after this runs — `pruneChatsNotIn` in
 * mobile/db/chatRepo.ts deletes any cached chat the server stopped returning —
 * and the mobile store migration (mobile/db/index.ts v2) clears the cache
 * outright on the first launch of the build that ships with this.
 *
 * DRY RUN BY DEFAULT. Writing needs an explicit --apply, because merely
 * importing this file runs main() and there is no undo on a deleteMany.
 *
 * The configured support account is excluded no matter what. Support has no
 * User document in some environments (chats are created against
 * config.support.userId directly), which makes it look exactly like a deleted
 * account to the check below — an earlier version of this script wiped every
 * support conversation on the dev database that way.
 *
 * Idempotent — safe to re-run:
 *
 *   cd server && node src/scripts/purgeOrphanedChats.mjs           # report only
 *   cd server && node src/scripts/purgeOrphanedChats.mjs --apply   # write
 */

import mongoose from "mongoose";
import config from "../config/env.js";
import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";
import chatService from "../services/chat.service.js";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

/**
 * Ids that look orphaned but must never be purged. The support account is the
 * live one; the second is a support id that shipped in an older mobile build
 * and still has conversations attached to it.
 */
const PROTECTED_IDS = new Set(
  [config.support?.userId, process.env.LEGACY_SUPPORT_USER_ID]
    .filter(Boolean)
    .map(String)
);

async function main() {
  await mongoose.connect(config.database.uri, config.database.options);
  console.log(`📊 Connected to: ${mongoose.connection.name}`);
  if (DRY_RUN) console.log("🔍 Dry run — nothing will be written. Pass --apply to write.\n");
  for (const id of PROTECTED_IDS) console.log(`🛡  Protected (never purged): ${id}`);

  // Every id any chat still points at, from both the membership array and the
  // pending-invite list (an account can be deleted mid-invite).
  const [participantIds, inviteeIds] = await Promise.all([
    Chat.distinct("participants"),
    Chat.distinct("pendingInvites.user"),
  ]);

  const referenced = new Map();
  for (const id of [...participantIds, ...inviteeIds]) {
    if (id) referenced.set(id.toString(), id);
  }
  console.log(`👥 ${referenced.size} distinct users referenced by chats`);

  const live = await User.find({ _id: { $in: [...referenced.values()] } })
    .select("_id")
    .lean();
  const liveIds = new Set(live.map((u) => u._id.toString()));

  const ghosts = [...referenced.values()].filter(
    (id) => !liveIds.has(id.toString()) && !PROTECTED_IDS.has(id.toString())
  );

  const protectedButMissing = [...PROTECTED_IDS].filter((id) => !liveIds.has(id));
  if (protectedButMissing.length) {
    console.warn(
      `⚠️  Protected id(s) have no User document: ${protectedButMissing.join(", ")}` +
        " — skipped. Run src/scripts/setupSupportAccount.mjs if that is unexpected."
    );
  }

  if (ghosts.length === 0) {
    console.log("✅ No orphaned conversations — nothing to do.");
    return;
  }

  console.log(`🗑  ${ghosts.length} deleted account(s) still have conversations`);

  let purged = 0;
  for (const ghostId of ghosts) {
    const chats = await Chat.find({
      $or: [{ participants: ghostId }, { "pendingInvites.user": ghostId }],
    })
      .select("_id type")
      .lean();
    const direct = chats.filter((c) => c.type === "direct").length;
    const groups = chats.length - direct;

    console.log(
      `   ${ghostId}: ${direct} direct chat(s) to delete, ${groups} group(s) to detach from`
    );

    if (!DRY_RUN) {
      await chatService.purgeUserChats(ghostId);
      purged++;
    }
  }

  console.log(
    DRY_RUN
      ? `\n🔍 Dry run complete — ${ghosts.length} account(s) would be purged.`
      : `\n✅ Purged conversations for ${purged} deleted account(s).`
  );
}

main()
  .catch((err) => {
    console.error("❌ Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
