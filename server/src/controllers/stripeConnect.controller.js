/**
 * Stripe Connect controller — settlement-side only.
 *
 * Vendor payout onboarding for the Connect rail: sellers inside Stripe's
 * cross-border-payouts footprint (US, UK, EEA, CA, CH). These sellers COLLECT
 * exactly like everyone else — a PaymentIntent on the PLATFORM account, with no
 * transfer_data and no application_fee_amount — and SETTLE via a Transfer from
 * the platform balance once an admin approves the payout. That funds flow
 * ("separate charges and transfers, without on_behalf_of") is both what the
 * admin-approval gate requires and what Stripe requires for cross-border
 * payouts. Nothing in this file ever touches a charge.
 *
 * Response shapes mirror paystack.controller.js so the
 * mobile client can treat all three rails uniformly.
 */

import stripe from "../config/stripe.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { connectCountryCode } from "../services/payments/resolveProvider.js";
import { markVerified } from "../services/verification.service.js";

/** Deep link the return pages below drive the browser to. Matches the app
 * scheme in mobile/app.config.js ("mobile") and the route file name
 * mobile/app/stripe-connect-onboarding.tsx — openAuthSessionAsync watches this
 * prefix and dismisses the browser the moment it sees the URL. Deliberately a
 * module constant rather than an env var: the deleted pre-2026 implementation
 * read this from APP_URL, whose default outlived the scheme it named. */
const APP_RETURN_URL = "mobile://stripe-connect-onboarding";

/**
 * Translate a Stripe SDK error into something safe to return to the client.
 * We pass through Stripe's `code` and `message` so the mobile app can show the
 * real reason ("Your platform has not been activated for live mode", etc.)
 * instead of a generic "Failed to ..." string.
 */
function stripeErrorPayload(error, fallback) {
  const code = error?.code || error?.raw?.code;
  const stripeMessage = error?.raw?.message || error?.message;
  return {
    message: stripeMessage || fallback,
    code: code || undefined,
  };
}

/**
 * True when a Stripe error indicates the saved Connect account ID is no longer
 * reachable by the current API key. Two sibling cases:
 *   · `resource_missing` — the account ID doesn't exist in this mode at all.
 *   · `account_invalid` — the ID exists but belongs to a different platform
 *     (e.g. the secret key was rotated from a different Stripe account, or
 *     swapped between test and live).
 * Either way the recovery is the same: wipe the stale ID and create a new
 * account under the current key.
 */
function isStaleAccountError(err) {
  const code = err?.code || err?.raw?.code;
  if (code === "resource_missing" || code === "account_invalid") return true;
  // Some platform-mismatch errors don't carry a clean code in older SDK
  // versions — fall back to a message-substring check as a safety net.
  const msg = (err?.raw?.message || err?.message || "").toLowerCase();
  return (
    msg.includes("not connected to your platform") || msg.includes("no such account")
  );
}

/**
 * Params for a new Express account. Shared by create and the stale-account
 * recreate path so the two can't drift.
 *
 * Two things here are load-bearing and easy to break:
 *  · `transfers` is the ONLY requested capability. The connected account never
 *    takes charges in this funds flow, and requesting card_payments would demand
 *    extra KYC it can't satisfy on a cross-border account.
 *  · Non-US accounts MUST be on the `recipient` service agreement: Stripe
 *    rejects a transfers-only account outside the platform's country unless
 *    it's `recipient` (or also requests card_payments). US accounts stay on
 *    the full agreement — `recipient` doesn't apply same-country.
 */
function expressAccountParams({ country, email }) {
  return {
    type: "express",
    country,
    email,
    capabilities: { transfers: { requested: true } },
    ...(country !== "US" && {
      tos_acceptance: { service_agreement: "recipient" },
    }),
  };
}

/** Persist the fields we mirror off a freshly created/updated Stripe account. */
function applyAccountToUser(user, account) {
  user.stripeAccountId = account.id;
  user.stripeAccountCountry = account.country;
  user.stripeAccountCurrency = account.default_currency?.toUpperCase();
  user.stripeOnboardingComplete = false;
  user.stripePayoutsEnabled = false;
}

/**
 * Onboarding is complete when the seller has submitted their details AND Stripe
 * has activated the transfers capability.
 *
 * NOT `charges_enabled`, which the pre-2026 implementation used: with only
 * `transfers` requested, charges_enabled never becomes true, so that predicate
 * would leave every Connect seller permanently blocked from selling tickets.
 */
