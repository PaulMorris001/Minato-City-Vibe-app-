import crypto from "crypto";
import EmailBroadcast from "../models/emailBroadcast.model.js";
import EmailQuota from "../models/emailQuota.model.js";
import User from "../models/user.model.js";
import { sendBroadcastEmail, createBroadcastTransporter } from "../services/email.service.js";
import config from "../config/env.js";

/**
 * Works through admin broadcast emails (admin "Email Users" page) a little at
 * a time. Deliberately slow: broadcasts go out through the same mailbox as
 * password resets, signup codes and tickets, so they're capped per UTC day
 * (config.emailBroadcast.dailyCap) and paced per minute. A send bigger than
 * the cap pauses and picks up again the next day on its own.
 */

const SITE_BASE = "https://api.ourcityvibe.com";
const TICK_MS = 60 * 1000;
/** Emails per tick — ~1,200 an hour at most, gentle on the SMTP account. */
const PER_TICK = 20;
/** How long a claimed broadcast stays locked if this instance dies mid-tick. */
const LOCK_MS = 5 * 60 * 1000;

const todayKey = () => new Date().toISOString().slice(0, 10);

/** Broadcast emails already sent today, across every broadcast. */
export async function broadcastsSentToday() {
  const quota = await EmailQuota.findOne({ day: todayKey() }).lean();
  return quota?.count || 0;
}

/** Whether a user doc should be emailed right now — re-checked at send time. */
function isEmailable(user) {
  return (
    !!user?.email &&
    !user.isBanned &&
    !user.isGuest &&
    user.notificationPrefs?.announcementEmails !== false
  );
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  let claimed = null;
  try {
    const now = new Date();
    claimed = await EmailBroadcast.findOneAndUpdate(
      {
        status: { $in: ["queued", "sending", "paused_daily_cap"] },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
      },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!claimed) return;

    const room = config.emailBroadcast.dailyCap - (await broadcastsSentToday());
    if (room <= 0) {
      if (claimed.status !== "paused_daily_cap") {
        await EmailBroadcast.updateOne(
          { _id: claimed._id, status: { $ne: "cancelled" } },
          { $set: { status: "paused_daily_cap" } }
        );
      }
      return;
    }

    const slice = claimed.recipients.slice(claimed.nextIndex, claimed.nextIndex + Math.min(PER_TICK, room));
    const users = await User.find({ _id: { $in: slice } })
      .select("email username isBanned isGuest notificationPrefs unsubscribeToken")
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const transporter = slice.length ? createBroadcastTransporter() : null;
    for (const id of slice) {
      const user = byId.get(String(id));
      if (!isEmailable(user)) {
        skipped++;
        continue;
      }
      // Minted on first use, same as the reminder emails, so old accounts get one.
      let token = user.unsubscribeToken;
      if (!token) {
        token = crypto.randomUUID();
        await User.updateOne({ _id: user._id }, { $set: { unsubscribeToken: token } });
      }
      const result = await sendBroadcastEmail(user.email, {
        username: user.username,
        subject: claimed.subject,
        body: claimed.body,
        ctaLabel: claimed.ctaLabel,
        ctaUrl: claimed.ctaUrl,
        unsubscribeUrl: `${SITE_BASE}/unsubscribe/${token}?list=announcements`,
        transporter,
      });
      if (result.success) {
        sent++;
        await EmailQuota.updateOne({ day: todayKey() }, { $inc: { count: 1 } }, { upsert: true });
      } else {
        failed++;
      }
    }
    transporter?.close?.();

    const nextIndex = claimed.nextIndex + slice.length;
    const finished = nextIndex >= claimed.total;
    // Counts always land — even on a broadcast cancelled mid-tick, those
    // emails really went out. Status only moves if it wasn't cancelled.
    await EmailBroadcast.updateOne({ _id: claimed._id }, { $inc: { sent, failed, skipped }, $set: { nextIndex } });
    await EmailBroadcast.updateOne(
      { _id: claimed._id, status: { $ne: "cancelled" } },
      {
        $set: {
          status: finished ? "done" : "sending",
          startedAt: claimed.startedAt || now,
          ...(finished ? { finishedAt: new Date() } : {}),
        },
      }
    );
    if (finished) {
      console.log(`[EmailBroadcast] "${claimed.subject}" finished — ${claimed.total} recipient(s)`);
    }
  } catch (err) {
    console.error("[EmailBroadcast] Tick failed:", err?.message ?? err);
  } finally {
    if (claimed) {
      await EmailBroadcast.updateOne({ _id: claimed._id }, { $set: { lockedUntil: null } }).catch(() => {});
    }
    running = false;
  }
}

export function startEmailBroadcastJob() {
  // Resume anything left mid-send by a restart, then keep going every minute.
  tick();
  setInterval(tick, TICK_MS);
  console.log(
    `[EmailBroadcast] Job started — up to ${PER_TICK}/min, ${config.emailBroadcast.dailyCap}/day`
  );
}
