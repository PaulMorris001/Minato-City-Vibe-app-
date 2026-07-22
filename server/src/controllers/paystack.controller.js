/**
 * Paystack controller.
 *
 * The Naira rail: Nigerian sellers collect NGN through Paystack hosted checkout
 * into the platform balance, and their approved payouts go out through the
 * Paystack Transfers API (immediately for guides/bookings, delay-released for
 * tickets via the payout job — both behind the admin approval queue).
 *
 * Onboarding is a bank-account capture (account number + bank code resolved to
 * a holder name, then registered as a Paystack transfer recipient) — no hosted
 * Connect flow exists for this market.
 *
 * Unit convention: Paystack's API speaks SUBUNITS (kobo). Everything in this
 * codebase outside the actual API calls uses MAJOR units (whole NGN), so the
 * kobo conversion happens exactly once, at the API boundary in this file.
 */

import crypto from "crypto";
import { paystackRequest } from "../config/paystack.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Event from "../models/event.model.js";
import Ticket from "../models/ticket.model.js";
import Payout from "../models/payout.model.js";
import { Booking } from "../models/booking.model.js";
import { fulfillGuide } from "../services/payments/fulfillment.js";

const toKobo = (major) => Math.round(Number(major) * 100);
const toMajor = (kobo) => Number(kobo) / 100;

// ─── Onboarding (vendor bank capture) ────────────────────────────────────────

// Paystack's banks endpoint wants the full lowercase country name; the mobile
// app sends ISO codes, so translate. Launch scope is Nigeria only.
const BANK_COUNTRY_NAMES = {
  NG: "nigeria",
  GH: "ghana",
  KE: "kenya",
  ZA: "south africa",
};

/**
 * List banks for a country so the vendor can pick theirs.
 * GET /paystack/banks?country=NG
 */
export const getBanks = async (req, res) => {
  try {
    const iso = (req.query.country || "NG").toUpperCase();
    const country = BANK_COUNTRY_NAMES[iso] || "nigeria";
    const result = await paystackRequest("/bank", {
      query: { country, currency: "NGN", perPage: 100 },
    });
    const banks = (result.data || []).map((b) => ({
      code: b.code,
      name: b.name,
    }));
    res.status(200).json({ banks });
  } catch (error) {
    console.error("Paystack getBanks error:", error.message);
    res.status(502).json({ message: "Couldn't load banks. Please try again." });
  }
};

/**
 * Resolve an account number + bank code to the holder's name so the vendor can
 * confirm before saving.
 * POST /paystack/connect/resolve  { accountNumber, bankCode }
 */
export const resolveAccount = async (req, res) => {
  try {
    const { accountNumber, bankCode } = req.body;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ message: "accountNumber and bankCode are required" });
    }
    const result = await paystackRequest("/bank/resolve", {
      query: { account_number: accountNumber, bank_code: bankCode },
    });
    res.status(200).json({ accountName: result.data?.account_name || "" });
  } catch (error) {
    console.error("Paystack resolveAccount error:", error.message);
    res.status(400).json({ message: "Couldn't verify that account. Check the details and try again." });
  }
};

/**
 * Register the vendor's bank as a Paystack transfer recipient and mark
 * onboarding complete. The recipient_code is what payouts are sent to.
 * POST /paystack/connect/save  { accountNumber, bankCode, bankName, accountName }
 */
export const saveBank = async (req, res) => {
  try {
    const { accountNumber, bankCode, bankName, accountName } = req.body;
    if (!accountNumber || !bankCode || !accountName) {
      return res.status(400).json({ message: "Bank details are incomplete" });
    }

    const result = await paystackRequest("/transferrecipient", {
      method: "POST",
      body: {
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      },
    });
    const recipientCode = result.data?.recipient_code;
    if (!recipientCode) throw new Error("Paystack did not return a recipient code");

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        paystackBank: { accountNumber, bankCode, bankName: bankName || "", accountName },
        paystackRecipientCode: recipientCode,
        paystackOnboardingComplete: true,
      },
      { new: true }
    ).select("paystackBank paystackOnboardingComplete");

    res.status(200).json({
      onboardingComplete: true,
      bank: user.paystackBank,
    });
  } catch (error) {
    console.error("Paystack saveBank error:", error.message);
    res.status(500).json({ message: "Failed to save bank details" });
  }
};

