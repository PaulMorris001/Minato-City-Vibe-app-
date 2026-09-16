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
// many winners this campaign has".
//
// There is no cash prize — the entire prize is OurCityVibe credit a winner is
// credited on pick (services/payments/coupon.service.js), split by the
// winner's country: a Nigerian winner gets couponNGN worth of credit (1
// credit = ₦1), everyone else gets couponUSD (1 credit = $1) — there's no
// exchange rate between the two. `extraPerk` is an optional, region-agnostic
// non-cash bonus shown alongside the credit amount (e.g. "Premium Event
// Pass") — it isn't priced, so it isn't split by country.
const prizeSchema = mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1 },
    couponNGN: { type: Number, default: 0, min: 0 },
    couponUSD: { type: Number, default: 0, min: 0 },
    extraPerk: { type: String, trim: true, default: "" },
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
    // There is no ceiling — ranking (drawRaffleWinners in admin.controller.js)
    // sorts by verified RSVPs with no upper bound.
    minReferrals: { type: Number, default: 6, min: 0 },

    // The vendor a winner's credit is redeemable at, one per currency (a
    // Nigerian winner's couponNGN can only be spent with vendorNGN, everyone
    // else's couponUSD only with vendorUSD — see coupon.service.js's
    // couponVendorNGN/USD lock on User). Both a user account with
    // isVendor:true, ref "user" to match Order.vendor / Service.vendor.
    // Optional: a campaign with neither set awards credit spendable at any
    // vendor, same as before this field existed.
    vendorNGN: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    vendorUSD: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },

    // Admin JWTs carry only a username — same attribution convention as
    // discountCode.createdByAdmin / event pendingEdits.reviewedBy.
    createdByAdmin: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("raffleCampaign", raffleCampaignSchema);
