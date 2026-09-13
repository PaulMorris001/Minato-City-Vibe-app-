import mongoose from "mongoose";
import Announcement from "../models/announcement.model.js";
import User from "../models/user.model.js";
import { notifyUser } from "../services/notification.service.js";

/**
 * Admin broadcasts.
 *
 * Fans out through notifyUser() rather than sendPushNotification() so every
 * recipient gets the durable in-app Notification as well as the push. A push
 * alone is invisible to anyone whose token is stale or who never granted
 * permission — which is exactly the gap users reported.
 */

/** Recipients notified at once, so a big send can't open thousands of sockets. */
const NOTIFY_BATCH_SIZE = 25;

const TITLE_MAX = 80;
const BODY_MAX = 240;
/** Hand-picked recipients per send. Past this, target a location or a group. */
const MAX_PICKED_USERS = 500;
/** Entries allowed per location target, to bound the generated $or. */
const MAX_TARGET_VALUES = 100;

const NON_EMPTY = { $nin: [null, ""] };

/**
 * Derived audience cohorts the console offers alongside locations and
 * hand-picked people. These are computed from account state rather than stored
 * membership, so they can never go stale — there is no group collection and
 * nothing to keep in sync.
 *
 * `id` is what the console sends back in `targets.groupIds`.
 */
const GROUPS = [
  { id: "vendors", name: "Vendors / business accounts", match: { isVendor: true } },
];

const groupById = (id) => GROUPS.find((g) => g.id === id);

const trimmed = (value) => String(value ?? "").trim();

/** Cap a target list and drop blank entries, keeping the caller's order. */
const bounded = (value, max = MAX_TARGET_VALUES) =>
  Array.isArray(value) ? value.slice(0, max) : [];

/**
 * Turn the request's audience into a Mongo query plus a human summary.
 *
 * Targets are OR-ed: an account matching ANY of them is included, so each
 * target added makes the audience BIGGER. That is what the console asks for,
 * and why it says so on the compose form.
 *
 * Returns `{ audience, query, summary, targets }`, or `{ error }`.
 */
function buildAudience(body) {
  const audience = ["all", "city", "targeted"].includes(body?.audience)
    ? body.audience
    : "all";

  if (audience === "all") {
    return { audience, query: { isBanned: { $ne: true } }, summary: "Everyone" };
  }

  // Original single-city form. A bare city name has no country/state to
  // qualify it, so it matches either location field on name alone.
  if (audience === "city") {
    const city = trimmed(body?.city);
    if (!city) return { error: "city is required when audience is 'city'" };
    return {
      audience,
      city,
      query: {
        isBanned: { $ne: true },
        $or: [{ "location.city": city }, { pushCity: city }],
      },
      summary: city,
    };
  }

  const countries = bounded(body?.targets?.countries)
    .map(trimmed)
    .filter(Boolean);
  const states = bounded(body?.targets?.states)
    .map((s) => ({ country: trimmed(s?.country), state: trimmed(s?.state) }))
    .filter((s) => s.country && s.state);
  const cities = bounded(body?.targets?.cities)
    .map((c) => ({
      country: trimmed(c?.country),
      state: trimmed(c?.state),
      city: trimmed(c?.city),
    }))
    .filter((c) => c.country && c.state && c.city);
  const groupIds = bounded(body?.targets?.groupIds).map(trimmed).filter(Boolean);

  const unknownGroup = groupIds.find((id) => !groupById(id));
  if (unknownGroup) return { error: `Unknown group "${unknownGroup}"` };

  const rawIds = bounded(body?.targets?.userIds, MAX_PICKED_USERS)
    .map(trimmed)
    .filter(Boolean);
  const badId = rawIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (badId) return { error: `"${badId}" is not a valid user id` };
  const userIds = rawIds.map((id) => new mongoose.Types.ObjectId(id));

  const or = [];
  const summary = [];

  if (countries.length) {
    or.push({ "location.country": { $in: countries } });
    summary.push(countries.join(", "));
  }
  for (const { country, state } of states) {
    or.push({ "location.country": country, "location.state": state });
  }
  if (states.length) summary.push(states.map((s) => `${s.state}, ${s.country}`).join(", "));

  for (const { country, state, city } of cities) {
    // The qualified match is the account address. `pushCity` is the city the
    // app was last browsing and carries no country/state at all, so it can
    // only be matched on name — worth it, since for most accounts it is the
    // ONLY location signal we hold.
    or.push({ "location.country": country, "location.state": state, "location.city": city });
    or.push({ pushCity: city });
  }
  if (cities.length) summary.push(cities.map((c) => c.city).join(", "));

  if (userIds.length) {
    or.push({ _id: { $in: userIds } });
    summary.push(`${userIds.length} chosen ${userIds.length === 1 ? "person" : "people"}`);
  }
  for (const id of groupIds) or.push(groupById(id).match);
  if (groupIds.length) summary.push(groupIds.map((id) => groupById(id).name).join(", "));

  if (or.length === 0) {
    return { error: "Choose at least one country, state, city, person or group" };
  }

  return {
    audience,
    // $or throws on an empty array; the guard above is what prevents it.
    query: { isBanned: { $ne: true }, $or: or },
    summary: summary.join(" · "),
    targets: { countries, states, cities, userIds, groupIds },
  };
}

