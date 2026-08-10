/**
 * Payout service — the admin-approval gate.
 *
 * Every paid sale collects into the platform balance and creates a Payout
 * record (status "awaiting_approval") instead of transferring money. An admin
 * approves, and only then does `executePayout` run the real provider transfer:
 * Stripe Connect for Stripe-collected (USD) sellers, Paystack for Nigerian
 * sellers. No vendor money leaves the platform without an explicit approval.
 */

import config from "../../config/env.js";
import stripe from "../../config/stripe.js";
import Payout from "../../models/payout.model.js";
import User from "../../models/user.model.js";
import Event from "../../models/event.model.js";
import Ticket from "../../models/ticket.model.js";
import { Booking } from "../../models/booking.model.js";
import { Order } from "../../models/order.model.js";
import { notifyUser } from "../notification.service.js";
import {
  createPaystackTransfer,
  getPaystackBalance,
} from "../../controllers/paystack.controller.js";
import { PAYOUT_ROUTING_FIELDS } from "./resolveProvider.js";

/**
 * Stripe Connect was reinstated as a settlement rail on this date. Payout docs
 * with provider "stripe" created BEFORE it are from the pre-2026 era, when the
 * rail stored CENTS in `amount` — executing one would transfer 100× the
 * intended sum. Delete this guard once those docs are gone.
 */
const CONNECT_REINSTATED_AT = new Date("2026-08-01T00:00:00Z");

/**
 * Create (or return the existing) pending payout for a sale. Idempotent on
 * `reference` so a retried confirm / re-run job never double-pays.
 *
 * @param {object} args
 * @param {string} args.vendor        seller user id
 * @param {"ticket"|"guide"|"booking"} args.relatedType
 * @param {string} args.relatedId     event (for tickets) / guide / booking id
 * @param {"paystack"|"stripe"} args.provider  settlement rail
 * @param {number} args.amount        seller net in MAJOR units (USD for stripe,
 *                                    local currency for paystack)
 * @param {string} args.currency      settlement currency
 * @param {string} args.reference     idempotency key + provider transfer ref
 * @param {string} [args.buyer]
 * @param {string} [args.stripePaymentIntentId]  collection audit trail
 * @returns {Promise<object>} the Payout doc
 */
export async function createPayout({
  vendor,
  relatedType,
  relatedId,
  provider,
  amount,
  currency,
  reference,
  buyer,
  stripePaymentIntentId,
}) {
  const cur = (currency || "").toUpperCase();
  let payout;
  try {
    payout = await Payout.create({
      vendor,
      relatedType,
      relatedId,
      provider,
      amount,
      currency: cur,
      displayAmount: amount, // both live rails store major units
      displayCurrency: cur,
      reference,
      buyer,
      stripePaymentIntentId,
      status: "awaiting_approval",
    });
  } catch (e) {
    // Duplicate reference — the payout already exists; return it (idempotent).
    // Deliberately no notification on this path: a confirm racing a webhook, or
    // a re-run of the release job, must not tell the seller twice.
    if (e?.code === 11000) return Payout.findOne({ reference });
    throw e;
  }

  const ITEM_LABEL = {
    ticket: "ticket sales",
    guide: "a guide sale",
    booking: "a booking",
    order: "an order",
  };
  await notifyUser(vendor, {
    type: "payout_queued",
    title: "💰 You've got earnings on the way",
    body:
      `${payoutLabel(payout)} from ${ITEM_LABEL[relatedType] || "a sale"} is queued for ` +
      `release. We'll let you know the moment it's sent.`,
    data: { payoutId: String(payout._id), relatedType, relatedId: String(relatedId) },
  });

  return payout;
}

/**
 * Run the real provider transfer for an approved payout. Centralizes the money
 * movement for both rails so the admin endpoint stays thin. Transitions the
 * payout through processing → paid (or failed) and settles the related records.
 *
 * @param {string} payoutId
 * @param {object} [opts]
 * @param {string} [opts.approvedBy]  admin user id
 * @returns {Promise<object>} the updated Payout doc
 */
export async function executePayout(payoutId, { approvedBy } = {}) {
  const payout = await Payout.findById(payoutId);
  if (!payout) throw new Error("Payout not found");
  if (payout.status === "paid") return payout; // already settled — idempotent
  if (!["awaiting_approval", "failed"].includes(payout.status)) {
    throw new Error(`Payout is "${payout.status}" and can't be executed`);
  }

  payout.status = "processing";
  if (approvedBy) {
    payout.approvedBy = approvedBy;
    payout.approvedAt = new Date();
  }
  payout.error = undefined;
  await payout.save();

  try {
    const vendor = await User.findById(payout.vendor).select(
      `${PAYOUT_ROUTING_FIELDS} paystackBank fcmToken username`
    );
    const transferId = await runTransfer(payout, vendor);

    payout.transferId = transferId;
    payout.status = "paid";
    await payout.save();

    await markRelatedSettled(payout, transferId);
    await notifyVendorPaid(payout);
    return payout;
  } catch (err) {
    payout.status = "failed";
    payout.error = String(err?.message ?? err);
    await payout.save();

    // Tell the vendor something went wrong, but never the raw provider message —
    // "Stripe available USD balance 3.10 < payout 45.00" is an operational
    // detail about the platform, not something a seller should read. The full
    // error stays on payout.error for admins.
    await notifyUser(payout.vendor, {
      type: "payout_failed",
      title: "There was a problem with your payout",
      body:
        `We couldn't send your payout (${payoutLabel(payout)}) just yet. ` +
        `Our team has been alerted and will sort it out — your money is safe.`,
      data: { payoutId: String(payout._id) },
    });

    throw err;
  }
}

