import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { City, VendorType, Vendor } from "../models/vendor.model.js";
import Event from "../models/event.model.js";
import Guide from "../models/guide.model.js";
import AnalyticsLog from "../models/analytics.model.js";
import VerificationRequest from "../models/verification.model.js";
import Notification from "../models/notification.model.js";
import Report from "../models/report.model.js";
import Message from "../models/message.model.js";
import chatService from "../services/chat.service.js";
import { sendPushNotification, notifyUser } from "../services/notification.service.js";
import {
  refundAllEventTickets,
  outstandingTicketFilter,
} from "./stripe.controller.js";
import Ticket from "../models/ticket.model.js";
import {
  sendEventCancelledEmail,
  sendEventCancellationApprovedEmail,
} from "../services/email.service.js";
import { formatAmountText } from "../services/payments/fulfillment.js";
import { invalidateCachePattern } from "../utils/cache.js";
import { markVerified } from "../services/verification.service.js";
import { getSocketInstance } from "../services/socket.service.js";
import {
  hasPayoutOnboarding,
  PAYOUT_ROUTING_FIELDS,
} from "../services/payments/resolveProvider.js";
import RaffleCampaign from "../models/raffleCampaign.model.js";
import { getCurrentCampaign, campaignPrizes } from "../services/raffleCampaign.service.js";

/**
 * Constant-time string comparison. Guards the username check against timing
 * analysis; the length check leaks only the length, which isn't a secret.
 */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function adminLogin(req, res) {
  const { username, password } = req.body;

  const adminUsername = process.env.ADMIN_USERNAME;
  // Preferred: a bcrypt hash. ADMIN_PASSWORD (plaintext) is still honoured so an
  // existing deploy keeps working, but env.js warns at boot until it's migrated.
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  const adminPlaintext = process.env.ADMIN_PASSWORD;

  if (!adminUsername || (!adminHash && !adminPlaintext)) {
    return res.status(500).json({ message: "Admin credentials not configured" });
  }

  // Both checks run unconditionally — no early return on a bad username, so the
  // response time doesn't reveal whether the username existed.
  const userOk = safeEqual(username, adminUsername);
  const passOk = adminHash
    ? await bcrypt.compare(String(password ?? ""), adminHash)
    : safeEqual(password, adminPlaintext);

  if (!userOk || !passOk) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = jwt.sign({ isAdmin: true, username }, config.jwt.adminSecret, {
    expiresIn: config.jwt.adminExpiresIn,
  });

  res.json({ token });
}