/**
 * GET /admin/announcement-groups
 * The derived cohorts the console's Groups picker offers, with live counts.
 */
export async function getAnnouncementGroups(req, res) {
  try {
    const groups = await Promise.all(
      GROUPS.map(async (g) => ({
        _id: g.id,
        name: g.name,
        memberCount: await User.countDocuments({ isBanned: { $ne: true }, ...g.match }),
      }))
    );
    res.json({ groups });
  } catch (error) {
    console.error("getAnnouncementGroups:", error);
    res.status(500).json({ message: "Failed to load groups" });
  }
}

/**
 * POST /admin/announcements/preview
 * Who this audience would reach, with no side effects.
 *
 * Worth its own endpoint: location coverage is patchy and stored values are
 * inconsistent, so "everyone in a state" can be far fewer accounts than it
 * sounds. Better the admin sees that before sending than after.
 */
export async function previewAudience(req, res) {
  try {
    const built = buildAudience(req.body ?? {});
    if (built.error) return res.status(400).json({ message: built.error });
    const [recipientCount, pushedCount] = await Promise.all([
      User.countDocuments(built.query),
      User.countDocuments({ ...built.query, fcmToken: NON_EMPTY }),
    ]);
    res.json({ recipientCount, pushedCount, summary: built.summary });
  } catch (error) {
    console.error("previewAudience:", error);
    res.status(500).json({ message: "Failed to preview audience" });
  }
}

/**
 * GET /admin/announcements
 * Recent sends, newest first.
 */
export async function getAnnouncements(req, res) {
  try {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ announcements });
  } catch (error) {
    console.error("getAnnouncements:", error);
    res.status(500).json({ message: "Failed to load announcements" });
  }
}

/**
 * POST /admin/announcements
 * body: { title, body, audience: "all"|"city"|"targeted", city?, targets?, deepLink? }
 *
 * Sends to every matching account. Banned accounts are always excluded.
 */
export async function sendAnnouncement(req, res) {
  try {
    const { title, body, deepLink = "" } = req.body ?? {};

    const cleanTitle = trimmed(title);
    const cleanBody = trimmed(body);
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ message: "title and body are required" });
    }
    if (cleanTitle.length > TITLE_MAX) {
      return res.status(400).json({ message: `title must be ${TITLE_MAX} characters or fewer` });
    }
    if (cleanBody.length > BODY_MAX) {
      return res.status(400).json({ message: `body must be ${BODY_MAX} characters or fewer` });
    }

    const built = buildAudience(req.body ?? {});
    if (built.error) return res.status(400).json({ message: built.error });

    const users = await User.find(built.query).select("_id fcmToken").lean();
    if (users.length === 0) {
      return res.status(400).json({ message: "No accounts match that audience" });
    }
    const pushedCount = users.filter((u) => u.fcmToken).length;

    const announcement = await Announcement.create({
      title: cleanTitle,
      body: cleanBody,
      audience: built.audience,
      city: built.city ?? null,
      targets: { ...(built.targets ?? {}), summary: built.summary },
      deepLink: trimmed(deepLink),
      sentBy: req.user?.username || "admin",
      recipientCount: users.length,
      pushedCount,
    });

    // Respond before the fan-out finishes — a 5000-user send would otherwise
    // hold the admin's request open for minutes. notifyUser never throws.
    res.status(202).json({
      message: `Sending to ${users.length} account${users.length === 1 ? "" : "s"}.`,
      announcement,
    });

    const data = { announcementId: String(announcement._id) };
    if (announcement.deepLink) data.link = announcement.deepLink;

    for (let i = 0; i < users.length; i += NOTIFY_BATCH_SIZE) {
      const batch = users.slice(i, i + NOTIFY_BATCH_SIZE);
      await Promise.allSettled(
        batch.map((u) =>
          notifyUser(u._id, { type: "general", title: cleanTitle, body: cleanBody, data })
        )
      );
    }
    console.log(
      `[Announcement] "${cleanTitle}" → ${built.summary}: ${users.length} account(s), ${pushedCount} with a push token`
    );
  } catch (error) {
    console.error("sendAnnouncement:", error);
    // The 202 may already be out — only answer if it isn't.
    if (!res.headersSent) res.status(500).json({ message: "Failed to send announcement" });
  }
}
