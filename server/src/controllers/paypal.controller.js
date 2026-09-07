/**
 * PayPal controller.
 *
 * The international rail: every seller outside Nigeria collects USD through
 * PayPal hosted approval into the platform balance, and their approved payouts
 * go out through the Payouts v1 API (immediately for guides/bookings,
 * delay-released for tickets via the payout job — both behind the admin
 * approval queue). It replaced Stripe on both sides in Sep 2026.
 *
 * There is no onboarding flow here, unlike Stripe Connect: a PayPal payout only
 * needs the seller's PayPal email address, captured in
 * paypalPayout.controller.js. That is the single biggest reason this rail is
 * smaller than the one it replaced.
 *
 * Unit convention: PayPal speaks MAJOR units as decimal strings, the same units
 * the rest of this codebase uses — so unlike the Stripe (cents) and Paystack
 * (kobo) paths there is no subunit conversion anywhere in this file.
 */

import { paypalRequest, toPaypalAmount } from "../config/paypal.js";
import config from "../config/env.js";

// Where the app's browser session is sent back to. Same custom-scheme handoff
// the Paystack rail uses — see paystackReturn for why the bounce page exists.
const APP_RETURN_URL = "mobile://payments/paypal-return";

/**
 * Return/cancel URL PayPal sends the browser to after approval. Points at this
 * server, which then forwards to APP_RETURN_URL.
 */
export function paypalReturnUrl({ web = false, cancelled = false } = {}) {
  const params = [web ? "web=1" : "", cancelled ? "cancelled=1" : ""].filter(Boolean).join("&");
  return `${config.stripe.serverUrl}/api/payments/paypal/return${params ? `?${params}` : ""}`;
}

/**
 * Create a PayPal order for a purchase. The mobile app opens the returned
 * approval link in a web browser session and confirms with the order id — no
 * native SDK needed, which is why this returns the same payload shape as
 * buildPaystackInit rather than something PayPal-specific.
 *
 * @param {object} args
 * @param {"ticket"|"ticket_batch"|"guide"|"booking"|"order"} args.type
 * @param {string} args.id          item id (event / guide / booking / order)
 * @param {number} args.amount      gross amount in major units
 * @param {string} args.currency
 * @param {object} args.buyer       { _id, email, username }
 * @param {object} [args.meta]      { tierId } — carried on custom_id
 * @param {string} [args.callbackUrl] web callers pass their own return URL
 * @returns {Promise<{ provider, paymentLink, reference, redirectUrl }>}
 */
export async function buildPaypalInit({ type, id, amount, currency, buyer, meta, callbackUrl }) {
  // custom_id is capped at 127 chars and is the ONLY purchase context that
  // survives onto the capture webhook, so it carries just what settlement can't
  // re-derive. A discount is looked up by reference instead of packed in here —
  // codes are free text and would blow the cap.
  const customId = [type, id, buyer._id, meta?.tierId || ""].join("|");
  // Our own reference, distinct from the PayPal order id the client confirms
  // with. Date.now() keeps it unique — PayPal rejects a repeated invoice_id,
  // which would otherwise block a buyer retrying a failed checkout.
  const invoiceId = `cv-${type}-${id}-${buyer._id}-${Date.now()}`.slice(0, 127);

  const order = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: customId,
          invoice_id: invoiceId,
          amount: {
            currency_code: (currency || "USD").toUpperCase(),
            value: toPaypalAmount(amount),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "OurCityvibe",
            user_action: "PAY_NOW",
            // Defaults to the app-scheme bounce page; a web caller passes its own
            // URL, because sending a browser popup to `mobile://` dead-ends the
            // checkout.
            return_url: callbackUrl || paypalReturnUrl(),
            cancel_url: callbackUrl
              ? `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}cancelled=1`
              : paypalReturnUrl({ cancelled: true }),
          },
        },
      },
    },
  });

  const approve = (order.links || []).find((l) => l.rel === "approve" || l.rel === "payer-action");

  return {
    provider: "paypal",
    paymentLink: approve?.href,
    // The PayPal order id IS the reference: it's what confirm captures against
    // and what every fulfilled record stores, so the confirm call and the
    // capture webhook land on the same paymentRef and dedupe against each other.
    reference: order.id,
    // What the app's browser session watches for. The return page forwards the
    // browser to this scheme URL — an http(s) redirectUrl would never dismiss
    // the session on iOS (see the Paystack return flow).
    redirectUrl: APP_RETURN_URL,
  };
}

