/**
 * Payout service — the admin-approval gate.
 *
 * Every paid sale collects into the platform balance and creates a Payout
 * record (status "awaiting_approval") instead of transferring money. An admin
 * approves, and only then does `executePayout` run the real provider transfer:
 * Wise for Stripe-collected (USD) sellers, Paystack for Nigerian sellers.
 * No vendor money leaves the platform without an explicit approval.
 */

import config from "../../config/env.js";
import Payout from "../../models/payout.model.js";
import User from "../../models/user.model.js";
import Event from "../../models/event.model.js";
import Ticket from "../../models/ticket.model.js";
import { Booking } from "../../models/booking.model.js";
import { Order } from "../../models/order.model.js";
import { sendPushNotification } from "../notification.service.js";
import {
  createPaystackTransfer,
  getPaystackBalance,
} from "../../controllers/paystack.controller.js";
import { createWiseTransfer, getWiseBalance } from "./wise.js";

/**
 * Create (or return the existing) pending payout for a sale. Idempotent on
 * `reference` so a retried confirm / re-run job never double-pays.
 *
 * @param {object} args
 * @param {string} args.vendor        seller user id
 * @param {"ticket"|"guide"|"booking"} args.relatedType
 * @param {string} args.relatedId     event (for tickets) / guide / booking id
 * @param {"wise"|"paystack"} args.provider  settlement rail
 * @param {number} args.amount        seller net in MAJOR units (USD for wise,
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
  try {
    return await Payout.create({
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
    if (e?.code === 11000) return Payout.findOne({ reference });
    throw e;
  }
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
      "paystackRecipientCode paystackBank wiseRecipientId wiseRecipientCurrency fcmToken username"
    );
    const transferId = await runTransfer(payout, vendor);

    payout.transferId = transferId;
    payout.status = "paid";
    await payout.save();

    await markRelatedSettled(payout, transferId);
    await notifyVendorPaid(payout, vendor);
    return payout;
  } catch (err) {
    payout.status = "failed";
    payout.error = String(err?.message ?? err);
    await payout.save();
    throw err;
  }
}

/** Provider-specific transfer. Returns the provider transfer id. */
async function runTransfer(payout, vendor) {
  if (payout.provider === "wise") {
    if (!vendor?.wiseRecipientId) throw new Error("Vendor has no Wise payout account");
    const amountUsd = payout.amount; // major USD
    const balance = await getWiseBalance();
    if (balance < amountUsd) {
      throw new Error(
        `Wise balance ${balance} ${config.wise.sourceCurrency} < payout ${amountUsd} — top up the Wise balance`
      );
    }
    const t = await createWiseTransfer({
      recipientId: vendor.wiseRecipientId,
      sourceAmount: amountUsd,
      targetCurrency: vendor.wiseRecipientCurrency || config.wise.sourceCurrency,
      reference: payout.reference,
    });
    return t.id;
  }

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

  // "stripe" / "flutterwave" docs predate the Wise+Paystack remap and their
  // rails no longer exist here.
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

/** Notify the vendor their payout went out. */
async function notifyVendorPaid(payout, vendor) {
  if (!vendor?.fcmToken) return;
  const label = `${payout.displayCurrency} ${Number(payout.displayAmount).toFixed(2)}`;
  await sendPushNotification(
    vendor.fcmToken,
    "💸 Payout sent",
    `Your payout (${label}) is on its way to your account.`,
    { type: "payout_released", payoutId: String(payout._id) }
  );
}

export default { createPayout, executePayout };
