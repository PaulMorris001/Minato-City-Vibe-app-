import mongoose from "mongoose";
import User from "../models/user.model.js";
import Follow from "../models/follow.model.js";
import Attendance from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import { getBlockedIds } from "../utils/blockFilter.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { SUPPORT_USER_ID } from "../utils/supportAccount.js";

/**
 * "Discover people" suggestions — the data behind the standalone screen and the
 * profile-tab preview.
 *
 * Deliberately behavioural, not a directory: every rail is anchored to
 * something the two people share on Cityvibe (a connection, an event, a city, a
 * guide topic). The graph is the existing one-directional follow — there is no
 * separate friend model — so "mutual connections" means people the viewer
 * follows who also follow the candidate.
 */

const { ObjectId } = mongoose.Types;
const oid = (id) => new ObjectId(String(id));

// Per-rail cap. The screen shows a handful per section and a "see more" is a
// later concern, so there's no pagination here.
const RAIL_SIZE = 12;

/** People followed by the people the viewer follows, ranked by how many of
 *  those follows lead to them (their mutual-connection count). */
async function peopleYouMayKnow(followingIds, excluded) {
  if (followingIds.length === 0) return [];
  const rows = await Follow.aggregate([
    { $match: { follower: { $in: followingIds.map(oid) } } },
    { $group: { _id: "$following", via: { $sum: 1 } } },
    { $sort: { via: -1 } },
    { $limit: RAIL_SIZE * 4 },
  ]);
  return rows
    .filter((r) => !excluded.has(String(r._id)))
    .slice(0, RAIL_SIZE)
    .map((r) => ({ id: String(r._id) }));
}

/** Other people holding a pass for an upcoming event the viewer is also going
 *  to. Reason carries that event's title. */
async function sameEvents(userId, excluded) {
  const myPasses = await Attendance.find({ user: oid(userId) }).select("event").lean();
  const eventIds = [...new Set(myPasses.map((p) => String(p.event)))];
  if (eventIds.length === 0) return [];

  const upcoming = await Event.find({
    _id: { $in: eventIds.map(oid) },
    date: { $gte: new Date() },
  })
    .select("title")
    .lean();
  if (upcoming.length === 0) return [];

  const titleByEvent = new Map(upcoming.map((e) => [String(e._id), e.title]));
  // Newest RSVPs first, capped — a large event would otherwise pull every
  // attendee back just to fill a 12-card rail.
  const rows = await Attendance.find({ event: { $in: upcoming.map((e) => e._id) } })
    .select("user event")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const uid = String(r.user);
    if (excluded.has(uid) || seen.has(uid)) continue;
    seen.add(uid);
    out.push({ id: uid, reason: `You're both going to ${titleByEvent.get(String(r.event))}` });
    if (out.length >= RAIL_SIZE) break;
  }
  return out;
}

/** Non-guest accounts whose browsing city (or account city) matches the
 *  viewer's active city. */
async function inYourArea(activeCity, excluded) {
  if (!activeCity) return [];
  const rx = new RegExp(`^${escapeRegex(activeCity)}$`, "i");
  const users = await User.find({
    isGuest: { $ne: true },
    $or: [{ pushCity: rx }, { "location.city": rx }],
  })
    .select("_id")
    .sort({ createdAt: -1 })
    .limit(RAIL_SIZE * 4)
    .lean();
  return users
    .filter((u) => !excluded.has(String(u._id)))
    .slice(0, RAIL_SIZE)
    .map((u) => ({ id: String(u._id), reason: `In ${activeCity}` }));
}

// A user's guide-topic footprint: topics of guides they wrote, bought or saved.
// Guides are the one place Cityvibe records a structured interest signal
// (events have no category), so both "similar interests" and the card tagline
// are built from this.
const guideFootprintMatch = (ids) => ({
  isActive: true,
  isDraft: false,
  $or: [
    { author: { $in: ids.map(oid) } },
    { purchasedBy: { $in: ids.map(oid) } },
    { savedBy: { $in: ids.map(oid) } },
  ],
});

/** People whose guide-topic footprint overlaps the viewer's, ranked by how
 *  many topics they share. */
async function similarInterests(userId, excluded) {
  const mine = await Guide.find(guideFootprintMatch([userId])).select("topic").lean();
  const myTopics = [...new Set(mine.map((g) => g.topic).filter(Boolean))];
  if (myTopics.length === 0) return [];

  const rows = await Guide.aggregate([
    { $match: { topic: { $in: myTopics }, isActive: true, isDraft: false } },
    {
      $project: {
        topic: 1,
        people: {
          $setUnion: [["$author"], { $ifNull: ["$purchasedBy", []] }, { $ifNull: ["$savedBy", []] }],
        },
      },
    },
    { $unwind: "$people" },
    { $group: { _id: "$people", topics: { $addToSet: "$topic" } } },
    { $addFields: { shared: { $size: "$topics" } } },
    { $sort: { shared: -1 } },
    { $limit: RAIL_SIZE * 4 },
  ]);

  return rows
    .filter((r) => !excluded.has(String(r._id)))
    .slice(0, RAIL_SIZE)
    .map((r) => ({
      id: String(r._id),
      reason: `Also into ${r.topics.slice(0, 2).join(" & ")}`,
    }));
}

