import Event from "../models/event.model.js";
import User from "../models/user.model.js";
import {
  getCurrentCampaign,
  getOpenCampaign,
  findCampaignForDate,
  syntheticMonthCampaign,
  campaignMinReferrals,
  resolvedPrizes,
  campaignVendor,
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

/** The generic, no-specific-event-yet fields every /raffle/status response
 *  carries — either about `campaign` directly (landing page, guest view) or
 *  about the specific campaign/stand-in an entry's own event.date resolved
 *  to (see getRaffleStatus). */
async function publicCampaignInfo(campaign, isNigerian) {
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(campaign.endDate).getTime() - Date.now()) / DAY_MS)
  );
  return {
    daysLeft,
    campaignStartsAt: new Date(campaign.startDate).toISOString(),
    campaignDeadline: new Date(campaign.endDate).toISOString(),
    // Prize tiers for this campaign, localized to the requesting user's
    // country: Nigerian viewers see Naira, everyone else sees Dollars.
    prizes: resolvedPrizes(campaign, isNigerian),
    minReferrals: campaignMinReferrals(campaign),
    // Whether NEW birthday events dated for this window can still enter —
    // the raffle screens use this to explain a closed/pending state instead
    // of letting the user hit the create flow and bounce off a 400 there.
    campaignOpen: isCampaignOpen(campaign),
    // The name an admin gave this campaign — the raffle screen's hero title
    // is this, not a hardcoded string, so renaming a campaign in the admin
    // dashboard is what actually renames it in the app. Real campaigns only;
    // a synthetic stand-in keeps the generic "Birthday Raffle" name.
    campaignName: campaign.name,
    // The vendor this viewer's credit would be redeemable at, if they win —
    // shown on the raffle landing page so anyone can see (and visit) it
    // before entering, not just an already-picked winner. Null for a
    // synthetic stand-in (no vendor to assign until the campaign is real).
    vendor: await campaignVendor(campaign, isNigerian),
  };
}

/** Public campaign summary for the raffle landing screen. No account or entry
 * information is included, so logged-out users can see whether the raffle is live. */
export async function getPublicRaffleCampaign(req, res) {
  try {
    const campaign = await getOpenCampaign();
    if (!campaign) return res.json({ active: false });
    const info = await publicCampaignInfo(campaign, false);
    // Logged-out visitors have no country context. Never expose a currency
    // amount here; the guest UI should communicate that prizes are available,
    // while authenticated users receive their localized values from /status.
    res.json({
      active: true,
      ...info,
      prizes: info.prizes.map((prize) => ({
        ...prize,
        couponAmount: 0,
        extraPerk: "",
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching raffle campaign" });
  }
}

/**
 * GET /raffle/status — whether the current user has a qualifying birthday
 * event and, if so, their entry stats. Backs both the raffle landing page
 * (which only needs `hasQualifyingEvent`) and the status page (which needs
 * everything).
 *
 * Campaigns run as concurrent monthly batches: a user can have a birthday
 * event dated for this month (competing now) or a future month up to 6
 * months out (pending — pre-registered before that month's campaign even
 * exists). A user can also hold multiple qualifying events across different
 * months. Priority for which one this single-entry response describes:
 * an already-decided winner, else one currently competing in an open
 * campaign (highest RSVPs breaks a tie), else the soonest upcoming pending
 * one.
 */
export async function getRaffleStatus(req, res) {
  try {
    const user = await User.findById(req.user.id).select("location.country");
    const isNigerian = isNigerianCountry(user?.location?.country);

    const events = await Event.find({
      createdBy: req.user.id,
      isBirthdayRaffle: true,
    }).sort({ date: 1 });

    if (events.length === 0) {
      const campaign = await getCurrentCampaign();
      return res.json({
        hasQualifyingEvent: false,
        ...(await publicCampaignInfo(campaign, isNigerian)),
      });
    }

    const withCampaign = await Promise.all(
      events.map(async (event) => ({
        event,
        campaign: (await findCampaignForDate(event.date)) || syntheticMonthCampaign(event.date),
      }))
    );

    withCampaign.sort((a, b) => {
      const aWin = a.event.raffleWinnerRank ? 1 : 0;
      const bWin = b.event.raffleWinnerRank ? 1 : 0;
      if (aWin !== bWin) return bWin - aWin;
      const aOpen = isCampaignOpen(a.campaign) ? 1 : 0;
      const bOpen = isCampaignOpen(b.campaign) ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      if (aOpen && bOpen) return b.event.rsvpUsers.length - a.event.rsvpUsers.length;
      return new Date(a.event.date).getTime() - new Date(b.event.date).getTime();
    });

    const { event: best, campaign } = withCampaign[0];
    // A synthetic stand-in (`_id: null`) means no admin campaign covers this
    // entry's month yet — it's registered but waiting for that batch.
    const pending = campaign._id === null;

    res.json({
      hasQualifyingEvent: true,
      pending,
      ...scoreEntry(best, campaign),
      ...(await publicCampaignInfo(campaign, isNigerian)),
    });
  } catch (error) {
    console.error("Get raffle status error:", error);
    res.status(500).json({ message: "Error fetching raffle status", error: error.message });
  }
}
