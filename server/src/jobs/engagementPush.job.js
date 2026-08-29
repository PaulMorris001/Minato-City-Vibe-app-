import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import { sendPushNotification } from "../services/notification.service.js";

/**
 * "Come see what's on" nudge — twice a week, to every user we hold a push
 * token for, naming a real upcoming event in their city.
 *
 * Push only, no Notification doc: this is a re-engagement nudge, not something
 * the user needs to find again later, and the in-app notifications list is for
 * things that happened to them. That's why it calls sendPushNotification
 * directly instead of notifyUser().
 */

/** UTC hour the nudge goes out on a send day. */
const SEND_HOUR_UTC = 18;
/** Send days, JS getUTCDay(): 3 = Wednesday, 6 = Saturday. */
const SEND_DAYS = new Set([3, 6]);
/**
 * Minimum gap between nudges to the same user. Three days is what makes "twice
 * a week" hold even if the job restarts inside a send hour or a tick is missed.
 */
const MIN_GAP_MS = 3 * 24 * 60 * 60 * 1000;
/** How far ahead to look for something worth mentioning. */
const EVENT_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;
/** Pushes in flight at once, so a big city doesn't open 5000 sockets. */
const PUSH_BATCH_SIZE = 25;

/** Copy for users whose city has a real event coming up. */
const EVENT_MESSAGES = [
  (title, city) => ({ title: `${city} this week 👀`, body: `${title} is coming up. Tap to take a look.` }),
  (title) => ({ title: "Something's on near you 🎉", body: `${title} — see who else is going.` }),
  (title, city) => ({ title: `Plans yet? 🌙`, body: `${title} is happening in ${city}. Have a look.` }),
  (title) => ({ title: "Worth a look 🔥", body: `${title} just caught our eye. Yours too?` }),
  (title, city) => ({ title: `New in ${city} ✨`, body: `${title} — tap for the details.` }),
];

/** Fallback for users with no city, or a city with nothing on. */
const GENERIC_MESSAGES = [
  { title: "Something's always on 👀", body: "New events just landed. Come see what's happening near you." },
  { title: "Miss us? 🎉", body: "There's a fresh batch of events waiting. Take a look." },
  { title: "Your next night out ✨", body: "Have a scroll — something new might catch your eye." },
  { title: "Plans this weekend? 🌙", body: "See what's happening around you on Cityvibe." },
];

/**
 * Deterministic per user, so two people in the same city don't get identical
 * copy and one person doesn't get the same line twice running.
 */
function pickVariant(userId, count) {
  return parseInt(String(userId).slice(-4), 16) % count;
}

/** Send in bounded batches so a large city can't flood the FCM connection. */
async function sendInBatches(jobs) {
  for (let i = 0; i < jobs.length; i += PUSH_BATCH_SIZE) {
    await Promise.allSettled(jobs.slice(i, i + PUSH_BATCH_SIZE).map((run) => run()));
  }
}

export async function sendEngagementPushes() {
  const now = new Date();
  if (!SEND_DAYS.has(now.getUTCDay()) || now.getUTCHours() !== SEND_HOUR_UTC) return;

  const users = await User.find(
    {
      fcmToken: { $nin: [null, ""] },
      isBanned: { $ne: true },
      $or: [
        { lastEngagementPushAt: null },
        { lastEngagementPushAt: { $lt: new Date(now.getTime() - MIN_GAP_MS) } },
      ],
    },
    { _id: 1, fcmToken: 1, pushCity: 1, "location.city": 1 }
  ).lean();

  if (users.length === 0) {
    console.log("[EngagementPush] Nobody due — skipping");
    return;
  }

  // pushCity is where they're browsing (refreshed every launch); location.city
  // is the account address they filled in for payouts. Prefer the former, fall
  // back to the latter, and accept that some users have neither.
  const cityOf = (user) => user.pushCity || user.location?.city || null;

  // One event lookup per distinct city rather than per user. Covered by the
  // existing { city: 1, date: 1 } index on events.
  const cities = [...new Set(users.map(cityOf).filter(Boolean))];
  const horizon = new Date(now.getTime() + EVENT_HORIZON_MS);
  const featured = new Map();

  for (const city of cities) {
    const event = await Event.findOne(
      { isPublic: true, isActive: true, city, date: { $gt: now, $lt: horizon } },
      { _id: 1, title: 1 }
    )
      .sort({ date: 1 })
      .lean();
    if (event) featured.set(city, event);
  }

  const jobs = [];
  const pushedIds = [];

  for (const user of users) {
    const city = cityOf(user);
    const event = city ? featured.get(city) : null;
    const { title, body } = event
      ? EVENT_MESSAGES[pickVariant(user._id, EVENT_MESSAGES.length)](event.title, city)
      : GENERIC_MESSAGES[pickVariant(user._id, GENERIC_MESSAGES.length)];

    // No eventId on the generic variant — the app treats that as "just open",
    // rather than trying and failing to resolve a deep link.
    const data = { type: "event_suggestion" };
    if (event) data.eventId = String(event._id);

    pushedIds.push(user._id);
    jobs.push(() => sendPushNotification(user.fcmToken, title, body, data));
  }

  await sendInBatches(jobs);

  // Stamped whether or not FCM accepted the token: a dead token would
  // otherwise make that user eligible on every single tick forever.
  await User.updateMany(
    { _id: { $in: pushedIds } },
    { $set: { lastEngagementPushAt: now } }
  );

  console.log(
    `[EngagementPush] Sent ${jobs.length} across ${cities.length} cities · ${featured.size} with a featured event`
  );
}

export function startEngagementPushJob() {
  // Hourly, and — unlike the reminder job — deliberately NOT run once on
  // startup: that would fire a blast on every deploy that happened to land in
  // the send hour. The send-day/hour check narrows this to twice a week, and
  // the per-user stamp is what stops repeats when the process restarts.
  setInterval(() => sendEngagementPushes().catch(console.error), 60 * 60 * 1000);
  console.log("[EngagementPush] Job started — checking every hour");
}