export async function getStats(req, res) {
  try {
    const [totalUsers, totalVendors, totalEvents, totalGuides] = await Promise.all([
      User.countDocuments(),
      Vendor.countDocuments(),
      Event.countDocuments(),
      Guide.countDocuments(),
    ]);

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("username email isVendor createdAt profilePicture");

    res.json({ totalUsers, totalVendors, totalEvents, totalGuides, recentUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function getUsers(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search
      ? {
          $or: [
            { username: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-password -resetPasswordOTP -resetPasswordToken"),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    await Promise.all([
      User.findByIdAndDelete(id),
      Vendor.deleteOne({ user: id }),
      chatService.purgeUserChats(id),
    ]);
    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Vendors ────────────────────────────────────────────────────────────────

export async function getVendors(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [vendors, total] = await Promise.all([
      Vendor.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("city", "name state")
        .populate("vendorType", "name icon")
        .populate("user", "username email"),
      Vendor.countDocuments(query),
    ]);

    res.json({ vendors, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function toggleVendorVerified(req, res) {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    vendor.verified = !vendor.verified;
    await vendor.save();

    // Sync verified status to linked user if exists
    if (vendor.user) {
      User.findByIdAndUpdate(vendor.user, { verified: vendor.verified }).catch(() => {});
    }

    res.json({ verified: vendor.verified });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteVendor(req, res) {
  try {
    const { id } = req.params;
    const vendor = await Vendor.findByIdAndDelete(id);
    if (vendor?.user) {
      User.findByIdAndUpdate(vendor.user, { isVendor: false }).catch(() => {});
    }
    res.json({ message: "Vendor deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Cities ─────────────────────────────────────────────────────────────────

export async function getCitiesAdmin(req, res) {
  try {
    const cities = await City.find().sort({ name: 1 });
    res.json(cities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createCity(req, res) {
  try {
    const { name, state, country } = req.body;
    if (!name || !state) {
      return res.status(400).json({ message: "Name and state are required" });
    }
    const city = await new City({
      name: name.trim(),
      state: state.trim(),
      country: (country || "United States").trim(),
    }).save();
    res.status(201).json(city);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteCity(req, res) {
  try {
    const { id } = req.params;
    await City.findByIdAndDelete(id);
    res.json({ message: "City deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Vendor Types ───────────────────────────────────────────────────────────

export async function getVendorTypesAdmin(req, res) {
  try {
    const vendorTypes = await VendorType.find().sort({ name: 1 });
    res.json(vendorTypes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createVendorType(req, res) {
  try {
    const { name, icon } = req.body;
    if (!name || !icon) {
      return res.status(400).json({ message: "Name and icon are required" });
    }
    const vendorType = await new VendorType({ name: name.trim(), icon: icon.trim() }).save();
    res.status(201).json(vendorType);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteVendorType(req, res) {
  try {
    const { id } = req.params;
    await VendorType.findByIdAndDelete(id);
    res.json({ message: "Vendor type deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Events ─────────────────────────────────────────────────────────────────

export async function getEvents(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search ? { title: { $regex: search, $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "username email"),
      Event.countDocuments(query),
    ]);

    res.json({ events, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function toggleEventActive(req, res) {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    event.isActive = !event.isActive;
    await event.save();
    res.json({ isActive: event.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteEvent(req, res) {
  try {
    const { id } = req.params;
    await Event.findByIdAndDelete(id);
    res.json({ message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Birthday Raffle ────────────────────────────────────────────────────────
// Scores are computed the same way birthdayRaffle.controller.js computes
// them for a user's own status — kept in sync by hand since this is a small
// feature, not by sharing a module (the two call sites want different shapes:
// one entry vs a whole leaderboard).
//
// A campaign is a [startDate, endDate] window managed here. An event belongs to
// the campaign whose window contains its createdAt — there is no ref — so the
// windows are kept non-overlapping on create/update.

/** Resolve the campaign a raffle request targets: an explicit ?campaignId, else
 *  the current one. Returns null when an explicit id doesn't exist. */
async function resolveRaffleCampaign(req) {
  if (req.query.campaignId) {
    return RaffleCampaign.findById(req.query.campaignId);
  }
  return getCurrentCampaign();
}

/** Normalise a prizes payload (array of `{ reward }` or plain strings) into
 *  `[{ rank, reward }]` with ranks 1..N in array order. Returns { prizes } or
 *  { error }. `undefined` input means "leave unchanged" -> { prizes: undefined }. */
function normalizePrizes(input) {
  if (input === undefined) return { prizes: undefined };
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "prizes must be a non-empty array" };
  }
  if (input.length > 20) return { error: "a campaign can have at most 20 winners" };
  const prizes = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    const reward = (typeof raw === "string" ? raw : raw?.reward ?? "").trim();
    if (!reward) return { error: `prize ${i + 1} needs a reward description` };
    prizes.push({ rank: i + 1, reward });
  }
  return { prizes };
}

/** Reject a window that's inverted or overlaps another campaign. Returns an
 *  error message, or null when the window is fine. */
async function windowConflict(startDate, endDate, excludeId) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end)) return "startDate and endDate must be valid dates";
  if (end <= start) return "endDate must be after startDate";
  const others = await RaffleCampaign.find(
    excludeId ? { _id: { $ne: excludeId } } : {}
  );
  const clash = others.find((c) => start <= c.endDate && c.startDate <= end);
  return clash ? `Window overlaps campaign "${clash.name}"` : null;
}

export async function getRaffleEntries(req, res) {
  try {
    const campaign = await resolveRaffleCampaign(req);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const events = await Event.find({
      isBirthdayRaffle: true,
      createdAt: { $gte: campaign.startDate, $lte: campaign.endDate },
    })
      .populate("createdBy", "username email profilePicture")
      .sort({ createdAt: -1 });

    const entries = events
      .map((e) => ({
        eventId: e._id,
        title: e.title,
        date: e.date,
        createdAt: e.createdAt,
        host: e.createdBy,
        // See scoreEntry() in birthdayRaffle.controller.js for why this reads
        // rsvpUsers (the live going/not_going toggle) rather than
        // invitedUsers (a one-way list nothing ever removes from).
        verifiedRsvps: e.rsvpUsers.length,
        totalInvites: e.invitedUsers.length + e.pendingInvites.length,
        eligibilityScore: 1 + e.rsvpUsers.length,
        winnerRank: e.raffleWinnerRank || null,
      }))
      .sort((a, b) => b.eligibilityScore - a.eligibilityScore);

    res.json({ entries, campaign });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getRaffleCampaigns(req, res) {
  try {
    const campaigns = await RaffleCampaign.find().sort({ startDate: -1 });
    res.json({ campaigns });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createRaffleCampaign(req, res) {
  try {
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ message: "name, startDate and endDate are required" });
    }
    // One live campaign at a time — the previous one must be ended first so its
    // entries stop qualifying before the next window opens.
    const active = await RaffleCampaign.findOne({ status: "active" });
    if (active) {
      return res.status(400).json({ message: `End the current campaign ("${active.name}") first` });
    }
    const conflict = await windowConflict(startDate, endDate);
    if (conflict) return res.status(400).json({ message: conflict });

    // Default to the legacy 3 tiers when the client doesn't send any.
    const { prizes, error: prizeError } = normalizePrizes(req.body.prizes ?? campaignPrizes(null));
    if (prizeError) return res.status(400).json({ message: prizeError });

    const campaign = await new RaffleCampaign({
      name: name.trim(),
      startDate,
      endDate,
      prizes,
      status: "active",
      createdByAdmin: req.user?.username || "admin",
    }).save();
    res.status(201).json({ campaign });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function updateRaffleCampaign(req, res) {
  try {
    const { id } = req.params;
    const campaign = await RaffleCampaign.findById(id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    const name = req.body.name ?? campaign.name;
    const startDate = req.body.startDate ?? campaign.startDate;
    const endDate = req.body.endDate ?? campaign.endDate;

    const conflict = await windowConflict(startDate, endDate, campaign._id);
    if (conflict) return res.status(400).json({ message: conflict });

    const { prizes, error: prizeError } = normalizePrizes(req.body.prizes);
    if (prizeError) return res.status(400).json({ message: prizeError });

    campaign.name = String(name).trim();
    campaign.startDate = startDate;
    campaign.endDate = endDate;
    if (prizes !== undefined) campaign.prizes = prizes;
    await campaign.save();
    res.json({ campaign });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Closes entry until the next campaign is created. Winners already picked stay
// put — ending is not the same as clearing the leaderboard.
export async function endRaffleCampaign(req, res) {
  try {
    const campaign = await RaffleCampaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    campaign.status = "ended";
    await campaign.save();
    res.json({ campaign });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * POST /admin/raffle/campaigns/:id/draw
 *
 * Run the weighted random draw for a campaign and record the winners.
 *
 * The official rules published in the app (mobile/app/birthday-raffle/rules.tsx)
 * promise entrants a random draw in which each qualifying event holds one entry
 * plus one per verified RSVP. That promise is only true if the draw actually
 * happens here — an admin eyeballing the entry table and picking the biggest
 * numbers is a different promotion from the one entrants agreed to. This is the
 * implementation of that rule, which is why the weighting below mirrors
 * `scoreEntry` in birthdayRaffle.controller.js exactly.
 *
 * Refuses to run while the campaign is still open: drawing early would exclude
 * entries that rule 5 says are still eligible.
 */
export async function drawRaffleWinners(req, res) {
  try {
    const { id } = req.params;
    const campaign = await RaffleCampaign.findById(id);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    if (Date.now() <= new Date(campaign.endDate).getTime()) {
      return res.status(400).json({
        message: "This campaign is still open — the draw can only run once it has closed.",
      });
    }

    const entries = await Event.find({
      isBirthdayRaffle: true,
      createdAt: { $gte: campaign.startDate, $lte: campaign.endDate },
    }).populate("createdBy", "_id username");
    if (entries.length === 0) {
      return res.status(400).json({ message: "No entries in this campaign" });
    }

    // One ticket per entry, plus one per verified RSVP — the same count the
    // entrant was shown as "entries in the draw".
    const tickets = [];
    for (const entry of entries) {
      const count = 1 + entry.rsvpUsers.length;
      for (let i = 0; i < count; i += 1) tickets.push(entry);
    }

    const prizeCount = campaignPrizes(campaign).length;
    const winners = [];
    const wonBy = new Set(); // one prize per entrant, per rule 8
    let pool = tickets;

    for (let rank = 1; rank <= prizeCount && pool.length > 0; rank += 1) {
      // crypto.randomInt is uniform over the range; Math.random is not, and a
      // draw that decides real money should not be the place we accept bias.
      const picked = pool[crypto.randomInt(pool.length)];
      winners.push({ rank, event: picked });
      wonBy.add(String(picked.createdBy?._id ?? picked.createdBy));
      // Remove every ticket held by that entrant so nobody wins twice.
      pool = pool.filter(
        (t) => !wonBy.has(String(t.createdBy?._id ?? t.createdBy))
      );
    }

    // Clear this campaign's previous result before writing the new one, so a
    // re-draw can't leave a stale rank behind.
    const window = { createdAt: { $gte: campaign.startDate, $lte: campaign.endDate } };
    await Event.updateMany(
      { isBirthdayRaffle: true, raffleWinnerRank: { $ne: null }, ...window },
      { $set: { raffleWinnerRank: null } }
    );
    for (const { rank, event } of winners) {
      await Event.updateOne({ _id: event._id }, { $set: { raffleWinnerRank: rank } });
    }

    // Tell the winners. Best-effort: a notification failure must not undo a draw.
    for (const { rank, event } of winners) {
      notifyUser(event.createdBy?._id, {
        type: "raffle_winner",
        title: `You won the Birthday Raffle! 🎉`,
        body: `"${event.title}" was drawn at position ${rank}. Check your raffle status for what happens next.`,
        data: { eventId: String(event._id) },
      });
    }

    console.log(
      `[Raffle] Drew ${winners.length} winner(s) for "${campaign.name}" from ${tickets.length} entries across ${entries.length} events`
    );

    res.json({
      campaign: campaign.name,
      totalEntries: entries.length,
      totalTickets: tickets.length,
      winners: winners.map(({ rank, event }) => ({
        rank,
        eventId: event._id,
        eventTitle: event.title,
        username: event.createdBy?.username ?? null,
        tickets: 1 + event.rsvpUsers.length,
      })),
    });
  } catch (error) {
    console.error("drawRaffleWinners:", error);
    res.status(500).json({ message: error.message });
  }
}

// Manual override for a single place — used to correct a draw (a winner turns
// out to be ineligible, or forfeits under rule 10), not to pick winners in the
// first place. The draw itself is drawRaffleWinners above; the published rules
// promise entrants a random draw, so hand-picking a fresh result would not
// match what they agreed to. Set rank to null to undo a pick.
export async function setRaffleWinner(req, res) {
  try {
    const { id } = req.params;
    const { rank } = req.body;

    const event = await Event.findById(id);
    if (!event || !event.isBirthdayRaffle) {
      return res.status(404).json({ message: "Raffle entry not found" });
    }

    // The campaign that owns this entry (by date window), used both to bound
    // the valid ranks and to scope the "one holder per place" reset.
    const owning = await RaffleCampaign.findOne({
      startDate: { $lte: event.createdAt },
      endDate: { $gte: event.createdAt },
    });
    const maxRank = campaignPrizes(owning).length;

    if (rank !== null && !(Number.isInteger(rank) && rank >= 1 && rank <= maxRank)) {
      return res.status(400).json({ message: `rank must be 1-${maxRank}, or null` });
    }

    // A place is held by at most one entry, but only within the same campaign —
    // a past campaign's 1st place isn't cleared when the new one picks theirs.
    if (rank !== null) {
      const sameWindow = owning
        ? { createdAt: { $gte: owning.startDate, $lte: owning.endDate } }
        : {};
      await Event.updateMany(
        { _id: { $ne: event._id }, isBirthdayRaffle: true, raffleWinnerRank: rank, ...sameWindow },
        { $set: { raffleWinnerRank: null } }
      );
    }
    event.raffleWinnerRank = rank;
    await event.save();
    res.json({ eventId: event._id, winnerRank: event.raffleWinnerRank });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Guides ─────────────────────────────────────────────────────────────────

export async function getGuides(req, res) {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = search ? { title: { $regex: search, $options: "i" } } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [guides, total] = await Promise.all([
      Guide.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("author", "username email"),
      Guide.countDocuments(query),
    ]);

    res.json({ guides, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function toggleGuideActive(req, res) {
  try {
    const { id } = req.params;
    const guide = await Guide.findById(id);
    if (!guide) return res.status(404).json({ message: "Guide not found" });
    guide.isActive = !guide.isActive;
    await guide.save();
    res.json({ isActive: guide.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function deleteGuide(req, res) {
  try {
    const { id } = req.params;
    await Guide.findByIdAndDelete(id);
    res.json({ message: "Guide deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Analytics ──────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(req, res) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [totalEvents, eventBreakdown, dailyTotals, topUsers] = await Promise.all([
      AnalyticsLog.countDocuments(),

      // Count by event type
      AnalyticsLog.aggregate([
        { $group: { _id: "$event", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Daily totals for last 7 days
      AnalyticsLog.aggregate([
        { $match: { timestamp: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: {
              year: { $year: "$timestamp" },
              month: { $month: "$timestamp" },
              day: { $dayOfMonth: "$timestamp" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),

      // Top active users
      AnalyticsLog.aggregate([
        { $match: { userId: { $ne: null } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            count: 1,
            username: "$user.username",
            email: "$user.email",
          },
        },
      ]),
    ]);

    // Fill missing days with 0
    const dailyMap = {};
    dailyTotals.forEach(({ _id, count }) => {
      const key = `${_id.year}-${String(_id.month).padStart(2, "0")}-${String(_id.day).padStart(2, "0")}`;
      dailyMap[key] = count;
    });
    const dailySeries = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dailySeries.push({ date: key, count: dailyMap[key] ?? 0 });
    }

    res.json({ totalEvents, eventBreakdown, dailySeries, topUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Verifications ──────────────────────────────────────────────────────────

export async function getVerifications(req, res) {
  try {
    const { status = "", page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      VerificationRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("user", "username email profilePicture isVendor"),
      VerificationRequest.countDocuments(query),
    ]);

    res.json({ requests, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function approveVerification(req, res) {
  try {
    const { id } = req.params;
    const { reviewedBy = "admin" } = req.body ?? {};

    const request = await VerificationRequest.findById(id).populate("user", "_id");
    if (!request) return res.status(404).json({ message: "Verification request not found" });

    // Shared with the automated Connect/Paystack paths so the user flag, the
    // Vendor mirror, the request record and the notification can't diverge
    // between how someone got verified.
    await markVerified(request.user._id, { source: "manual", reviewedBy });

    res.json({ status: "approved" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function rejectVerification(req, res) {
  try {
    const { id } = req.params;
    const { reviewNotes = "", reviewedBy = "admin" } = req.body;

    const request = await VerificationRequest.findById(id).populate("user", "_id fcmToken");
    if (!request) return res.status(404).json({ message: "Verification request not found" });

    request.status = "rejected";
    request.reviewNotes = reviewNotes;
    request.reviewedAt = new Date();
    request.reviewedBy = reviewedBy;
    await request.save();

    const notifBody = reviewNotes
      ? `Your verification request was not approved. Reason: ${reviewNotes}. You may resubmit.`
      : "Your verification request was not approved. You may resubmit with updated documents.";

    // In-app notification
    await Notification.create({
      user: request.user._id,
      type: "verification_rejected",
      title: "Verification Not Approved",
      body: notifBody,
      data: {},
    });

    // Push notification
    if (request.user.fcmToken) {
      sendPushNotification(
        request.user.fcmToken,
        "Verification Not Approved",
        notifBody,
        { type: "verification_rejected" }
      ).catch(() => {});
    }

    res.json({ status: "rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Paid Event Approval Queue ──────────────────────────────────────────────

export async function getPendingPaidEvents(req, res) {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {
      isPaid: true,
      isPublic: true,
      ...(status ? { approvalStatus: status } : {}),
    };

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate(
          "createdBy",
          `username email profilePicture verified paidEventsApproved paidEventsCount contactInfo emailVerifiedAt ${PAYOUT_ROUTING_FIELDS}`
        ),
      Event.countDocuments(query),
    ]);

    // Attach fraud-report counts so admins can see which events have buyer
    // complaints. We only count open fraud reports.
    const eventIds = events.map((e) => e._id);
    const fraudCounts = await Report.aggregate([
      {
        $match: {
          targetType: "event",
          targetId: { $in: eventIds },
          reason: "fraud",
          status: "open",
        },
      },
      { $group: { _id: "$targetId", count: { $sum: 1 } } },
    ]);
    const fraudCountMap = Object.fromEntries(
      fraudCounts.map((f) => [String(f._id), f.count])
    );
    const enriched = events.map((e) => {
      const obj = e.toObject();
      obj.fraudReportCount = fraudCountMap[String(e._id)] || 0;
      // Collapse the provider-specific fields into one flag for the admin UI
      // and keep the raw payout identifiers out of the payload.
      if (obj.createdBy) {
        obj.createdBy.payoutOnboarded = hasPayoutOnboarding(e.createdBy);
        delete obj.createdBy.location;
        delete obj.createdBy.paystackRecipientCode;
        delete obj.createdBy.paystackOnboardingComplete;
        delete obj.createdBy.stripeAccountId;
        delete obj.createdBy.stripeAccountCountry;
        delete obj.createdBy.stripeAccountCurrency;
        delete obj.createdBy.stripeOnboardingComplete;
        delete obj.createdBy.stripePayoutsEnabled;
      }
      return obj;
    });

    res.json({ events: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function approvePaidEvent(req, res) {
  try {
    const { id } = req.params;

    const event = await Event.findById(id).populate("createdBy", "_id fcmToken username");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (!event.isPaid) {
      return res.status(400).json({ message: "Only paid events use the approval queue" });
    }

    event.approvalStatus = "approved";
    event.approvalReviewedAt = new Date();
    event.approvalRejectReason = undefined;
    await event.save();

    // Track the organizer's history. Neither field skips the queue any more —
    // every paid event is reviewed, every time — but they tell the next
    // reviewer whether this is a first-timer or someone with a track record.
    await User.findByIdAndUpdate(event.createdBy._id, {
      paidEventsApproved: true,
      $inc: { paidEventsCount: 1 },
    });

    await Notification.create({
      user: event.createdBy._id,
      type: "paid_event_approved",
      title: "Your event is approved 🎉",
      body: `"${event.title}" is now live and accepting ticket purchases.`,
      data: { eventId: String(event._id) },
    });

    if (event.createdBy.fcmToken) {
      sendPushNotification(
        event.createdBy.fcmToken,
        "Your event is approved 🎉",
        `"${event.title}" is now live and accepting ticket purchases.`,
        { type: "paid_event_approved", eventId: String(event._id) }
      ).catch(() => {});
    }

    res.json({ status: "approved" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function rejectPaidEvent(req, res) {
  try {
    const { id } = req.params;
    const { reason = "" } = req.body ?? {};

    const event = await Event.findById(id).populate("createdBy", "_id fcmToken username");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (!event.isPaid) {
      return res.status(400).json({ message: "Only paid events use the approval queue" });
    }

    event.approvalStatus = "rejected";
    event.approvalReviewedAt = new Date();
    event.approvalRejectReason = reason;
    // Don't auto-delete — keep the record so the organizer (and admin) can see why
    event.isActive = false;
    await event.save();

    const body = reason
      ? `"${event.title}" wasn't approved. Reason: ${reason}`
      : `"${event.title}" wasn't approved. Please contact support for details.`;

    await Notification.create({
      user: event.createdBy._id,
      type: "paid_event_rejected",
      title: "Event not approved",
      body,
      data: { eventId: String(event._id) },
    });

    if (event.createdBy.fcmToken) {
      sendPushNotification(event.createdBy.fcmToken, "Event not approved", body, {
        type: "paid_event_rejected",
        eventId: String(event._id),
      }).catch(() => {});
    }

    res.json({ status: "rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ─── Creator event-edit approval queue ────────────────────────────────────────
// Edits to material fields (date, pricing, tiers, capacity) on an already-public
// event are held in event.pendingEdits until an admin approves them. Minor edits
// (title, description, photos, location) go live immediately and never appear here.

export async function getPendingEventEdits(req, res) {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query = { "pendingEdits.status": status };

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ "pendingEdits.submittedAt": -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "username email profilePicture verified"),
      Event.countDocuments(query),
    ]);

    // Surface only the fields that matter for review: the current (live) values
    // and the proposed changes, so the console can render a clean diff.
    const enriched = events.map((e) => {
      const obj = e.toObject();
      const proposed = obj.pendingEdits?.fields || {};
      const current = {};
      for (const key of Object.keys(proposed)) current[key] = obj[key];
      return {
        _id: obj._id,
        title: obj.title,
        date: obj.date,
        currency: obj.currency,
        createdBy: obj.createdBy,
        pendingEdits: obj.pendingEdits,
        diff: { current, proposed },
      };
    });

    res.json({ events: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function approveEventEdit(req, res) {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).populate("createdBy", "_id fcmToken username");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.pendingEdits?.status !== "pending") {
      return res.status(400).json({ message: "No pending edits to approve for this event" });
    }

    // Apply the proposed material fields to the live doc, then clear the holder.
    const fields = event.pendingEdits.fields || {};
    for (const [key, value] of Object.entries(fields)) event[key] = value;
    event.pendingEdits = {
      fields: null,
      status: "none",
      submittedAt: event.pendingEdits.submittedAt,
      reviewedAt: new Date(),
      reviewedBy: req.user?.username || "admin",
      rejectReason: undefined,
    };
    await event.save();

    await Notification.create({
      user: event.createdBy._id,
      type: "event_edit_approved",
      title: "Your event changes are live ✓",
      body: `The updates to "${event.title}" have been approved and are now public.`,
      data: { eventId: String(event._id) },
    });
    if (event.createdBy.fcmToken) {
      sendPushNotification(
        event.createdBy.fcmToken,
        "Your event changes are live ✓",
        `The updates to "${event.title}" have been approved and are now public.`,
        { type: "event_edit_approved", eventId: String(event._id) }
      ).catch(() => {});
    }

    res.json({ status: "approved" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function rejectEventEdit(req, res) {
  try {
    const { id } = req.params;
    const { reason = "" } = req.body ?? {};
    const event = await Event.findById(id).populate("createdBy", "_id fcmToken username");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.pendingEdits?.status !== "pending") {
      return res.status(400).json({ message: "No pending edits to reject for this event" });
    }

    // Discard the proposed changes — the live event keeps its current values.
    event.pendingEdits = {
      fields: null,
      status: "rejected",
      submittedAt: event.pendingEdits.submittedAt,
      reviewedAt: new Date(),
      reviewedBy: req.user?.username || "admin",
      rejectReason: reason,
    };
    await event.save();

    const body = reason
      ? `Your changes to "${event.title}" weren't approved. Reason: ${reason}`
      : `Your changes to "${event.title}" weren't approved. The event still shows its previous details.`;
    await Notification.create({
      user: event.createdBy._id,
      type: "event_edit_rejected",
      title: "Event changes not approved",
      body,
      data: { eventId: String(event._id) },
    });
    if (event.createdBy.fcmToken) {
      sendPushNotification(event.createdBy.fcmToken, "Event changes not approved", body, {
        type: "event_edit_rejected",
        eventId: String(event._id),
      }).catch(() => {});
    }

    res.json({ status: "rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getAnalyticsEvents(req, res) {
  try {
    const { event = "", page = 1, limit = 20 } = req.query;
    const query = event ? { event } : {};
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AnalyticsLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "username email"),
      AnalyticsLog.countDocuments(query),
    ]);

    res.json({ logs, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// ── Reports (Apple Guideline 1.2 moderation queue) ──────────────────────────

export async function getReports(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== "all") query.status = status;
    const skip = (Number(page) - 1) * Number(limit);

    const [reports, total, openCount] = await Promise.all([
      Report.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("reporter", "username email profilePicture")
        .populate("targetUser", "username email profilePicture isBanned")
        .lean(),
      Report.countDocuments(query),
      Report.countDocuments({ status: "open" }),
    ]);

    res.json({
      reports,
      total,
      openCount,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("getReports error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function resolveReport(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!["dismiss", "remove_content", "ban_user"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    let outcome = "dismissed";

    if (action === "remove_content") {
      if (report.targetType === "event") {
        await Event.findByIdAndUpdate(report.targetId, { isActive: false });
      } else if (report.targetType === "guide") {
        await Guide.findByIdAndUpdate(report.targetId, { isActive: false });
      } else if (report.targetType === "message") {
        // Same soft-delete the sender's own delete uses, so open chats get the
        // standard message:deleted socket event and hide it immediately.
        const msg = await Message.findByIdAndUpdate(
          report.targetId,
          { isDeleted: true },
          { new: true }
        );
        if (msg) {
          const io = getSocketInstance();
          if (io) {
            io.to(`chat:${msg.chat.toString()}`).emit("message:deleted", {
              chatId: msg.chat.toString(),
              messageId: msg._id.toString(),
            });
          }
        }
      } else if (report.targetType === "user") {
        // For user-target reports, remove_content = soft-disable all their content
        await Event.updateMany({ createdBy: report.targetId }, { isActive: false });
        await Guide.updateMany({ author: report.targetId }, { isActive: false });
      }
      outcome = "removed_content";
    } else if (action === "ban_user") {
      await User.findByIdAndUpdate(report.targetUser, {
        isBanned: true,
        bannedAt: new Date(),
        $inc: { tokenVersion: 1 },
      });
      await Event.updateMany({ createdBy: report.targetUser }, { isActive: false });
      await Guide.updateMany({ author: report.targetUser }, { isActive: false });
      // Resolve all other open reports against this user
      await Report.updateMany(
        { targetUser: report.targetUser, status: "open", _id: { $ne: report._id } },
        {
          status: "resolved",
          action: "banned_user",
          resolvedBy: req.user?.username || "admin",
          resolvedAt: new Date(),
        }
      );
      outcome = "banned_user";
    }

    report.status = action === "dismiss" ? "dismissed" : "resolved";
    report.action = outcome;
    report.resolvedAt = new Date();
    await report.save();

    res.json({ message: "Report resolved", report });
  } catch (error) {
    console.error("resolveReport error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getReportTarget(req, res) {
  try {
    const { id } = req.params;
    const report = await Report.findById(id).lean();
    if (!report) return res.status(404).json({ message: "Report not found" });

    let target = null;
    if (report.targetType === "event") {
      target = await Event.findById(report.targetId)
        .populate("createdBy", "username email profilePicture")
        .lean();
    } else if (report.targetType === "guide") {
      target = await Guide.findById(report.targetId)
        .populate("author", "username email profilePicture")
        .lean();
    } else if (report.targetType === "user") {
      target = await User.findById(report.targetId)
        .select("-password -resetPasswordOTP -resetPasswordToken")
        .lean();
    } else if (report.targetType === "message") {
      target = await Message.findById(report.targetId)
        .populate("sender", "username email profilePicture")
        .lean();
    }

    res.json({ report, target });
  } catch (error) {
    console.error("getReportTarget error:", error);
    res.status(500).json({ message: error.message });
  }
}

// ─── Event cancellation review ───────────────────────────────────────────────
//
// An organizer with tickets outstanding can't cancel outright — the request
// lands here (see cancelEventByOrganizer) and an admin decides. Approving is
// what actually moves the money back to buyers.

/**
 * GET /admin/event-cancellations?status=pending&page=&limit=
 * The review queue. Mirrors getPendingEventEdits.
 */
export async function getEventCancellations(req, res) {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query = { "cancellationRequest.status": status };

    const [events, total] = await Promise.all([
      Event.find(query)
        .sort({ "cancellationRequest.requestedAt": -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("createdBy", "username email profilePicture verified"),
      Event.countDocuments(query),
    ]);

    // The reviewer is deciding about money, so give them the live numbers
    // rather than the count captured when the request was filed — tickets can
    // have been refunded individually since.
    const enriched = await Promise.all(
      events.map(async (e) => {
        const obj = e.toObject();
        const tickets = await Ticket.find(outstandingTicketFilter(e._id))
          .select("ticketPrice")
          .lean();
        const gross = tickets.reduce((sum, t) => sum + (t.ticketPrice || 0), 0);
        return {
          _id: obj._id,
          title: obj.title,
          date: obj.date,
          endDate: obj.endDate,
          location: obj.location,
          currency: obj.currency,
          createdBy: obj.createdBy,
          cancellationRequest: obj.cancellationRequest,
          outstandingTickets: tickets.length,
          refundTotalText: formatAmountText(gross, obj.currency),
        };
      })
    );

    res.json({ events: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * PATCH /admin/event-cancellations/:id/approve
 *
 * Runs the refunds, then cancels the event. Partial failure is expected (a
 * transferred ticket, a dead provider charge) and is reported rather than
 * rolled back — a buyer whose refund failed must NOT be emailed a confirmation.
 */
export async function approveEventCancellation(req, res) {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).populate(
      "createdBy",
      "_id fcmToken username email"
    );
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.cancellationRequest?.status !== "pending") {
      return res.status(400).json({ message: "No pending cancellation request for this event" });
    }

    const { refunded, failed, refundedTickets, failures } = await refundAllEventTickets(event);

    event.cancelledAt = new Date();
    event.cancelledBy = event.cancellationRequest.requestedBy;
    event.cancellationReason = event.cancellationRequest.reason;
    event.isActive = false;
    event.payoutStatus = "released"; // nothing left to release
    event.cancellationRequest.status = "approved";
    event.cancellationRequest.reviewedAt = new Date();
    event.cancellationRequest.reviewedBy = req.user?.username || "admin";
    await event.save();

    invalidateCachePattern(`event_detail_${event._id}_`);
    invalidateCachePattern("public_events_");
    invalidateCachePattern("event_highlights_");

    const eventDateText = new Date(event.date).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    // Tell the people whose money actually moved. Mail is best-effort and
    // bounded — a slow SMTP server must not hold the admin's request open, and
    // a failure here can't undo a completed refund.
    notifyRefundedHolders(refundedTickets, event, eventDateText).catch((err) =>
      console.error("approveEventCancellation: holder notifications failed:", err)
    );

    if (event.createdBy?.email) {
      sendEventCancellationApprovedEmail(event.createdBy.email, {
        organizerName: event.createdBy.username,
        eventTitle: event.title,
        refundedCount: refunded,
        failedCount: failed,
      }).catch(() => {});
    }
    notifyUser(event.createdBy?._id, {
      type: "event_cancellation_approved",
      title: "Your event was cancelled",
      body: `"${event.title}" is cancelled and ${refunded} ticket${refunded === 1 ? "" : "s"} refunded.`,
      data: { eventId: String(event._id) },
    });

    res.json({ status: "approved", refunded, failed, failures });
  } catch (error) {
    console.error("approveEventCancellation:", error);
    res.status(500).json({ message: error.message });
  }
}

/** Batch size for holder mail — same bound the engagement push job uses. */
const HOLDER_NOTIFY_BATCH = 25;

/**
 * In-app notification + refund email for every holder whose refund succeeded.
 * `recipientEmail` is the address the QR pass went to, which is the right one
 * for gifts and guest checkout; the account email is the fallback.
 */
async function notifyRefundedHolders(tickets, event, eventDateText) {
  const holders = await User.find({ _id: { $in: tickets.map((t) => t.user) } })
    .select("_id username email")
    .lean();
  const byId = new Map(holders.map((u) => [String(u._id), u]));

  const jobs = tickets.map((ticket) => async () => {
    const holder = byId.get(String(ticket.user));
    const email = ticket.recipientEmail || holder?.email;

    await notifyUser(ticket.user, {
      type: "event_cancelled",
      title: "Event cancelled — you've been refunded",
      body: `"${event.title}" was cancelled. Your ticket has been refunded in full.`,
      data: { eventId: String(event._id) },
    });

    if (!email) return;
    await sendEventCancelledEmail(email, {
      attendeeName: holder?.username,
      eventTitle: event.title,
      eventDateText,
      eventLocation: event.location,
      refundAmountText: formatAmountText(ticket.ticketPrice, event.currency),
      reason: event.cancellationReason,
    });
  });

  for (let i = 0; i < jobs.length; i += HOLDER_NOTIFY_BATCH) {
    await Promise.allSettled(jobs.slice(i, i + HOLDER_NOTIFY_BATCH).map((run) => run()));
  }
}

/**
 * PATCH /admin/event-cancellations/:id/reject
 *
 * Leaves the event exactly as it was, including reopening ticket sales if the
 * request is what closed them.
 */
export async function rejectEventCancellation(req, res) {
  try {
    const { id } = req.params;
    const { reason = "" } = req.body ?? {};
    const event = await Event.findById(id).populate("createdBy", "_id fcmToken username");
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (event.cancellationRequest?.status !== "pending") {
      return res.status(400).json({ message: "No pending cancellation request for this event" });
    }

    if (event.cancellationRequest.closedSalesOnRequest) {
      event.ticketSalesClosedAt = null;
      event.ticketSalesClosedBy = undefined;
    }
    event.cancellationRequest.status = "rejected";
    event.cancellationRequest.reviewedAt = new Date();
    event.cancellationRequest.reviewedBy = req.user?.username || "admin";
    event.cancellationRequest.rejectReason = reason;
    await event.save();

    invalidateCachePattern(`event_detail_${event._id}_`);

    const body = reason
      ? `We couldn't cancel "${event.title}". Reason: ${reason}`
      : `We couldn't cancel "${event.title}". Contact support if you need to discuss it.`;
    notifyUser(event.createdBy?._id, {
      type: "event_cancellation_rejected",
      title: "Cancellation request declined",
      body,
      data: { eventId: String(event._id) },
    });

    res.json({ status: "rejected" });
  } catch (error) {
    console.error("rejectEventCancellation:", error);
    res.status(500).json({ message: error.message });
  }
}
