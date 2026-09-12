import mongoose from "mongoose";

/**
 * One Birthday Raffle campaign — an admin-managed window during which
 * `isBirthdayRaffle` events qualify for prizes.
 *
 * Only one campaign is "active" at a time; ending it (status:"ended") closes
 * entry until the next campaign is created. An event's membership in a campaign
 * is derived from its `createdAt` falling within [startDate, endDate] — there is
 * no ref on Event — so campaign windows must not overlap. That invariant is
 * enforced in admin.controller.js on create/update, not here.
 *
 * The row is seeded from the old hardcoded RAFFLE_CAMPAIGN_END by
 * server/src/scripts/seedRaffleCampaign.mjs. Until it runs, the raffle
 * controllers fall back to a synthetic default (see raffleCampaign.service.js).
 */

// One prize tier. `rank` is 1..N (1 = top prize) and the array length is "how
// many winners this campaign has". Rewards are free text, shown verbatim on
// the mobile raffle screen, so each carries its own amount.
//
// `rewardNGN`/`rewardUSD` split the prize by the winner's country — Nigerian
// winners see the NGN copy, everyone else sees USD (see isNigerianCountry /
// prizeReward in raffleCampaign.service.js). `reward` is the pre-split legacy
// field, kept only so rows saved before the split still resolve to something;
// new writes go through admin.controller.js's normalizePrizes, which always
// populates both regional fields.
const prizeSchema = mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1 },
    reward: { type: String, trim: true },
    rewardNGN: { type: String, trim: true },
    rewardUSD: { type: String, trim: true },
  },
  { _id: false }
);

const raffleCampaignSchema = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "ended"], default: "active", index: true },

    // Prize tiers, ordered by rank. Empty on rows created before this field
    // existed — readers fall back to DEFAULT_RAFFLE_PRIZES for those.
    prizes: { type: [prizeSchema], default: [] },

    // Verified RSVPs (the host's live "going" list — see scoreEntry in
    // birthdayRaffle.controller.js) a birthday event needs before its host is
    // eligible to win a prize. Admin-controlled; existing rows default to 6
    // via this schema default whenever they're read as a hydrated document.
    minReferrals: { type: Number, default: 6, min: 0 },

    // Admin JWTs carry only a username — same attribution convention as
    // discountCode.createdByAdmin / event pendingEdits.reviewedBy.
    createdByAdmin: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("raffleCampaign", raffleCampaignSchema);
