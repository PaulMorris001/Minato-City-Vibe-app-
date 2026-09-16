/**
 * Birthday Raffle campaign resolution — the one place both raffle controllers
 * (user-facing status + admin ops) agree on "which campaign are we in".
 */

import RaffleCampaign from "../models/raffleCampaign.model.js";
import { Vendor } from "../models/vendor.model.js";
import { RAFFLE_CAMPAIGN_END } from "../config/birthdayRaffle.js";

// The three tiers the raffle shipped with. Used for a fresh campaign's starting
// point and as the fallback for campaign rows saved before `prizes` existed.
export const DEFAULT_RAFFLE_PRIZES = [
  { rank: 1, couponNGN: 150000, couponUSD: 100, extraPerk: "Premium Event Pass" },
  { rank: 2, couponNGN: 75000, couponUSD: 50, extraPerk: "" },
  { rank: 3, couponNGN: 40000, couponUSD: 25, extraPerk: "" },
];

// Verified RSVPs a birthday event needs before its host is eligible to win —
// mirrors the schema default on raffleCampaign.model.js so the synthetic
// pre-seed campaign below behaves the same as a real row.
export const DEFAULT_MIN_REFERRALS = 6;

// Synthetic campaign used only before seedRaffleCampaign.mjs has run. Mirrors
// the old single-hardcoded-deadline behaviour so nothing breaks in the gap.
export const DEFAULT_CAMPAIGN = {
  _id: null,
  name: "Birthday Raffle",
  startDate: new Date(0),
  endDate: RAFFLE_CAMPAIGN_END,
  status: "active",
  prizes: DEFAULT_RAFFLE_PRIZES,
  minReferrals: DEFAULT_MIN_REFERRALS,
};

/** A campaign's prize tiers, or the legacy default for rows that predate the
 *  field. Always returns at least one tier. Internal shape — carries both
 *  regional rewards; use `resolvedPrizes` to localize for a specific user. */
export function campaignPrizes(campaign) {
  const p = campaign?.prizes;
  return Array.isArray(p) && p.length ? p : DEFAULT_RAFFLE_PRIZES;
}

/** Verified RSVPs required to be prize-eligible, or the default for rows
 *  saved before the field existed. */
export function campaignMinReferrals(campaign) {
  return campaign?.minReferrals ?? DEFAULT_MIN_REFERRALS;
}

// Countries whose winners are paid/shown the NGN prize copy — same launch
// scope as Paystack selling (mobile/constants/payments.ts, server's
// services/payments/resolveProvider.js), but intentionally its own constant:
// the raffle's prize currency shouldn't move just because the payments team
// toggles the Paystack rollout flag for an unrelated reason.
const NIGERIA_COUNTRY_NAMES = new Set(["nigeria", "ng"]);

/** Whether `country` (as stored on `user.location.country`, free text) reads
 *  as Nigeria. Case/whitespace-insensitive, like every other country check
 *  in this codebase. */
export function isNigerianCountry(country) {
  return NIGERIA_COUNTRY_NAMES.has((country || "").trim().toLowerCase());
}

/** One prize tier's coupon award as a plain local-currency amount — 1 coupon
 *  = 1 unit of that currency, so this IS both "how much a winner in
 *  `isNigerian`'s country won" and the coupon amount credited to their
 *  same-currency balance (services/payments/coupon.service.js). There is no
 *  cash component and no cross-currency conversion. */
export function prizeCouponAmount(prize, isNigerian) {
  return isNigerian ? prize?.couponNGN || 0 : prize?.couponUSD || 0;
}

/** `amount` in `isNigerian`'s currency, formatted for display: 150000 ->
 *  "₦150,000", 100 -> "$100". Used in the winner notification so a payout
 *  reads as real money ("₦150,000 in OurCityVibe coupons") rather than a
 *  bare, unfamiliar coupon count. */
