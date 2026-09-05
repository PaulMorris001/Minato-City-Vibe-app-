/**
 * Birthday Raffle campaign resolution — the one place both raffle controllers
 * (user-facing status + admin ops) agree on "which campaign are we in".
 */

import RaffleCampaign from "../models/raffleCampaign.model.js";
import { RAFFLE_CAMPAIGN_END } from "../config/birthdayRaffle.js";

// The three tiers the raffle shipped with. Used for a fresh campaign's starting
// point and as the fallback for campaign rows saved before `prizes` existed.
export const DEFAULT_RAFFLE_PRIZES = [
  { rank: 1, reward: "₦150,000 Cash + Premium Event Pass" },
  { rank: 2, reward: "₦75,000 Cash" },
  { rank: 3, reward: "₦40,000 Cash" },
];

// Synthetic campaign used only before seedRaffleCampaign.mjs has run. Mirrors
// the old single-hardcoded-deadline behaviour so nothing breaks in the gap.
export const DEFAULT_CAMPAIGN = {
  _id: null,
  name: "Birthday Raffle",
  startDate: new Date(0),
  endDate: RAFFLE_CAMPAIGN_END,
  status: "active",
  prizes: DEFAULT_RAFFLE_PRIZES,
};

/** A campaign's prize tiers, or the legacy default for rows that predate the
 *  field. Always returns at least one tier. */
export function campaignPrizes(campaign) {
  const p = campaign?.prizes;
  return Array.isArray(p) && p.length ? p : DEFAULT_RAFFLE_PRIZES;
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
