import crypto from "crypto";
import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import Attendance from "../models/attendance.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { sendPushNotification } from "../services/notification.service.js";
import { sendEventReminderEmail } from "../services/email.service.js";

/** Base for the event deep link, same host the share/preview routes use. */
const SITE_BASE = "https://api.ourcityvibe.com";

/** How many reminder emails to have in flight at once. */
const EMAIL_BATCH_SIZE = 5;

const MESSAGES = [
  (title) => ({ title: "See you tomorrow! 🎉", body: `Hope you're getting ready — ${title} is happening tomorrow!` }),
  (title) => ({ title: "Tomorrow's the night 🌙", body: `Don't forget, ${title} is coming up tomorrow. Get ready!` }),
  (title) => ({ title: "Almost time! 🔥", body: `${title} is tomorrow. Time to get excited!` }),
  (title) => ({ title: "Your night starts tomorrow ✨", body: `${title} is almost here. See you there!` }),
  (title) => ({ title: "Reminder 🎊", body: `${title} is happening tomorrow — can't wait to see you!` }),
];

function pickMessage(eventId, title) {
  // Deterministic pick per event so the same event always sends the same variant
  const idx = parseInt(eventId.toString().slice(-4), 16) % MESSAGES.length;
  return MESSAGES[idx](title);
}

function formatEventDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Every address worth emailing about this event, deduped case-insensitively.
 *
 * Two sources, because they don't overlap cleanly:
 *   - registered recipients (creator, invited, RSVP'd, ticket holders), each of
 *     whom can opt out and gets a personalised unsubscribe link;
 *   - pass recipient emails, which cover gifted tickets and guest checkouts
 *     where the QR went to someone who never installed the app.
 */
async function collectEmailTargets(event, users) {
  const targets = new Map(); // lowercased email -> { email, username, unsubscribeUrl }

  for (const user of users) {
    if (!user.email) continue;
    if (user.notificationPrefs?.eventReminderEmails === false) continue;

    // Mint the opt-out token on first use so old accounts get one too.
    let token = user.unsubscribeToken;
    if (!token) {
      token = crypto.randomUUID();
      await User.updateOne({ _id: user._id }, { $set: { unsubscribeToken: token } });
    }

    targets.set(user.email.toLowerCase(), {
      email: user.email,
      username: user.username,
      unsubscribeUrl: `${SITE_BASE}/unsubscribe/${token}`,
    });
  }

  const [passes, tickets] = await Promise.all([
    Attendance.find({ event: event._id, recipientEmail: { $ne: null } })
      .select("recipientEmail")
      .lean(),
    Ticket.find({ event: event._id, isValid: true, recipientEmail: { $ne: null } })
      .select("recipientEmail")
      .lean(),
  ]);

  for (const row of [...passes, ...tickets]) {
    const email = (row.recipientEmail || "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (targets.has(key)) continue;
    // Pass-only recipients have no account to hang a preference on; the footer
    // drops the unsubscribe link rather than pointing at a token we can't mint.
    targets.set(key, { email, username: "", unsubscribeUrl: "" });
  }

  return [...targets.values()];
}

/** Send in small batches — the mailer opens a fresh SMTP connection per send. */
async function sendEmails(targets, event) {
  const eventDateText = formatEventDate(event.date);
  const eventLocation = event.address || event.location || "";
  const eventUrl = `${SITE_BASE}/event/${event.shareToken || event._id}`;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += EMAIL_BATCH_SIZE) {
    const batch = targets.slice(i, i + EMAIL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((t) =>
        sendEventReminderEmail(t.email, {
          username: t.username || "there",
          eventTitle: event.title,
          eventDateText,
          eventLocation,
          eventUrl,
          unsubscribeUrl: t.unsubscribeUrl,
        }).catch(() => ({ success: false }))
      )
    );
    for (const r of results) (r?.success ? sent++ : failed++);
  }

  return { sent, failed };
}

export async function sendEventReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23h from now
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // 25h from now

  const events = await Event.find({
    date: { $gte: windowStart, $lte: windowEnd },
    isActive: true,
    reminderSent: { $ne: true },
    cancelledAt: null,
    approvalStatus: { $ne: "rejected" },
  }).lean();

  if (events.length === 0) return;

  console.log(`[EventReminder] Processing ${events.length} event(s)`);

  for (const event of events) {
    try {
      // Collect all affiliated user IDs (deduplicated)
      const ticketHolders = await Ticket.find({ event: event._id, isValid: true })
        .distinct("user");

      const userIds = [
        ...new Set([
          String(event.createdBy),
          ...event.invitedUsers.map(String),
          ...event.rsvpUsers.map(String),
          ...ticketHolders.map(String),
        ]),
      ];

      const users = await User.find(
        { _id: { $in: userIds }, isBanned: { $ne: true } },
        { _id: 1, email: 1, username: 1, fcmToken: 1, notificationPrefs: 1, unsubscribeToken: 1 }
      ).lean();

      const { title, body } = pickMessage(event._id, event.title);

      // In-app notification for everyone affiliated; push only where we hold a
      // token (users without one now still see the reminder in the app).
      const notificationDocs = [];
      const pushPromises = [];

      for (const user of users) {
        notificationDocs.push({
          user: user._id,
          type: "general",
          title,
          body,
          data: { eventId: String(event._id) },
        });

        if (user.fcmToken) {
          pushPromises.push(
            sendPushNotification(user.fcmToken, title, body, {
              type: "event_reminder",
              eventId: String(event._id),
            })
          );
        }
      }

      await Promise.all([
        Notification.insertMany(notificationDocs, { ordered: false }),
        ...pushPromises,
      ]);

      const targets = await collectEmailTargets(event, users);
      const { sent, failed } = await sendEmails(targets, event);

      // Mark so this event doesn't get processed again
      await Event.updateOne({ _id: event._id }, { reminderSent: true });

      console.log(
        `[EventReminder] "${event.title}": pushed ${pushPromises.length} · emailed ${sent} · failed ${failed}`
      );
    } catch (err) {
      console.error(`[EventReminder] Error processing event ${event._id}:`, err?.message ?? err);
    }
  }
}

export function startEventReminderJob() {
  // Run once on startup to catch any missed window, then every hour
  sendEventReminders().catch(console.error);
  setInterval(() => sendEventReminders().catch(console.error), 60 * 60 * 1000);
  console.log("[EventReminder] Job started — checking every hour");
}