/** Provider-specific transfer. Returns the provider transfer id. */
async function runTransfer(payout, vendor) {
  if (payout.provider === "paystack") {
    if (!vendor?.paystackRecipientCode) throw new Error("Vendor has no Paystack payout account");
    const balance = await getPaystackBalance(payout.currency);
    if (balance < payout.amount) {
      throw new Error(
        `Paystack balance ${balance} ${payout.currency} < payout ${payout.amount} — top up the Paystack balance`
      );
    }
    const t = await createPaystackTransfer({
      recipientCode: vendor.paystackRecipientCode,
      amount: payout.amount, // major units
      currency: payout.currency,
      reference: payout.reference,
      reason: "OurCityvibe payout",
    });
    return t.id;
  }

  if (payout.provider === "stripe") {
    // Pre-2026 "stripe" docs stored CENTS in `amount` — running one through the
    // conversion below would transfer 100× the intended sum. Reject rather than
    // guess; an admin can reject the doc by hand.
    if (payout.createdAt && payout.createdAt < CONNECT_REINSTATED_AT) {
      throw new Error(
        `Payout ${payout._id} predates the Stripe Connect rail and may be denominated ` +
          `in cents — reject it rather than executing`
      );
    }
    if (!vendor?.stripeAccountId) throw new Error("Vendor has no Stripe Connect account");
    if (!vendor?.stripeOnboardingComplete) {
      throw new Error("Vendor's Stripe Connect onboarding is not complete");
    }

    // payout.amount is major USD (see payout.model.js); the Transfers API takes
    // cents. Round at the boundary — the cents→major→cents round trip through
    // ticketPayoutAmount is float-lossy.
    const amountCents = Math.round(payout.amount * 100);

    // Preflight the platform balance BEFORE calling Stripe, so an underfunded
    // payout never burns the idempotency key below (Stripe caches errors under a
    // key for 24h, which would make the admin's later retry replay the failure).
    const balance = await stripe.balance.retrieve();
    const availableCents = balance.available.find((b) => b.currency === "usd")?.amount ?? 0;
    if (availableCents < amountCents) {
      const pendingCents = balance.pending.find((b) => b.currency === "usd")?.amount ?? 0;
      throw new Error(
        `Stripe available USD balance ${(availableCents / 100).toFixed(2)} < payout ` +
          `${payout.amount} (${(pendingCents / 100).toFixed(2)} still pending) — ` +
          `wait for the charges to clear, then re-approve`
      );
    }

    // Separate charges and transfers: draw from the platform's available USD
    // balance rather than source_transaction, which takes a single charge id and
    // so can't express a ticket payout (the release job batches many charges
    // into one Payout). Always transfer USD — the currency the charge landed in.
    // Naming the vendor's local currency would fail with balance_insufficient;
    // Stripe converts at payout time and takes the 0.25% cross-border fee.
    const t = await stripe.transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination: vendor.stripeAccountId,
        // Ticket collection PIs already carry transfer_group `event_<id>`, so
        // tagging the transfer the same way makes the charges and the payout
        // reconcilable in the Stripe dashboard.
        ...(payout.relatedType === "ticket"
          ? { transfer_group: `event_${payout.relatedId}` }
          : {}),
        metadata: {
          payoutId: String(payout._id),
          vendorId: String(payout.vendor),
          relatedType: payout.relatedType,
          relatedId: String(payout.relatedId),
          reference: payout.reference,
        },
      },
      // Guards against a double-approve paying twice.
      { idempotencyKey: `payout_${payout._id}` }
    );
    return t.id;
  }

  // "wise" and "flutterwave" are dead rails. Their docs remain readable so an
  // admin can reject them, but there is no way to move money on them — the
  // migration script remaps any that are still owed onto a live rail.
  throw new Error(`Payout provider "${payout.provider}" is a legacy rail and can't be executed`);
}

/** Mark the originating record(s) settled once the transfer succeeds. */
async function markRelatedSettled(payout, transferId) {
  if (payout.relatedType === "ticket") {
    // relatedId is the event — settle every unsettled, non-refunded ticket.
    await Ticket.updateMany(
      { event: payout.relatedId, isValid: true, refunded: { $ne: true }, transferred: { $ne: true } },
      { transferred: true, transferId }
    );
    await Event.updateOne(
      { _id: payout.relatedId },
      {
        payoutStatus: "released",
        payoutReleasedAt: new Date(),
        payoutError: null,
        $push: { payoutTransferIds: transferId },
      }
    );
  } else if (payout.relatedType === "booking") {
    await Booking.updateOne({ _id: payout.relatedId }, { transferRef: transferId });
  } else if (payout.relatedType === "order") {
    await Order.updateOne({ _id: payout.relatedId }, { transferRef: transferId });
  }
  // guide: the purchase is already recorded on the guide; nothing else to mark.
}

/** Human-readable payout amount, e.g. "USD 45.00". */
function payoutLabel(payout) {
  const currency = payout.displayCurrency || payout.currency;
  const amount = Number(payout.displayAmount ?? payout.amount);
  return `${currency} ${amount.toFixed(2)}`;
}

/**
 * Notify the vendor their payout went out.
 *
 * No fcmToken early-return: that used to skip the in-app record too, so a vendor
 * without push permission had no way at all to learn they'd been paid. notifyUser
 * writes the durable notification regardless and treats push as best-effort.
 */
async function notifyVendorPaid(payout) {
  await notifyUser(payout.vendor, {
    type: "payout_paid",
    title: "💸 Payout sent",
    body: `Your payout (${payoutLabel(payout)}) is on its way to your account.`,
    data: { payoutId: String(payout._id) },
  });
}

export default { createPayout, executePayout };