/**
 * Onboarding status (shape mirrors /wise/connect/status).
 * GET /paystack/connect/status
 */
export const getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "paystackBank paystackOnboardingComplete"
    );
    const complete = !!user?.paystackOnboardingComplete;
    res.status(200).json({
      connected: complete,
      onboardingComplete: complete,
      chargesEnabled: complete,
      payoutsEnabled: complete,
      bank: user?.paystackBank || null,
    });
  } catch (error) {
    console.error("Paystack getStatus error:", error.message);
    res.status(500).json({ message: "Failed to fetch status" });
  }
};

// ─── Collection helpers (called by the payments dispatcher) ──────────────────

/** Deep link the return page below drives the browser to. Matches the app
 * scheme in mobile/app.config.js ("mobile") — openAuthSessionAsync watches
 * this prefix and dismisses the browser the moment it sees the URL. */
const APP_RETURN_URL = "mobile://payments/paystack-return";

/** Page Paystack redirects the browser to after checkout. Must be a real,
 * reachable http(s) URL (Paystack rejects custom schemes as callback_url),
 * so it points at this server, which then forwards to APP_RETURN_URL. */
export function paystackReturnUrl() {
  return `${config.stripe.serverUrl}/api/payments/paystack/return`;
}

/**
 * Create a Paystack hosted-checkout link for a purchase. The mobile app opens
 * the returned link in a web browser session and reads the reference from the
 * redirect — no native SDK needed.
 *
 * @param {object} args
 * @param {"ticket"|"guide"|"booking"} args.type
 * @param {string} args.id          item id (event / guide / booking)
 * @param {number} args.amount      gross amount in major units
 * @param {string} args.currency
 * @param {object} args.buyer       { _id, email, username }
 * @returns {Promise<{ provider, paymentLink, reference, redirectUrl }>}
 */
export async function buildPaystackInit({ type, id, amount, currency, buyer }) {
  // Paystack transaction references only allow alphanumerics plus -.= so this
  // uses hyphens (unlike the underscore payout references, which are fine).
  const reference = `cv-${type}-${id}-${buyer._id}-${Date.now()}`;

  const result = await paystackRequest("/transaction/initialize", {
    method: "POST",
    body: {
      reference,
      amount: toKobo(amount),
      currency: (currency || "NGN").toUpperCase(),
      email: buyer.email || `${buyer._id}@cityvibe.app`,
      callback_url: paystackReturnUrl(),
      metadata: { type, id: id.toString(), buyerId: buyer._id.toString() },
    },
  });

  return {
    provider: "paystack",
    paymentLink: result.data?.authorization_url,
    reference,
    // Lets a web client resume THIS server-initialized transaction with Paystack
    // Inline (`popup.resumeTransaction(accessCode)`) instead of following the
    // hosted redirect — so the amount/reference/callback all stay server-set.
    // Ignored by the mobile app, which watches the browser redirect instead.
    accessCode: result.data?.access_code,
    // What the app's browser session watches for. The return page forwards
    // the browser (and Paystack's ?trxref=&reference= params) to this scheme
    // URL — an http(s) redirectUrl would never dismiss the session on iOS
    // (see the Google web-auth return flow in auth.controller.js).
    redirectUrl: APP_RETURN_URL,
  };
}

/**
 * Page Paystack redirects to after checkout. Forwards the browser — with
 * Paystack's ?trxref=&reference= query params — to the app's custom scheme so
 * openAuthSessionAsync dismisses and hands the URL to the app. Custom-scheme
 * 302s are unreliable across browsers, so meta-refresh + JS + a visible link
 * covers every case (same pattern as the Google auth return page).
 */
