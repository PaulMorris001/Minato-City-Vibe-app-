import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { sendPushNotification } from "../services/notification.service.js";

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

async function sendEventReminders() {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23h from now
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // 25h from now

  const events = await Event.find({
    date: { $gte: windowStart, $lte: windowEnd },
    isActive: true,
    reminderSent: { $ne: true },
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
        { _id: { $in: userIds }, fcmToken: { $ne: null } },
        { _id: 1, fcmToken: 1 }
      ).lean();

      const { title, body } = pickMessage(event._id, event.title);

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

      // Mark so this event doesn't get processed again
      await Event.updateOne({ _id: event._id }, { reminderSent: true });

      console.log(`[EventReminder] Reminded ${users.length} user(s) for "${event.title}"`);
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
