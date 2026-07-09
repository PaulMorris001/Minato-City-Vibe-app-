/**
 * Flutterwave controller.
 *
 * Mirrors the Stripe flow for African sellers: collect into the platform
 * balance, then pay the seller's local bank via the Transfers API (immediately
 * for guides/bookings, delay-released for tickets via the payout job).
 *
 * Onboarding is just a bank-account capture (account number + bank code resolved
 * to a holder name) — no hosted Connect flow exists for these markets.
 */

import { flwRequest } from "../config/flutterwave.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { fulfillGuide } from "../services/payments/fulfillment.js";

const PLATFORM_FEE_PERCENT = config.stripe.platformFeePercent; // shared platform fee

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Split an amount into platform fee + seller net (major currency units).
 */
export function computeSplit(amount) {
  const platformFee = round2(amount * (PLATFORM_FEE_PERCENT / 100));
  const sellerNet = round2(amount - platformFee);
  return { platformFee, sellerNet };
}

// ─── Onboarding (vendor bank capture) ────────────────────────────────────────

/**
 * List banks for a country so the vendor can pick theirs.
 * GET /flutterwave/banks?country=NG
 */
export const getBanks = async (req, res) => {
  try {
    const country = (req.query.country || "NG").toUpperCase();
    const result = await flwRequest(`/banks/${country}`);
    const banks = (result.data || []).map((b) => ({
      code: b.code,
      name: b.name,
    }));
    res.status(200).json({ banks });
  } catch (error) {
    console.error("Flutterwave getBanks error:", error.message);
    res.status(502).json({ message: "Couldn't load banks. Please try again." });
  }
};

/**
 * Resolve an account number + bank code to the holder's name so the vendor can
 * confirm before saving.
 * POST /flutterwave/connect/resolve  { accountNumber, bankCode }
 */
export const resolveAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ message: "accountNumber and bankCode are required" });
    }
    const result = await flwRequest("/accounts/resolve", {
      method: "POST",
      body: { account_number: accountNumber, account_bank: bankCode },
    });
    res.status(200).json({ accountName: result.data?.account_name || "" });
  } catch (error) {
    console.error("Flutterwave resolveAccount error:", error.message);
    res.status(400).json({ message: "Couldn't verify that account. Check the details and try again." });
  }
};

/**
 * Save the vendor's bank details and mark onboarding complete.
 * POST /flutterwave/connect/save  { accountNumber, bankCode, bankName, accountName }
 */
export const saveBank = async (req, res) => {
  try {
    const { accountNumber, bankCode, bankName, accountName } = req.body;
    if (!accountNumber || !bankCode || !accountName) {
      return res.status(400).json({ message: "Bank details are incomplete" });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        flutterwaveBank: { accountNumber, bankCode, bankName: bankName || "", accountName },
        flutterwaveOnboardingComplete: true,
      },
      { new: true }
    ).select("flutterwaveBank flutterwaveOnboardingComplete");

    res.status(200).json({
      onboardingComplete: true,
      bank: user.flutterwaveBank,
    });
  } catch (error) {
    console.error("Flutterwave saveBank error:", error.message);
    res.status(500).json({ message: "Failed to save bank details" });
  }
};

/**
 * Onboarding status (shape mirrors /stripe/connect/status).
 * GET /flutterwave/connect/status
 */
export const getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "flutterwaveBank flutterwaveOnboardingComplete"
    );
    const complete = !!user?.flutterwaveOnboardingComplete;
    res.status(200).json({
      connected: complete,
      onboardingComplete: complete,
      chargesEnabled: complete,
      payoutsEnabled: complete,
      bank: user?.flutterwaveBank || null,
    });
  } catch (error) {
    console.error("Flutterwave getStatus error:", error.message);
    res.status(500).json({ message: "Failed to fetch status" });
  }
};

// ─── Collection helpers (called by the payments dispatcher) ──────────────────

/** Redirect target Flutterwave sends the browser to after checkout. The mobile
 * app intercepts this URL prefix to read the transaction result. */
export function flutterwaveReturnUrl() {
  return `${config.stripe.serverUrl}/api/payments/flutterwave/return`;
}

/**
 * Create a Flutterwave Standard hosted-checkout link for a purchase. The mobile
 * app opens the returned link in a web browser session and reads the result
 * from the redirect — no native SDK needed.
 *
 * @param {object} args
 * @param {"ticket"|"guide"|"booking"} args.type
 * @param {string} args.id          item id (event / guide / booking)
 * @param {number} args.amount      gross amount in major units
 * @param {string} args.currency
 * @param {object} args.buyer       { _id, email, username }
 * @returns {Promise<{ provider, paymentLink, txRef, redirectUrl }>}
 */