export const paystackReturn = async (req, res) => {
  const qs = Object.entries(req.query || {})
    .filter(([, v]) => typeof v === "string" && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${APP_RETURN_URL}${qs ? `?${qs}` : ""}`;
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
    <p>Payment complete — returning to OurCityvibe…</p>
    <p><a href="${safe}">Tap here if OurCityvibe doesn't reopen automatically.</a></p>
  </div>
  <script>setTimeout(function(){ window.location.replace("${safe}"); }, 50);</script>
</body></html>`);
};

/**
 * Verify a Paystack transaction succeeded and matches the expected charge.
 * @param {object} args
 * @param {string} args.reference          our transaction reference (from init)
 * @param {number} args.expectedAmount     major units
 * @param {string} args.expectedCurrency
 * @param {string} [args.expectedBuyerId]  buyer id baked into the init metadata
 * @returns {Promise<{ reference: string, amount: number, currency: string }>} amount in major units
 * @throws if the payment is not successful or doesn't match
 */
export async function verifyPaystackCharge({
  reference,
  expectedAmount,
  expectedCurrency,
  expectedBuyerId,
}) {
  const result = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  const data = result.data || {};

  if (data.status !== "success") {
    const err = new Error("Payment was not successful");
    err.statusCode = 400;
    throw err;
  }
  if ((data.currency || "").toUpperCase() !== (expectedCurrency || "").toUpperCase()) {
    const err = new Error("Payment currency mismatch");
    err.statusCode = 400;
    throw err;
  }
  // data.amount is in kobo. Paystack may collect slightly more; never less.
  if (Number(data.amount) < toKobo(expectedAmount)) {
    const err = new Error("Payment amount mismatch");
    err.statusCode = 400;
    throw err;
  }
  const paidBy = data.metadata?.buyerId;
  if (expectedBuyerId && paidBy && paidBy !== expectedBuyerId.toString()) {
    const err = new Error("Payment does not match this buyer");
    err.statusCode = 403;
    throw err;
  }

  return {
    reference: data.reference || reference,
    amount: toMajor(data.amount),
    currency: (data.currency || "").toUpperCase(),
  };
}

/**
 * Transfer a seller's share to their registered recipient.
 * @param {object} args
 * @param {string} args.recipientCode  user.paystackRecipientCode
 * @param {number} args.amount         major units
 * @param {string} args.currency
 * @param {string} args.reference      idempotent reference
 * @param {string} [args.reason]
 * @returns {Promise<{ id: string, status: string }>}
 */
export async function createPaystackTransfer({ recipientCode, amount, currency, reference, reason }) {
  const result = await paystackRequest("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: toKobo(amount),
      currency: (currency || "NGN").toUpperCase(),
      recipient: recipientCode,
      reference,
      reason: reason || "OurCityvibe payout",
    },
  });
  const status = result.data?.status || "";
  if (status === "otp") {
    // The dashboard's "Confirm transfers before sending" toggle is on — API
    // transfers stall waiting for an OTP we can't provide.
    throw new Error(
      "Paystack requires OTP confirmation for transfers — disable it in the Paystack dashboard (Preferences → Transfers)"
    );
  }
  if (!["success", "pending"].includes(status)) {
    throw new Error(`Paystack transfer not accepted (status: ${status || "unknown"})`);
  }
  return { id: String(result.data?.id || result.data?.transfer_code || ""), status };
}

/**
 * Available NGN balance (major units) the platform holds with Paystack. Used
 * by the treasury guard so a payout fails cleanly instead of throwing mid-flow.
 * @param {string} [currency="NGN"]
 * @returns {Promise<number>}
 */
export async function getPaystackBalance(currency = "NGN") {
  const result = await paystackRequest("/balance");
  const match = (result.data || []).find(
    (b) => (b.currency || "").toUpperCase() === currency.toUpperCase()
  );
  return toMajor(match?.balance || 0);
}