/**
 * Page PayPal redirects to after approval. Forwards the browser — with PayPal's
 * ?token=&PayerID= query params — to the app's custom scheme so
 * openAuthSessionAsync dismisses and hands the URL to the app. Custom-scheme
 * 302s are unreliable across browsers, so meta-refresh + JS + a visible link
 * covers every case (same pattern as the Paystack return page).
 */
export const paypalReturn = async (req, res) => {
  // Web checkout: this page is a popup the opener is polling, and there is no app
  // to hand off to. Say the payment landed and let the tab close itself.
  if (req.query?.web === "1") {
    return res.status(200).send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <title>OurCityvibe</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background:#0f0a1f;
           color:#eee; display:flex; align-items:center; justify-content:center;
           height:100vh; margin:0; text-align:center; padding:24px; }
  </style>
</head><body>
  <div>
    <p>Payment received — your passes are on the way by email.</p>
    <p>You can close this window and return to OurCityvibe.</p>
  </div>
  <script>setTimeout(function(){ try { window.close(); } catch (e) {} }, 1500);</script>
</body></html>`);
  }

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

/** Pull the completed capture off an Orders v2 payload, if there is one. */
function completedCapture(order) {
  const captures = order?.purchase_units?.[0]?.payments?.captures || [];
  return captures.find((c) => c.status === "COMPLETED") || null;
}

/**
 * Capture a PayPal order and verify it matches the expected charge.
 *
 * Deliberately the same signature as verifyPaystackCharge so the shared confirm
 * path can take either — the only difference is that PayPal takes the money
 * here, whereas Paystack has already taken it by the time we verify.
 *
 * Idempotency matters: the buyer's confirm call and the capture webhook race on
 * every purchase. A repeat capture comes back 422 ORDER_ALREADY_CAPTURED, which
 * is treated as success by re-reading the order — not as a failure.
 *
 * @param {object} args
 * @param {string} args.reference          PayPal order id (from init)
 * @param {number} args.expectedAmount     major units
 * @param {string} args.expectedCurrency
 * @param {string} [args.expectedBuyerId]  buyer id baked into custom_id at init
 * @returns {Promise<{ orderId, captureId, amount, currency, custom }>} the same
 *   normalized shape the capture webhook produces, so both feed settlement
 *   identically.
 * @throws if the payment is not successful or doesn't match
 */
export async function capturePaypalOrder({
  reference,
  expectedAmount,
  expectedCurrency,
  expectedBuyerId,
}) {
  const attempt = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(reference)}/capture`, {
    method: "POST",
    // Makes PayPal itself collapse a retried capture instead of erroring, for
    // the common case where both racers arrive within PayPal's dedupe window.
    headers: { "PayPal-Request-Id": `capture-${reference}` },
    raw: true,
  });

  let order = attempt.body;
  if (!attempt.ok) {
    const issue = order?.details?.[0]?.issue;
    if (issue === "ORDER_ALREADY_CAPTURED") {
      // The other racer got there first. Read the order back and verify its
      // existing capture rather than failing a payment that succeeded.
      order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(reference)}`);
    } else {
      const err = new Error(
        issue === "INSTRUMENT_DECLINED"
          ? "That payment method was declined. Please try another."
          : "Payment was not successful"
      );
      err.statusCode = 400;
      throw err;
    }
  }

  const capture = completedCapture(order);
  if (!capture) {
    const err = new Error("Payment was not successful");
    err.statusCode = 400;
    throw err;
  }

  const unit = order.purchase_units?.[0] || {};
  const paid = capture.amount || {};

  if ((paid.currency_code || "").toUpperCase() !== (expectedCurrency || "").toUpperCase()) {
    const err = new Error("Payment currency mismatch");
    err.statusCode = 400;
    throw err;
  }
  // PayPal may collect slightly more; never less. Compared in minor units to
  // keep float noise out of the comparison.
  if (Math.round(Number(paid.value) * 100) < Math.round(Number(expectedAmount) * 100)) {
    const err = new Error("Payment amount mismatch");
    err.statusCode = 400;
    throw err;
  }

  const custom = parseCustomId(unit.custom_id || capture.custom_id);
  if (expectedBuyerId && custom.buyerId && custom.buyerId !== expectedBuyerId.toString()) {
    const err = new Error("Payment does not match this buyer");
    err.statusCode = 403;
    throw err;
  }

  return {
    orderId: order.id || reference,
    captureId: capture.id,
    amount: Number(paid.value),
    currency: (paid.currency_code || "").toUpperCase(),
    custom,
  };
}

/** Decode the `type|id|buyerId|tierId` string packed onto custom_id at init. */
export function parseCustomId(customId) {
  const [type, id, buyerId, tierId] = String(customId || "").split("|");
  return { type, id, buyerId, tierId: tierId || undefined };
}

/**
 * Normalize a PAYMENT.CAPTURE.COMPLETED webhook resource into the same shape
 * capturePaypalOrder returns, so settlement has one input format.
 *
 * The order id is what matters: every record written by the confirm path stores
 * it as the payment reference, so the webhook must resolve the same value or the
 * two paths would not dedupe and a buyer could be issued two tickets.
 *
 * @param {object} resource
 * @returns {{ orderId, captureId, amount, currency, custom } | null}
 */
export function normalizeCaptureResource(resource) {
  const orderId = resource?.supplementary_data?.related_ids?.order_id;
  if (!orderId) return null;
  return {
    orderId,
    captureId: resource.id,
    amount: Number(resource.amount?.value),
    currency: (resource.amount?.currency_code || "").toUpperCase(),
    custom: parseCustomId(resource.custom_id),
  };
}

/**
 * Refund a captured PayPal payment. Omitting the amount refunds it in full.
 * @param {object} args
 * @param {string} args.captureId
 * @param {number} [args.amount]   major units; full refund when absent
 * @param {string} [args.currency]
 */
export async function refundPaypalCapture({ captureId, amount, currency }) {
  return paypalRequest(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    body:
      amount != null
        ? {
            amount: {
              value: toPaypalAmount(amount),
              currency_code: (currency || "USD").toUpperCase(),
            },
          }
        : {},
  });
}

/**
 * Look up the capture id for a PayPal order — needed to refund a sale recorded
 * before capture ids were stored, and by the refund path generally.
 * @param {string} orderId
 * @returns {Promise<string | null>}
 */
export async function findPaypalCaptureId(orderId) {
  const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  return completedCapture(order)?.id || null;
}

// ─── Payouts (settlement) ────────────────────────────────────────────────────

/**
 * Send a seller's share to their PayPal email.
 *
 * Asynchronous by nature: the batch is accepted as PENDING and settles later, so
 * a SUCCESS here means "queued with PayPal", not "money delivered". The payout
 * job polls getPaypalPayoutStatus for the terminal state.
 *
 * @param {object} args
 * @param {string} args.email      seller's PayPal email
 * @param {number} args.amount     major units
 * @param {string} args.currency
 * @param {string} args.reference  idempotent reference (sender_batch_id)
 * @param {string} [args.note]
 * @returns {Promise<{ id: string, status: string }>}
 */
export async function createPaypalPayout({ email, amount, currency, reference, note }) {
  const result = await paypalRequest("/v1/payments/payouts", {
    method: "POST",
    body: {
      sender_batch_header: {
        // PayPal rejects a repeated sender_batch_id, which is exactly the
        // idempotency we want: an admin double-approving cannot pay twice.
        sender_batch_id: reference,
        email_subject: "You've been paid by OurCityvibe",
        email_message: note || "Your OurCityvibe earnings have been sent.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: email,
          amount: {
            value: toPaypalAmount(amount),
            currency: (currency || "USD").toUpperCase(),
          },
          note: note || "OurCityvibe payout",
          sender_item_id: reference,
        },
      ],
    },
  });

  return {
    id: result.batch_header?.payout_batch_id,
    status: result.batch_header?.batch_status || "PENDING",
  };
}

/**
 * Terminal state of a payout batch.
 * @param {string} batchId
 * @returns {Promise<{ status: string, itemStatus: string | null, error: string | null }>}
 */
export async function getPaypalPayoutStatus(batchId) {
  const result = await paypalRequest(`/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  const item = result.items?.[0];
  return {
    status: result.batch_header?.batch_status || "PENDING",
    itemStatus: item?.transaction_status || null,
    error: item?.errors?.message || null,
  };
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Verify a webhook came from PayPal.
 *
 * PayPal has no shared signing secret to HMAC locally — verification is a call
 * back to PayPal with the headers, the webhook id and the parsed body. The raw
 * body still matters: `transmission_sig` is computed over the exact bytes, so
 * the payload must be re-parsed from the raw buffer rather than re-serialized
 * from an already-parsed object.
 */
async function verifyPaypalSignature(req) {
  if (!config.paypal.webhookId) {
    console.error("paypalWebhook: PAYPAL_WEBHOOK_ID is not configured — rejecting");
    return null;
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return null;
  }

  const result = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: req.get("paypal-auth-algo"),
      cert_url: req.get("paypal-cert-url"),
      transmission_id: req.get("paypal-transmission-id"),
      transmission_sig: req.get("paypal-transmission-sig"),
      transmission_time: req.get("paypal-transmission-time"),
      webhook_id: config.paypal.webhookId,
      webhook_event: event,
    },
  });

  return result.verification_status === "SUCCESS" ? event : null;
}