/** Fallback rail: the most-followed accounts the viewer isn't connected to.
 *  Grouped over the whole (small, indexed) follow collection. */
async function suggestedPeople(excluded) {
  const rows = await Follow.aggregate([
    { $group: { _id: "$following", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: RAIL_SIZE * 8 },
  ]);
  return rows
    .filter((r) => !excluded.has(String(r._id)))
    .slice(0, RAIL_SIZE)
    .map((r) => ({ id: String(r._id), reason: "Popular on OurCityvibe" }));
}

/** Mutual-connection count for each candidate: people the viewer follows who
 *  also follow that candidate. */
async function mutualCounts(ids, followingIds) {
  if (ids.length === 0 || followingIds.length === 0) return new Map();
  const rows = await Follow.aggregate([
    {
      $match: {
        following: { $in: ids.map(oid) },
        follower: { $in: followingIds.map(oid) },
      },
    },
    { $group: { _id: "$following", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/** Up to three guide topics per candidate, most-engaged first — the emoji
 *  tagline on the card is rendered from these client-side. */
async function interestTags(ids) {
  if (ids.length === 0) return new Map();
  const objIds = ids.map(oid);
  const rows = await Guide.aggregate([
    {
      $match: {
        isActive: true,
        isDraft: false,
        $or: [
          { author: { $in: objIds } },
          { purchasedBy: { $in: objIds } },
          { savedBy: { $in: objIds } },
        ],
      },
    },
    {
      $project: {
        topic: 1,
        people: {
          $setUnion: [["$author"], { $ifNull: ["$purchasedBy", []] }, { $ifNull: ["$savedBy", []] }],
        },
      },
    },
    { $unwind: "$people" },
    { $match: { people: { $in: objIds } } },
    { $group: { _id: { person: "$people", topic: "$topic" }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $group: { _id: "$_id.person", topics: { $push: "$_id.topic" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.topics.slice(0, 3)]));
}

export async function getPeopleSuggestions(userId, { city } = {}) {
  const me = await User.findById(userId).select("pushCity location").lean();
  const activeCity = String(city || me?.pushCity || me?.location?.city || "").trim();

  const [blocked, followingRows] = await Promise.all([
    getBlockedIds(userId),
    Follow.find({ follower: oid(userId) }).select("following").lean(),
  ]);
  const followingIds = followingRows.map((r) => String(r.following));

  // Everyone the viewer already follows, has blocked / been blocked by, plus
  // self and support — none of them belong in a "people to add" list.
  const excluded = new Set([String(userId), ...followingIds, ...blocked]);
  if (SUPPORT_USER_ID) excluded.add(SUPPORT_USER_ID);

  const [pymk, evs, area, interests, suggested] = await Promise.all([
    peopleYouMayKnow(followingIds, excluded),
    sameEvents(userId, excluded),
    inYourArea(activeCity, excluded),
    similarInterests(userId, excluded),
    suggestedPeople(excluded),
  ]);

  const orderedRails = [
    { key: "people_you_may_know", title: "People you may know", items: pymk },
    { key: "same_events", title: "Going to the same events", items: evs },
    { key: "similar_interests", title: "Shares your interests", items: interests },
    {
      key: "in_your_area",
      title: activeCity ? `People in ${activeCity}` : "People near you",
      items: area,
    },
    { key: "suggested", title: "Suggested for you", items: suggested },
  ];

  // A person shows in one rail only — the highest-priority one they qualified
  // for — so the screen doesn't repeat the same card three sections down.
  const placed = new Set();
  const railsWithItems = [];
  for (const rail of orderedRails) {
    const items = [];
    for (const it of rail.items) {
      if (placed.has(it.id)) continue;
      placed.add(it.id);
      items.push(it);
    }
    if (items.length > 0) railsWithItems.push({ ...rail, items });
  }

  const allIds = [...placed];
  if (allIds.length === 0) return { rails: [] };

  const [users, mCounts, tags] = await Promise.all([
    User.find({ _id: { $in: allIds.map(oid) } })
      .select("username slug profilePicture isVendor businessName verified")
      .lean(),
    mutualCounts(allIds, followingIds),
    interestTags(allIds),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const rails = railsWithItems
    .map((rail) => ({
      key: rail.key,
      title: rail.title,
      people: rail.items
        .map((it) => {
          const u = userById.get(it.id);
          if (!u) return null;
          const mutualCount = mCounts.get(it.id) || 0;
          return {
            _id: u._id,
            username: u.username,
            slug: u.slug,
            profilePicture: u.profilePicture || "",
            businessName: u.businessName || "",
            isVendor: !!u.isVendor,
            verified: !!u.verified,
            tagline: tags.get(it.id) || [],
            mutualCount,
            isFollowing: false,
            isMutual: false,
            reason:
              it.reason ||
              (mutualCount > 0
                ? `${mutualCount} mutual connection${mutualCount === 1 ? "" : "s"}`
                : ""),
          };
        })
        .filter(Boolean),
    }))
    .filter((rail) => rail.people.length > 0);

  return { rails };
}