function isOnboardingComplete(account) {
  return !!account?.details_submitted && account?.capabilities?.transfers === "active";
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

/**
 * Create the seller's Stripe Express account.
 * POST /stripe/connect/create
 */
export const createConnectAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const country = connectCountryCode(user);
    if (!country) {
      // Their country is outside the cross-border-payouts footprint (or the
      // rollout flag is off). Routing should never have sent them here.
      return res.status(409).json({
        message: "Stripe payouts aren't available in your country yet.",
        code: "connect_country_unsupported",
      });
    }

    if (user.stripeAccountId) {
      // An account's country is IMMUTABLE on Stripe's side. If the seller has
      // since moved, reusing the old account would hand them one that can't
      // accept their bank — but silently minting a second account is worse (the
      // old one may hold a balance), so this is an admin decision.
      if (user.stripeAccountCountry && user.stripeAccountCountry !== country) {
        return res.status(409).json({
          message:
            "Your payout account was opened in a different country. Contact support to move it.",
          code: "country_mismatch",
        });
      }
      return res.status(200).json({ accountId: user.stripeAccountId });
    }

    const account = await stripe.accounts.create(
      expressAccountParams({ country, email: user.email })
    );
    applyAccountToUser(user, account);
    await user.save();

    res.status(201).json({ accountId: account.id });
  } catch (error) {
    console.error("Create connect account error:", error?.raw || error);
    res.status(500).json(stripeErrorPayload(error, "Failed to create Stripe account"));
  }
};

/**
 * Generate a Stripe-hosted onboarding link for the seller.
 *
 * If the stored `stripeAccountId` no longer exists in the current Stripe mode
 * (the classic "test acct saved before going live" footgun), we clear it and
 * create a fresh account so the user can proceed without a manual DB fix.
 * GET /stripe/connect/link
 */
export const getAccountLink = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.stripeAccountId) {
      return res.status(400).json({ message: "No Stripe account found. Create one first." });
    }

    const buildLink = (accountId) =>
      stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${config.stripe.serverUrl}/api/stripe/connect/refresh`,
        return_url: `${config.stripe.serverUrl}/api/stripe/connect/return`,
        type: "account_onboarding",
      });

    let accountLink;
    try {
      accountLink = await buildLink(user.stripeAccountId);
    } catch (err) {
      // Stale account ID — either it doesn't exist in this Stripe mode, or it
      // belongs to a different Connect platform than the current secret key.
      // Recover transparently: mint a fresh account and retry once.
      if (isStaleAccountError(err)) {
        const country = connectCountryCode(user);
        if (!country) {
          return res.status(409).json({
            message: "Stripe payouts aren't available in your country yet.",
            code: "connect_country_unsupported",
          });
        }
        console.warn(
          `[Stripe Connect] saved accountId ${user.stripeAccountId} is stale (${
            err?.code || err?.raw?.code || "no-code"
          }) — recreating under the current API key`
        );
        const account = await stripe.accounts.create(
          expressAccountParams({ country, email: user.email })
        );
        applyAccountToUser(user, account);
        await user.save();
        accountLink = await buildLink(account.id);
      } else {
        throw err;
      }
    }

    res.status(200).json({ url: accountLink.url });
  } catch (error) {
    console.error("Get account link error:", error?.raw || error);
    res.status(500).json(stripeErrorPayload(error, "Failed to generate onboarding link"));
  }
};

/**
 * Onboarding status (shape mirrors /paystack/connect/status).
 * GET /stripe/connect/status
 */
export const getAccountStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.stripeAccountId) {
      return res.status(200).json({
        connected: false,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        currency: null,
      });
    }

    // Once complete, serve from the DB — the account.updated webhook keeps these
    // fresh, and AccountTab polls this on every profile load. The live retrieve
    // below is the polling path for sellers still mid-onboarding.
    if (user.stripeOnboardingComplete) {
      return res.status(200).json({
        connected: true,
        onboardingComplete: true,
        chargesEnabled: true,
        payoutsEnabled: !!user.stripePayoutsEnabled,
        currency: user.stripeAccountCurrency || null,
        requirementsDue: 0,
        disabledReason: null,
      });
    }

    let account;
    try {
      account = await stripe.accounts.retrieve(user.stripeAccountId);
    } catch (err) {
      // Saved account ID is unreachable under the current key — wipe it and
      // report disconnected so the UI shows the "Set Up Payouts" CTA, which
      // mints a fresh account on the next tap.
      if (isStaleAccountError(err)) {
        console.warn(
          `[Stripe Connect] saved accountId ${user.stripeAccountId} unreachable on retrieve (${
            err?.code || err?.raw?.code || "no-code"
          }) — clearing`
        );
        user.stripeAccountId = null;
        user.stripeOnboardingComplete = false;
        user.stripePayoutsEnabled = false;
        await user.save();
        return res.status(200).json({
          connected: false,
          onboardingComplete: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          currency: null,
        });
      }
      throw err;
    }

    const onboardingComplete = isOnboardingComplete(account);

    // Persist so subsequent loads can skip the Stripe round-trip. (The webhook
    // normally wins the race, but a seller who returns from onboarding faster
    // than the delivery shouldn't see a stale "Setup Required".)
    if (onboardingComplete !== user.stripeOnboardingComplete) {
      user.stripeOnboardingComplete = onboardingComplete;
      user.stripePayoutsEnabled = !!account.payouts_enabled;
      user.stripeAccountCurrency = account.default_currency?.toUpperCase();
      await user.save();
    }

    res.status(200).json({
      connected: true,
      onboardingComplete,
      // Echoed as onboardingComplete rather than the literal
      // account.charges_enabled (which is always false here — we never request
      // card_payments). Returning the literal would show a red ✗ next to a
      // fully working account.
      chargesEnabled: onboardingComplete,
      payoutsEnabled: !!account.payouts_enabled,
      currency: account.default_currency?.toUpperCase() || null,
      requirementsDue: account.requirements?.currently_due?.length || 0,
      disabledReason: account.requirements?.disabled_reason || null,
    });
  } catch (error) {
    console.error("Get account status error:", error?.raw || error);
    res.status(500).json(stripeErrorPayload(error, "Failed to retrieve account status"));
  }
};

// ─── Connect redirect endpoints ──────────────────────────────────────────────
// Stripe requires HTTPS return/refresh URLs, so these land here and forward the
// browser to the app's custom scheme. A 302 to a custom scheme is unreliable
// across browsers (see paystackReturn), hence the meta-refresh + JS + visible
// link.

function renderAppReturnPage(res, query) {
  const url = `${APP_RETURN_URL}?${query}`;
  const safe = url.replace(/"/g, "&quot;").replace(/</g, "&lt;");
  res.status(200).send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${safe}" />
  <title>OurCityvibe</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background:#0f0a1f;
           color:#eee; display:flex; align-items:center; justify-content:center;
           height:100vh; margin:0; }
    a { color:#a855f7; text-decoration:none; }
  </style>
</head><body>
  <div>
    <p>Returning to OurCityvibe…</p>
    <p><a href="${safe}">Tap here if OurCityvibe doesn't reopen automatically.</a></p>
  </div>
  <script>setTimeout(function(){ window.location.replace("${safe}"); }, 50);</script>
</body></html>`);
}

