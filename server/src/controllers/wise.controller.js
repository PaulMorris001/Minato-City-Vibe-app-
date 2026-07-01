/**
 * Wise controller.
 *
 * Vendor onboarding for the Wise settlement rail (international vendors that
 * collect via Stripe but are paid out through Wise). Onboarding creates a Wise
 * recipient account from country-specific bank fields; the webhook reconciles
 * payout state. Shapes mirror the Flutterwave controller so the mobile client
 * can treat all three rails uniformly.
 */

import crypto from "crypto";
import config from "../config/env.js";
import User from "../models/user.model.js";
import Ticket from "../models/ticket.model.js";
import Event from "../models/event.model.js";
import { Booking } from "../models/booking.model.js";
import Payout from "../models/payout.model.js";
import {
  getWiseAccountRequirements,
  createWiseRecipient,
} from "../services/payments/wise.js";

// ─── Onboarding ──────────────────────────────────────────────────────────────

/**
 * Dynamic bank-detail fields Wise needs for a currency, so the app can render
 * the right form (IBAN for EU, sort code for UK, etc.).
 * GET /wise/account-requirements?currency=GBP
 */
export const getRequirements = async (req, res) => {
  try {
    const currency = (req.query.currency || "").toUpperCase();
    if (!currency) return res.status(400).json({ message: "currency is required" });
    const requirements = await getWiseAccountRequirements({ targetCurrency: currency });
    res.status(200).json({ requirements });
  } catch (error) {
    console.error("Wise getRequirements error:", error.message);
    res.status(502).json({ message: "Couldn't load payout requirements. Please try again." });
  }
};

/**
 * Create the vendor's Wise recipient account and mark onboarding complete.
 * POST /wise/connect/save  { accountHolderName, currency, type, details }
 */
export const saveRecipient = async (req, res) => {
  try {
    const { accountHolderName, currency, type, details } = req.body;
    if (!accountHolderName || !currency || !type || !details) {
      return res.status(400).json({ message: "Payout details are incomplete" });
    }

    const recipient = await createWiseRecipient({ accountHolderName, currency, type, details });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        wiseRecipientId: recipient.id,
        wiseRecipientCurrency: recipient.currency,
        wiseOnboardingComplete: true,
      },
      { new: true }
    ).select("wiseRecipientId wiseRecipientCurrency wiseOnboardingComplete");

    res.status(200).json({
      onboardingComplete: true,
      recipientId: user.wiseRecipientId,
      currency: user.wiseRecipientCurrency,
    });
  } catch (error) {
    console.error("Wise saveRecipient error:", error.message);
    res.status(400).json({ message: "Couldn't save those payout details. Check them and try again." });
  }
};

/**
 * Onboarding status (shape mirrors /flutterwave/connect/status).
 * GET /wise/connect/status
 */
export const getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "wiseRecipientId wiseRecipientCurrency wiseOnboardingComplete"
    );
    const complete = !!user?.wiseOnboardingComplete;
    res.status(200).json({
      connected: complete,
      onboardingComplete: complete,
      chargesEnabled: complete,
      payoutsEnabled: complete,
      currency: user?.wiseRecipientCurrency || null,
    });
  } catch (error) {
    console.error("Wise getStatus error:", error.message);
    res.status(500).json({ message: "Failed to fetch status" });
  }
};

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Verify a Wise webhook signature (RSA-SHA256 over the raw body, base64 in the
 * `X-Signature-SHA256` header). Requires the raw body — this route is mounted
 * with express.raw in index.js.
 */
function verifyWiseSignature(rawBody, signature) {
  if (!config.wise.webhookPublicKey) {
    // No key configured (e.g. local/sandbox) — can't verify. Accept but warn.
    console.warn("Wise webhook received but WISE_WEBHOOK_PUBLIC_KEY is not set — skipping verification");
    return true;
  }
  if (!signature) return false;
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(config.wise.webhookPublicKey, signature, "base64");
  } catch (e) {
    console.error("Wise signature verification error:", e.message);
    return false;
  }
}

/**
 * Wise webhook — reconciles payout state. Failures flip the originating record
 * back to a retryable state so the payout job (tickets) or a manual retry can
 * re-attempt; successful sends are logged (records are optimistically marked at
 * payout time). Correlated by the stored Wise transfer id.
 * POST /wise/webhook
 */
export const wiseWebhook = async (req, res) => {
  const raw = req.body; // Buffer (express.raw)
  const signature = req.headers["x-signature-sha256"] || req.headers["x-signature"];
  if (!verifyWiseSignature(raw, signature)) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid payload" });
  }

  try {
    const eventType = payload?.event_type;
    const data = payload?.data || {};
    const transferId = String(data?.resource?.id || "");
    const state = data?.current_state || data?.state;

    if (transferId && eventType === "transfers#state-change") {
      const payout = await Payout.findOne({ transferId });
      const failedStates = ["bounced_back", "funds_refunded", "charged_back", "cancelled"];

      if (payout && failedStates.includes(state)) {
        // The transfer was reversed after we sent it — reopen the payout for an
        // admin to re-approve, and reverse the optimistic record updates.
        payout.status = "failed";
        payout.error = `Wise transfer ${transferId} ${state}`;
        await payout.save();

        if (payout.relatedType === "ticket") {
          await Ticket.updateMany({ event: payout.relatedId, transferId }, { transferred: false });
          await Event.updateOne(
            { _id: payout.relatedId },
            { payoutStatus: "failed", payoutError: `Wise transfer ${transferId} ${state}` }
          );
        } else if (payout.relatedType === "booking") {
          await Booking.updateOne({ _id: payout.relatedId }, { $unset: { transferRef: "" } });
        }
        console.warn(`[Wise] Transfer ${transferId} ${state} — payout ${payout._id} reopened`);
      } else if (state === "outgoing_payment_sent") {
        console.log(`[Wise] Transfer ${transferId} delivered`);
      }
    }
  } catch (error) {
    console.error("Wise webhook handling error:", error.message);
  }

  // Always 200 so Wise stops retrying a delivered event.
  res.status(200).json({ received: true });
};

export default { getRequirements, saveRecipient, getStatus, wiseWebhook };