export function formatCurrencyAmount(amount, isNigerian) {
  const symbol = isNigerian ? "₦" : "$";
  return `${symbol}${Number(amount).toLocaleString("en-US")}`;
}

/** One prize tier's optional non-cash bonus (e.g. "Premium Event Pass").
 *  Region-agnostic — not priced, so nothing to localize. */
export function prizeExtraPerk(prize) {
  return prize?.extraPerk || "";
}

/** A campaign's prize tiers localized for one user — `[{ rank, couponAmount,
 *  couponCurrency, extraPerk }]`, the shape the mobile raffle screens render.
 *  Nigerian viewers see their tier's `couponNGN` (currency "NGN"); everyone
 *  else sees `couponUSD` (currency "USD") — only ever one currency, never
 *  both, matching what that viewer will actually be credited/see spendable. */
export function resolvedPrizes(campaign, isNigerian) {
  return campaignPrizes(campaign).map((p) => ({
    rank: p.rank,
    couponAmount: prizeCouponAmount(p, isNigerian),
    couponCurrency: isNigerian ? "NGN" : "USD",
    extraPerk: prizeExtraPerk(p),
  }));
}

// Fields worth showing a viewer about the vendor their credit would redeem
// at — never more than this, since it's read by the public /raffle/status
// endpoint, not an admin-only one.
const VENDOR_DISPLAY_SELECT = "username businessName businessPicture profilePicture";

/**
 * The campaign covering *today* — used for generic, no-event-yet displays
 * (the raffle landing page's marketing copy, a guest's placeholder info).
 * Since campaigns now run as concurrent monthly batches (a future month's
 * campaign can exist and be `status:"active"` well before its window
 * starts — see createRaffleCampaign), this can no longer just take the
 * active campaign with the latest startDate: that would return next
 * month's row instead of the one actually running right now. When no campaign
 * is running, prefer the nearest scheduled active campaign so users can see
 * the next raffle. Falls back to the most recently ended campaign, then the
 * synthetic default.
 *
 * A specific event's own campaign (which may be a different, future month)
 * is `findCampaignForDate(event.date)`, not this.
 */
