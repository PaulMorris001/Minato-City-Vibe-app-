import Attendance from "../models/attendance.model.js";
import Ticket from "../models/ticket.model.js";
import User from "../models/user.model.js";
import { venueOptions } from "../utils/eventLocations.js";

/**
 * The organizer's guest list for one event: one row per PERSON who signed up,
 * whether they RSVP'd to a free event or paid for a ticket, plus a per-venue
 * breakdown for a multi-venue event.
 *
 * Shared by the organizer's `GET /events/:eventId/signups` and the admin
 * console's `GET /admin/events/:id/signups` — two different auth gates (user
 * token vs. the admin-only secret) over one answer, so the two can't drift.
 *
 * The venue breakdown is counted off PASSES, not tickets or rsvpUsers: a pass is
 * exactly one body arriving at exactly one door, which is the number an
 * organizer staffs against and the number their scanner will see. `ticketCount`
 * and `tiers` still come from tickets, which is where the money is recorded.
 *
 * @param {object} event  an Event doc (needs rsvpUsers, invitedUsers, location,
 *   city and additionalLocations selected)
 * @returns {Promise<object>} the response body both endpoints return
 */
export async function buildEventSignups(event) {
  const eventId = event._id;

  // RSVP side: people who confirmed, plus anyone already counted as attending
  // (joined via link or accepted an invite).
  const rsvpIds = [
    ...new Set([...(event.rsvpUsers || []), ...(event.invitedUsers || [])].map(String)),
  ];

  const [tickets, passes] = await Promise.all([
    Ticket.find({ event: eventId, isValid: true })
      .select("user tierName purchaseDate")
      .lean(),
    Attendance.find({ event: eventId })
      .select("user type status attendedAt createdAt locationIndex locationName locationCity")
      .lean(),
  ]);

  // Ticket rows collapse to one entry per holder.
  const ticketsByUser = new Map();
  for (const t of tickets) {
    if (!t.user) continue;
    const key = String(t.user);
    const row = ticketsByUser.get(key) || { count: 0, tiers: [], firstAt: null };
    row.count += 1;
    if (t.tierName && !row.tiers.includes(t.tierName)) row.tiers.push(t.tierName);
    if (t.purchaseDate && (!row.firstAt || t.purchaseDate < row.firstAt)) {
      row.firstAt = t.purchaseDate;
    }
    ticketsByUser.set(key, row);
  }

  // Per-venue totals. `venues` is empty for a single-venue event — there was
  // nothing to choose, so there is nothing to break down.
  const venues = venueOptions(event).map((v) => ({
    ...v,
    total: 0,
    rsvpCount: 0,
    ticketCount: 0,
    attendedCount: 0,
  }));
  // Passes with no pick, or a pick whose venue the organizer has since removed
  // from the event. Reported separately rather than folded into venue #1, which
  // would invent attendance the organizer then staffs against.
  const unspecified = { total: 0, rsvpCount: 0, ticketCount: 0, attendedCount: 0 };

  // Pass state gives us check-in status, a "signed up" time for RSVPs, and which
  // door each of a person's passes is for.
  const passByUser = new Map();
  for (const p of passes) {
    // Skipped entirely on a single-venue event: with no venues to split across,
    // every pass would pile into `unspecified` and read as a roster of people
    // who failed to answer a question they were never asked.
    if (venues.length) {
      const bucket = (p.locationIndex != null && venues[p.locationIndex]) || unspecified;
      bucket.total += 1;
      if (p.type === "ticket") bucket.ticketCount += 1;
      else bucket.rsvpCount += 1;
      if (p.status === "attended") bucket.attendedCount += 1;
    }

    if (!p.user) continue;
    const key = String(p.user);
    const attended = p.status === "attended";
    let existing = passByUser.get(key);
    if (!existing) {
      existing = {
        checkedIn: attended,
        attendedAt: p.attendedAt || null,
        createdAt: p.createdAt || null,
        locations: new Map(),
      };
      passByUser.set(key, existing);
    } else {
      if (attended && !existing.checkedIn) {
        existing.checkedIn = true;
        existing.attendedAt = p.attendedAt || existing.attendedAt;
      }
      if (p.createdAt && (!existing.createdAt || p.createdAt < existing.createdAt)) {
        existing.createdAt = p.createdAt;
      }
    }
    if (p.locationIndex != null) {
      const lk = String(p.locationIndex);
      const loc = existing.locations.get(lk);
      if (loc) loc.count += 1;
      else {
        existing.locations.set(lk, {
          index: p.locationIndex,
          // The pass's own snapshot, so a venue renamed (or dropped) since the
          // pick still reads as what the attendee was actually told.
          name: p.locationName || "",
          city: p.locationCity || "",
          count: 1,
        });
      }
    }
  }

  const allIds = [...new Set([...rsvpIds, ...ticketsByUser.keys()])];
  const users = await User.find({ _id: { $in: allIds } })
    .select("username profilePicture isGuest")
    .lean();

  const attendees = users.map((u) => {
    const key = String(u._id);
    const ticket = ticketsByUser.get(key);
    const pass = passByUser.get(key);
    return {
      userId: key,
      username: u.username,
      profilePicture: u.profilePicture || "",
      // Guest accounts are created for ticket recipients who never installed
      // the app — the client shouldn't link to an empty profile.
      isGuest: !!u.isGuest,
      type: ticket ? "ticket" : "rsvp",
      ticketCount: ticket?.count || 0,
      tiers: ticket?.tiers || [],
      // Which venue(s) this person is going to, with a count per venue — a
      // buyer can hold passes for more than one date of a multi-venue event.
      // Empty means they never picked (or the event has one venue).
      locations: pass ? [...pass.locations.values()].sort((a, b) => a.index - b.index) : [],
      checkedIn: !!pass?.checkedIn,
      attendedAt: pass?.attendedAt || null,
      joinedAt: ticket?.firstAt || pass?.createdAt || null,
    };
  });

  // Most recent signups first; anyone without a timestamp (legacy RSVPs with
  // no pass) sorts to the end alphabetically.
  attendees.sort((a, b) => {
    if (a.joinedAt && b.joinedAt) return new Date(b.joinedAt) - new Date(a.joinedAt);
    if (a.joinedAt) return -1;
    if (b.joinedAt) return 1;
    return (a.username || "").localeCompare(b.username || "");
  });

  return {
    total: attendees.length,
    rsvpCount: attendees.filter((a) => a.type === "rsvp").length,
    ticketCount: attendees.filter((a) => a.type === "ticket").length,
    ticketsIssued: tickets.length,
    attendedCount: attendees.filter((a) => a.checkedIn).length,
    venues,
    unspecifiedVenue: unspecified,
    attendees,
  };
}