export async function buildFlutterwaveInit({ type, id, amount, currency, buyer }) {
  const txRef = `cv_${type}_${id}_${buyer._id}_${Date.now()}`;
  const redirectUrl = flutterwaveReturnUrl();

  const result = await flwRequest("/payments", {
    method: "POST",
    body: {
      tx_ref: txRef,
      amount,
      currency: (currency || "NGN").toUpperCase(),
      redirect_url: redirectUrl,
      customer: {
        email: buyer.email || `${buyer._id}@cityvibe.app`,
        name: buyer.username || "OurCityvibe User",
      },
      customizations: { title: "OurCityvibe" },
      meta: { type, id: id.toString(), buyerId: buyer._id.toString() },
    },
  });

  return {
    provider: "flutterwave",
    paymentLink: result.data?.link,
    txRef,
    redirectUrl,
  };
}

/**
 * Tiny page Flutterwave redirects to after checkout. The app already has the
 * result by intercepting the URL, so this is just a graceful fallback if the
 * browser actually loads it.
 */
export const flutterwaveReturn = async (req, res) => {
  res
    .status(200)
    .send(
      "<html><body style='font-family:sans-serif;text-align:center;padding-top:40px'>" +
        "<h3>Payment complete</h3><p>You can return to the OurCityvibe app.</p></body></html>"
    );
};

/**
 * Verify a Flutterwave transaction succeeded and matches the expected charge.
 * @param {object} args
 * @param {string|number} args.transactionId  FLW transaction id (from the SDK)
 * @param {number} args.expectedAmount        major units
 * @param {string} args.expectedCurrency
 * @returns {Promise<{ id: string, txRef: string, amount: number, currency: string }>}
 * @throws if the payment is not successful or doesn't match
 */
export async function verifyFlutterwaveCharge({ transactionId, expectedAmount, expectedCurrency }) {
  const result = await flwRequest(`/transactions/${transactionId}/verify`);
  const data = result.data || {};

  if (data.status !== "successful") {
    const err = new Error("Payment was not successful");
    err.statusCode = 400;
    throw err;
  }
  if ((data.currency || "").toUpperCase() !== (expectedCurrency || "").toUpperCase()) {
    const err = new Error("Payment currency mismatch");
    err.statusCode = 400;
    throw err;
  }
  // Flutterwave may collect slightly more (FX rounding); never less.
  if (Number(data.amount) < Number(expectedAmount)) {
    const err = new Error("Payment amount mismatch");
    err.statusCode = 400;
    throw err;
  }

  return {
    id: String(data.id),
    txRef: data.tx_ref,
    amount: Number(data.amount),
    currency: (data.currency || "").toUpperCase(),
  };
}

/**
 * Transfer a seller's share to their saved bank.
 * @param {object} args
 * @param {object} args.bank      user.flutterwaveBank
 * @param {number} args.amount    major units
 * @param {string} args.currency
 * @param {string} args.reference idempotent reference
 * @param {string} [args.narration]
 * @returns {Promise<{ id: string, status: string }>}
 */
export async function createFlutterwaveTransfer({ bank, amount, currency, reference, narration }) {
  const result = await flwRequest("/transfers", {
    method: "POST",
    body: {
      account_bank: bank.bankCode,
      account_number: bank.accountNumber,
      amount,
      currency: (currency || "NGN").toUpperCase(),
      narration: narration || "OurCityvibe payout",
      reference,
      debit_currency: (currency || "NGN").toUpperCase(),
    },
  });
  return { id: String(result.data?.id || ""), status: result.data?.status || "" };
}

/**
 * Refund a Flutterwave transaction.
 */
export async function refundFlutterwaveCharge({ transactionId, amount }) {
  const result = await flwRequest(`/transactions/${transactionId}/refund`, {
    method: "POST",
    body: amount ? { amount } : {},
  });
  return { id: String(result.data?.id || ""), status: result.data?.status || "" };
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Flutterwave webhook — acts as a fallback fulfillment path if the app's confirm
 * call never lands. Auth is a shared secret hash in the `verif-hash` header
 * (JSON body, no raw-body signature like Stripe).
 * POST /flutterwave/webhook
 */
export const flutterwaveWebhook = async (req, res) => {
  const signature = req.headers["verif-hash"];
  if (!signature || signature !== config.flutterwave.secretHash) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  try {
    const payload = req.body;
    const data = payload?.data || {};

    if (payload?.event === "charge.completed" && data.status === "successful") {
      const meta = data.meta || {};
      // Only guides are safe to fully fulfill from the webhook alone (tickets and
      // bookings need fee/amount accounting verified against the item, which the
      // confirm endpoint handles; the webhook is a backstop for guides).
      if (meta.type === "guide" && meta.id && meta.buyerId) {
        await fulfillGuide({ guideId: meta.id, userId: meta.buyerId });
      }
    }
  } catch (error) {
    console.error("Flutterwave webhook fulfillment error:", error.message);
  }

  // Always 200 so Flutterwave stops retrying a delivered event.
  res.status(200).json({ received: true });
};

export default {
  computeSplit,
  getBanks,
  resolveAccount,
  saveBank,
  getStatus,
  buildFlutterwaveInit,
  flutterwaveReturn,
  verifyFlutterwaveCharge,
  createFlutterwaveTransfer,
  refundFlutterwaveCharge,
  flutterwaveWebhook,
};