export async function getCurrentCampaign() {
  const now = new Date();
  const active = await RaffleCampaign.findOne({
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate("vendorNGN", VENDOR_DISPLAY_SELECT)
    .populate("vendorUSD", VENDOR_DISPLAY_SELECT);
  if (active) return active;
  const upcoming = await RaffleCampaign.findOne({
    status: "active",
    startDate: { $gt: now },
  })
    .sort({ startDate: 1 })
    .populate("vendorNGN", VENDOR_DISPLAY_SELECT)
    .populate("vendorUSD", VENDOR_DISPLAY_SELECT);
  if (upcoming) return upcoming;
  const latest = await RaffleCampaign.findOne({ endDate: { $lte: now } })
    .sort({ endDate: -1 })
    .populate("vendorNGN", VENDOR_DISPLAY_SELECT)
    .populate("vendorUSD", VENDOR_DISPLAY_SELECT);
  return latest || DEFAULT_CAMPAIGN;
}

/** The campaign that is open for new entries right now, or null when there is
 * no live campaign. Used by the unauthenticated raffle landing screen. */
export async function getOpenCampaign() {
  const now = new Date();
  return RaffleCampaign.findOne({
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate("vendorNGN", VENDOR_DISPLAY_SELECT)
    .populate("vendorUSD", VENDOR_DISPLAY_SELECT);
}

/**
 * The real, admin-created campaign whose window covers `date` (a birthday
 * event's own `date` field), regardless of status — an ended campaign's
 * window still reflects the dates it actually ran, so entries scored or
 * drawn against it keep resolving correctly after the fact. `null` when no
 * campaign has been created for that month yet (the entry is pending —
 * pair with `syntheticMonthCampaign` for a same-shaped stand-in).
 */
export async function findCampaignForDate(date) {
  return RaffleCampaign.findOne({
    startDate: { $lte: date },
    endDate: { $gte: date },
  })
    .populate("vendorNGN", VENDOR_DISPLAY_SELECT)
    .populate("vendorUSD", VENDOR_DISPLAY_SELECT);
}

/**
 * A same-shaped stand-in for a calendar month that has no admin-created
 * campaign row yet, so a pre-registered future birthday entry can still
 * show a deadline and default prize info on the status page instead of
 * erroring out while it waits ("pending") for that month's real campaign
 * to be created. `_id: null` is how callers tell this apart from a real one.
 */
export function syntheticMonthCampaign(date) {
  const d = new Date(date);
  return {
    _id: null,
    name: "Birthday Raffle",
    startDate: new Date(d.getFullYear(), d.getMonth(), 1),
    endDate: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    status: "active",
    prizes: DEFAULT_RAFFLE_PRIZES,
    minReferrals: DEFAULT_MIN_REFERRALS,
    vendorNGN: null,
    vendorUSD: null,
  };
}

// How far ahead of "now" a birthday event may be dated and still enter the
// raffle — an entrant can pre-register for a month whose campaign doesn't
// exist yet; it just sits pending until that month's batch is created.
export const MAX_MONTHS_AHEAD = 6;

/**
 * Null when `date` (a birthday event's chosen date) is fair game for the
 * raffle: not already past, and not more than `MAX_MONTHS_AHEAD` calendar
 * months from now. Otherwise an error string safe to return to the client
 * as-is. Deliberately independent of whether any campaign row exists for
 * that month yet — entry eligibility is about the event's own date, not
 * "is there currently one active campaign running" (that used to be the
 * gate; it's what made a user's December birthday un-enterable in August).
 */
export function birthdayRaffleDateError(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "date is required";
  const now = new Date();
  if (d.getTime() < now.getTime()) return "Birthday event date must be in the future";
  const maxDate = new Date(now.getFullYear(), now.getMonth() + MAX_MONTHS_AHEAD + 1, 0, 23, 59, 59, 999);
  if (d.getTime() > maxDate.getTime()) {
    return `Birthday Raffle entries can only be created up to ${MAX_MONTHS_AHEAD} months ahead`;
  }
  return null;
}

/**
 * The vendor a viewer's credit from this campaign would be redeemable at, in
 * `isNigerian`'s currency — `null` when that tier has no vendor assigned
 * (spendable anywhere).
 *
 * `_id` here is the vendor's USER account id (what `vendorNGN`/`vendorUSD`
 * actually store, and what `order.vendor` / the coupon lock compare against
 * — see coupon.service.js). That is NOT what `GET /vendors/:vendorId` (the
 * mobile vendor-details screen) expects: it looks up the separate Vendor
 * *listing* document by its own `_id`. `vendorId` below is that listing's
 * id, resolved the same way getUserById does in auth.controller.js — `null`
 * if the account has no Vendor doc (interrupted onboarding), in which case
 * the client should hide the "visit vendor" link rather than dead-end it.
 */
export async function campaignVendor(campaign, isNigerian) {
  const vendorUser = (isNigerian ? campaign?.vendorNGN : campaign?.vendorUSD) || null;
  if (!vendorUser) return null;

  const vendorDoc = await Vendor.findOne({ user: vendorUser._id }).select("_id").lean();

  return {
    _id: String(vendorUser._id),
    vendorId: vendorDoc ? String(vendorDoc._id) : null,
    username: vendorUser.username,
    businessName: vendorUser.businessName,
    businessPicture: vendorUser.businessPicture,
    profilePicture: vendorUser.profilePicture,
  };
}

/** True when new `isBirthdayRaffle` events may be entered right now. */
export function isCampaignOpen(campaign) {
  if (!campaign || campaign.status !== "active") return false;
  const now = Date.now();
  return (
    now >= new Date(campaign.startDate).getTime() &&
    now <= new Date(campaign.endDate).getTime()
  );
}
