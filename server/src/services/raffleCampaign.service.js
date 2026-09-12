/**
 * Birthday Raffle campaign resolution — the one place both raffle controllers
 * (user-facing status + admin ops) agree on "which campaign are we in".
 */

import RaffleCampaign from "../models/raffleCampaign.model.js";
import { RAFFLE_CAMPAIGN_END } from "../config/birthdayRaffle.js";

// The three tiers the raffle shipped with. Used for a fresh campaign's starting
// point and as the fallback for campaign rows saved before `prizes` existed.
export const DEFAULT_RAFFLE_PRIZES = [
  { rank: 1, rewardNGN: "₦150,000 Cash + Premium Event Pass", rewardUSD: "$100 Cash + Premium Event Pass" },
  { rank: 2, rewardNGN: "₦75,000 Cash", rewardUSD: "$50 Cash" },
  { rank: 3, rewardNGN: "₦40,000 Cash", rewardUSD: "$25 Cash" },
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

/** One prize tier's reward text for a winner in `isNigerian`'s country. Falls
 *  back across the regional field that's missing, then the pre-split legacy
 *  `reward`, so a partially-filled or pre-migration row still shows something
 *  rather than an empty prize. */
export function prizeReward(prize, isNigerian) {
  const primary = isNigerian ? prize?.rewardNGN : prize?.rewardUSD;
  const fallback = isNigerian ? prize?.rewardUSD : prize?.rewardNGN;
  return primary || fallback || prize?.reward || "";
}

/** A campaign's prize tiers localized for one user — `[{ rank, reward }]`,
 *  the shape the mobile raffle screens already render. */
export function resolvedPrizes(campaign, isNigerian) {
  return campaignPrizes(campaign).map((p) => ({
    rank: p.rank,
    reward: prizeReward(p, isNigerian),
  }));
}

/**
 * The campaign entries currently belong to: the active one if there is one,
 * otherwise the most recently ended (so a just-closed campaign's status page
 * and admin view keep working), otherwise the synthetic default.
 */
export async function getCurrentCampaign() {
  const active = await RaffleCampaign.findOne({ status: "active" }).sort({ startDate: -1 });
  if (active) return active;
  const latest = await RaffleCampaign.findOne().sort({ endDate: -1 });
  return latest || DEFAULT_CAMPAIGN;
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