/**
 * Refund a Paystack transaction.
 * @param {object} args
 * @param {string} args.reference  transaction reference
 * @param {number} [args.amount]   partial refund in major units (full if omitted)
 */
export async function refundPaystackCharge({ reference, amount }) {
  const result = await paystackRequest("/refund", {
    method: "POST",
    body: {
      transaction: reference,
      ...(amount ? { amount: toKobo(amount) } : {}),
    },
  });
  return { id: String(result.data?.id || ""), status: result.data?.status || "" };
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Verify a Paystack webhook signature: HMAC-SHA512 of the raw body with the
 * secret key, hex-encoded in the `x-paystack-signature` header. Requires the
 * raw body — this route is mounted with express.raw in index.js.
 */
function verifyPaystackSignature(rawBody, signature) {
  if (!config.paystack.secretKey) {
    console.warn("Paystack webhook received but PAYSTACK_SECRET_KEY is not set — cannot verify");
    return false;
  }
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha512", config.paystack.secretKey)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Paystack webhook. Two jobs:
 *  - charge.success: fallback fulfillment if the app's confirm call never lands
 *    (guides only — tickets/bookings need the confirm endpoint's amount
 *    accounting, and the confirm path is idempotent anyway).
 *  - transfer.failed / transfer.reversed: a payout we optimistically marked
 *    paid bounced — reopen it for the admin and reverse the record updates
 *    (parallel to the Wise webhook's state-change handling).
 * POST /paystack/webhook
 */
export const paystackWebhook = async (req, res) => {
  const raw = req.body; // Buffer (express.raw)
  const signature = req.headers["x-paystack-signature"];

  // Always ACK with 200 so Paystack doesn't retry forever; only ACT on events
  // whose signature verifies.
  if (!verifyPaystackSignature(raw, signature)) {
    console.warn("[Paystack] webhook received without a valid signature — acked, not processed");
    return res.status(200).json({ received: true, processed: false });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(200).json({ received: true, processed: false });
  }

  try {
    const event = payload?.event;
    const data = payload?.data || {};

    if (event === "charge.success") {
      const meta = data.metadata || {};
      // Only guides are safe to fully fulfill from the webhook alone (tickets
      // and bookings need fee/amount accounting verified against the item,
      // which the confirm endpoint handles; the webhook is a guide backstop).
      if (meta.type === "guide" && meta.id && meta.buyerId) {
        await fulfillGuide({ guideId: meta.id, userId: meta.buyerId });
      }
    }

    if (event === "transfer.failed" || event === "transfer.reversed") {
      const payout = await Payout.findOne({ reference: data.reference });
      if (payout && payout.status === "paid") {
        payout.status = "failed";
        payout.error = `Paystack transfer ${data.reference} ${event.split(".")[1]}`;
        await payout.save();

        if (payout.relatedType === "ticket") {
          await Ticket.updateMany(
            { event: payout.relatedId, transferId: payout.transferId },
            { transferred: false }
          );
          await Event.updateOne(
            { _id: payout.relatedId },
            { payoutStatus: "failed", payoutError: payout.error }
          );
        } else if (payout.relatedType === "booking") {
          await Booking.updateOne({ _id: payout.relatedId }, { $unset: { transferRef: "" } });
        }
        console.warn(`[Paystack] Transfer ${data.reference} ${event} — payout ${payout._id} reopened`);
      }
    }
  } catch (error) {
    console.error("Paystack webhook handling error:", error.message);
  }

  // Always 200 so Paystack stops retrying a delivered event.
  res.status(200).json({ received: true });
};

export default {
  getBanks,
  resolveAccount,
  saveBank,
  getStatus,
  buildPaystackInit,
  paystackReturn,
  verifyPaystackCharge,
  createPaystackTransfer,
  getPaystackBalance,
  refundPaystackCharge,
  paystackWebhook,
};