/** GET /stripe/connect/return — seller finished (or abandoned) the hosted flow. */
export const stripeConnectReturn = (req, res) => renderAppReturnPage(res, "success=true");

/** GET /stripe/connect/refresh — the account link expired; the app re-mints one. */
export const stripeConnectRefresh = (req, res) => renderAppReturnPage(res, "refresh=true");

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Connect webhook — keeps onboarding state in sync with Stripe.
 *
 * This is a SEPARATE endpoint from /stripe/webhook with its OWN signing secret:
 * `account.updated` for connected accounts is only delivered to an endpoint
 * registered in Stripe as "Events on Connected accounts", and the account
 * webhook's secret will not verify it.
 * POST /stripe/connect/webhook
 */
export const stripeConnectWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      config.stripe.connectWebhookSecret
    );
  } catch (err) {
    console.error("Connect webhook signature verification failed:", err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "account.updated") {
      const account = event.data.object;
      // Flip BOTH directions. Stripe re-requests KYC and can revoke the
      // transfers capability; a seller who silently lost it must stop being
      // routed sales rather than accruing unpayable payouts. (The pre-2026
      // implementation only ever set this true.)
      const complete = isOnboardingComplete(account);
      const result = await User.updateOne(
        { stripeAccountId: account.id },
        {
          stripeOnboardingComplete: complete,
          stripePayoutsEnabled: !!account.payouts_enabled,
          stripeAccountCurrency: account.default_currency?.toUpperCase(),
        }
      );
      if (result.matchedCount === 0) {
        console.warn(`[Stripe Connect] account.updated for unknown account ${account.id}`);
      }

      // Inherit Stripe's identity check as platform verification.
      //
      // Stripe runs full KYC/AML before it enables transfers, so an account that
      // reaches "transfers active with nothing outstanding" has already had its
      // identity verified more rigorously than an admin squinting at a phone
      // photo of a driving licence. Re-doing that by hand was pure duplicated
      // work and days of delay for the seller.
      //
      // `currently_due` must be empty too: Stripe can enable transfers while
      // still awaiting documents under a later deadline, and that is not a
      // finished check.
      const nothingOutstanding = (account.requirements?.currently_due?.length ?? 0) === 0;
      if (complete && nothingOutstanding) {
        const seller = await User.findOne({ stripeAccountId: account.id }).select("_id");
        if (seller) {
          await markVerified(seller._id, {
            source: "stripe_connect",
            notes: `Verified automatically via Stripe Connect account ${account.id}.`,
          });
        }
      }
    }
  } catch (error) {
    console.error("Connect webhook handling error:", error.message);
  }

  // Always 200 so Stripe stops retrying a delivered event.
  res.status(200).json({ received: true });
};

export default {
  createConnectAccount,
  getAccountLink,
  getAccountStatus,
  stripeConnectReturn,
  stripeConnectRefresh,
  stripeConnectWebhook,
};