/**
 * POST /paypal/webhook
 *
 * Fallback settlement for a payment whose confirm call never landed — the app
 * backgrounded, the browser closed on the receipt page, the network dropped. It
 * runs the identical code path the confirm does, so the two can race safely.
 *
 * Only PAYMENT.CAPTURE.COMPLETED is handled. CHECKOUT.ORDER.APPROVED fires
 * before any money moves, and capturing on it would charge a buyer who walked
 * away mid-checkout; an un-captured order simply expires and nobody is charged.
 */
export const paypalWebhook = async (req, res) => {
  let event;
  try {
    event = await verifyPaypalSignature(req);
  } catch (err) {
    console.error("paypalWebhook verification error:", err.message);
    return res.status(400).json({ message: "Webhook verification failed" });
  }
  if (!event) return res.status(400).json({ message: "Invalid signature" });

  // Acknowledge before settling: PayPal retries on any non-2xx, and a slow
  // fulfillment would pile up duplicate deliveries behind it.
  res.status(200).json({ received: true });

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return;

  try {
    const capture = normalizeCaptureResource(event.resource);
    if (!capture) {
      console.error(
        `paypalWebhook: capture ${event.resource?.id} has no related order id — cannot settle`
      );
      return;
    }
    // Imported here rather than at the top because the static edge would close a
    // cycle: settlePaypalPayment → payout.service → createPaypalPayout in this
    // file. ESM would resolve it via hoisting, but only by accident of
    // declaration order — this keeps the module graph acyclic instead.
    const { settlePaypalPurchase } = await import("../services/payments/settlePaypalPayment.js");
    await settlePaypalPurchase(capture);
  } catch (err) {
    console.error("paypalWebhook settlement error:", err.message);
  }
};

export default {
  buildPaypalInit,
  paypalReturn,
  paypalReturnUrl,
  capturePaypalOrder,
  parseCustomId,
  normalizeCaptureResource,
  refundPaypalCapture,
  findPaypalCaptureId,
  createPaypalPayout,
  getPaypalPayoutStatus,
  paypalWebhook,
};
