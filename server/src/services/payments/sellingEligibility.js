/**
 * The "can this user charge money?" gate, shared by every paid listing type.
 *
 * Events had a payout gate; guides and services had none, so a user anywhere in
 * the world could publish a paid guide with no rail behind it and only discover
 * the problem when a buyer's checkout failed — the wrong person, at the wrong
 * moment. This puts the check in one place so all three behave identically.
 *
 * Three distinct failures, deliberately kept apart:
 *   - `payout_country_missing` — we don't know where they are. Also fixable, and
 *     the common case: nothing in the social sign-in flow ever asks for a
 *     country, so most accounts have none. Folding it into "unsupported" (which
 *     is what an empty country used to do) tells a Nigerian or American seller
 *     their country will never be supported, and offers them no way out.
 *   - `payout_country_unsupported` — no rail reaches their country. Permanent,
 *     nothing they can do, so the copy must not send them to a setup screen.
 *   - `payout_setup_required` — a rail exists, they just haven't finished
 *     onboarding. Fixable, so the copy points at it.
 */

import {
  payoutSupported,
  payoutCountryKnown,
  hasPayoutOnboarding,
} from "./resolveProvider.js";

/**
 * Check whether a seller may list something paid.
 *
 * The `user` must have been selected with PAYOUT_ROUTING_FIELDS — an unselected
 * field reads as undefined and would report a fully onboarded seller as blocked.
 *
 * @param {object} user  seller doc including PAYOUT_ROUTING_FIELDS
 * @returns {{status: number, body: object} | null} null when they may sell
 */
export function checkPayoutEligibility(user) {
  if (!payoutCountryKnown(user)) {
    return {
      status: 403,
      body: {
        code: "payout_country_missing",
        message:
          "Set your location in Settings so we know how to pay you, then try again.",
      },
    };
  }

  if (!payoutSupported(user)) {
    const country = user?.location?.country;
    return {
      status: 403,
      body: {
        code: "payout_country_unsupported",
        message:
          `Paid listings aren't available in ${country || "your country"} yet. ` +
          `You can still publish free events and guides — we'll let you know the ` +
          `moment payouts launch where you are.`,
      },
    };
  }

  if (!hasPayoutOnboarding(user)) {
    return {
      status: 403,
      body: {
        code: "payout_setup_required",
        message:
          "Connect your payout account before selling. Open Settings → Earnings to finish onboarding.",
      },
    };
  }

  return null;
}

/**
 * Express convenience: send the gate response if the seller is blocked.
 *
 *   if (price > 0 && rejectIfCannotSell(res, user)) return;
 *
 * @returns {boolean} true when a response was sent and the caller must stop
 */
export function rejectIfCannotSell(res, user) {
  const failure = checkPayoutEligibility(user);
  if (!failure) return false;
  res.status(failure.status).json(failure.body);
  return true;
}

export default { checkPayoutEligibility, rejectIfCannotSell };
