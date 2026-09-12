import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import {
  getCurrentCampaign,
  campaignMinReferrals,
  resolvedPrizes,
  isNigerianCountry,
  isCampaignOpen,
} from "../services/raffleCampaign.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Score + status for one qualifying event, derived entirely from its own
 * guest lists rather than a separate tally — so it can never drift from what
 * event.controller.js already maintains.
 *
 * `verifiedRsvps` reads `rsvpUsers`, not `invitedUsers`. The two overlap but
 * aren't the same thing: invitedUsers is a one-way "ever confirmed" guest
 * list that respondToInvite/joinEventByShareLink only ever add to — nothing
 * in the app removes someone from it. rsvpUsers is the live "going" toggle
 * (POST /events/:id/rsvp), which the guest can flip back to "not_going" at
 * any time. Scoring off invitedUsers would mean an undone RSVP still counted
 * toward the raffle forever; rsvpUsers actually goes back down.
 *
 * `totalInvites` is intentionally the other list (invitedUsers +
 * pendingInvites) — it's "how many people were reached out to", which
 * shouldn't un-count just because one of them later backs out of going.
 *
 * `isEligible` gates on the campaign's `minReferrals` — creating the event is
 * enough to enter (`hasQualifyingEvent`), but a host only becomes prize-
 * eligible once enough of their invitees have actually verified-RSVP'd.
 */
function scoreEntry(event, campaign) {
  const verifiedRsvps = event.rsvpUsers.length;
  const totalInvites = event.invitedUsers.length + event.pendingInvites.length;
  const campaignOver = Date.now() > new Date(campaign.endDate).getTime();
  const minReferrals = campaignMinReferrals(campaign);
  return {
    eventId: event._id,
    eventTitle: event.title,
    eventDate: event.date,
    // Callers build the actual share URL client-side via createEventShareLink
    // — same helper every other share flow in the app already uses.
    trackingCode: event.slug || event.shareToken || event._id.toString(),
    verifiedRsvps,
    totalInvites,
    eligibilityScore: 1 + verifiedRsvps, // base entry + one point per verified RSVP
    isEligible: verifiedRsvps >= minReferrals,
    minReferrals,
    referralsNeeded: Math.max(0, minReferrals - verifiedRsvps),
    status: event.raffleWinnerRank ? "winner" : campaignOver ? "eligible" : "active",
    winnerRank: event.raffleWinnerRank || null,
  };
}

/**
 * GET /raffle/status — whether the current user has a qualifying birthday
 * event in the current campaign and, if so, their entry stats. Backs both the
 * raffle landing page (which only needs `hasQualifyingEvent`) and the status
 * page (which needs everything).
 */
export async function getRaffleStatus(req, res) {
  try {
    const [campaign, user] = await Promise.all([
      getCurrentCampaign(),
      User.findById(req.user.id).select("location.country"),
    ]);
    const isNigerian = isNigerianCountry(user?.location?.country);

    const events = await Event.find({
      createdBy: req.user.id,
      isBirthdayRaffle: true,
      // Only events created inside this campaign's window qualify.
      createdAt: { $gte: campaign.startDate, $lte: campaign.endDate },
    });

    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(campaign.endDate).getTime() - Date.now()) / DAY_MS)
    );
    const campaignDeadline = new Date(campaign.endDate).toISOString();
    // Prize tiers for this campaign, localized to the requesting user's
    // country, so the app can render real rewards instead of its hardcoded
    // copy without needing to know about the NGN/USD split itself.
    const prizes = resolvedPrizes(campaign, isNigerian);
    const minReferrals = campaignMinReferrals(campaign);
    // Whether NEW birthday events can enter right now (mirrors the same check
    // event.controller.js enforces on creation) — the raffle landing page uses
    // this to gray out "Create Birthday Event" and explain why, instead of
    // letting the user hit the create flow and bounce off a 400 there.
    // Ending a campaign early (admin.controller.js's endRaffleCampaign) also
    // pulls its endDate back to that moment, so this and the deadline shown
    // to the user agree.
    const campaignOpen = isCampaignOpen(campaign);
    // The name an admin gave this campaign — the raffle screen's hero title
    // is this, not a hardcoded string, so renaming a campaign in the admin
    // dashboard is what actually renames it in the app.
    const campaignName = campaign.name;

    if (events.length === 0) {
      return res.json({
        hasQualifyingEvent: false,
        daysLeft,
        campaignDeadline,
        prizes,
        minReferrals,
        campaignOpen,
        campaignName,
      });
    }

    // Multiple qualifying events are allowed (more parties, more chances) —
    // the one with the most verified RSVPs is what the single-entry UI shows.
    const best = events.reduce((a, b) => (b.rsvpUsers.length > a.rsvpUsers.length ? b : a));

    res.json({
      hasQualifyingEvent: true,
      ...scoreEntry(best, campaign),
      daysLeft,
      campaignDeadline,
      prizes,
      campaignOpen,
      campaignName,
    });
  } catch (error) {
    console.error("Get raffle status error:", error);
    res.status(500).json({ message: "Error fetching raffle status", error: error.message });
  }
}
