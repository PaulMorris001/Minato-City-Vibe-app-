/**
 * Wise settlement service.
 *
 * Wraps the Wise Platform Payouts flow into a few high-level helpers used by the
 * onboarding controller and the payout paths. Wise is payout-only — the platform
 * collects via Stripe (USD) and these helpers move the seller's net out to their
 * local bank, funded from the platform's Wise balance.
 *
 * Amounts here are in MAJOR units (e.g. 42.50 USD), unlike the Stripe cents used
 * elsewhere — callers convert at the boundary.
 */

import { wiseRequest } from "../../config/wise.js";
import config from "../../config/env.js";

const profileId = () => {
  if (!config.wise.profileId) throw new Error("Wise profile id not configured (WISE_PROFILE_ID)");
  return config.wise.profileId;
};

/**
 * Fetch the dynamic bank-detail fields Wise requires to pay out to a given
 * currency/country, so the mobile app can render the right onboarding form.
 * Uses a throwaway quote because requirements depend on the source/target pair.
 * @param {object} args
 * @param {string} args.targetCurrency  e.g. "GBP"
 * @param {number} [args.sourceAmount]  sizing amount (defaults to 100)
 * @returns {Promise<object[]>} Wise account-requirements spec
 */
export async function getWiseAccountRequirements({ targetCurrency, sourceAmount = 100 }) {
  // A quote is needed so Wise knows the corridor; v3 quotes can be created
  // without a target account and then queried for requirements.
  const quote = await wiseRequest(`/v3/profiles/${profileId()}/quotes`, {
    method: "POST",
    body: {
      sourceCurrency: config.wise.sourceCurrency,
      targetCurrency: (targetCurrency || "").toUpperCase(),
      sourceAmount,
      payOut: "BANK_TRANSFER",
    },
  });

  const requirements = await wiseRequest(`/v1/quotes/${quote.id}/account-requirements`, {
    headers: { "Accept-Minor-Version": "1" },
  });
  return requirements;
}

/**
 * Create a Wise recipient account for a vendor.
 * @param {object} args
 * @param {string} args.accountHolderName
 * @param {string} args.currency  target currency, e.g. "GBP"
 * @param {string} args.type      Wise account type, e.g. "sort_code", "iban", "aba"
 * @param {object} args.details   country-specific fields from the requirements form
 * @returns {Promise<{ id: string, currency: string }>}
 */
export async function createWiseRecipient({ accountHolderName, currency, type, details }) {
  const result = await wiseRequest("/v1/accounts", {
    method: "POST",
    body: {
      profile: Number(profileId()),
      accountHolderName,
      currency: (currency || "").toUpperCase(),
      type,
      details,
    },
  });
  return { id: String(result.id), currency: (result.currency || currency || "").toUpperCase() };
}

/**
 * Send a payout to a recipient: quote → transfer → fund from balance.
 *
 * Funded from the platform's Wise balance; the quote converts the platform's
 * source currency (USD) to the recipient's currency at the mid-market rate.
 *
 * @param {object} args
 * @param {string} args.recipientId    Wise target account id (user.wiseRecipientId)
 * @param {number} args.sourceAmount   amount to send in source (USD) major units
 * @param {string} args.targetCurrency recipient currency
 * @param {string} args.reference      idempotent reference (also the payout note)
 * @returns {Promise<{ id: string, status: string }>}
 */
export async function createWiseTransfer({ recipientId, sourceAmount, targetCurrency, reference }) {
  // 1) Quote (source-amount fixed: we know the seller's USD net).
  const quote = await wiseRequest(`/v3/profiles/${profileId()}/quotes`, {
    method: "POST",
    body: {
      sourceCurrency: config.wise.sourceCurrency,
      targetCurrency: (targetCurrency || "").toUpperCase(),
      sourceAmount,
      payOut: "BANK_TRANSFER",
      targetAccount: Number(recipientId),
    },
  });

  // 2) Transfer. customerTransactionId makes the whole call idempotent.
  const transfer = await wiseRequest("/v1/transfers", {
    method: "POST",
    body: {
      targetAccount: Number(recipientId),
      quoteUuid: quote.id,
      customerTransactionId: reference,
      details: {
        reference: reference.slice(0, 35), // Wise caps the visible reference length
        transferPurpose: "verification.transfers.purpose.pay.bills",
        sourceOfFunds: "verification.source.of.funds.other",
      },
    },
  });

  // 3) Fund the transfer from the platform's Wise balance.
  await wiseRequest(`/v3/profiles/${profileId()}/transfers/${transfer.id}/payments`, {
    method: "POST",
    body: { type: "BALANCE" },
  });

  return { id: String(transfer.id), status: transfer.status || "processing" };
}

/**
 * Available balance (major units) the platform holds in a given currency. Used
 * by the treasury guard so a payout fails cleanly instead of throwing mid-flow.
 * @param {string} [currency=source currency]
 * @returns {Promise<number>}
 */
export async function getWiseBalance(currency = config.wise.sourceCurrency) {
  const balances = await wiseRequest(`/v4/profiles/${profileId()}/balances`, {
    query: { types: "STANDARD" },
  });
  const match = (balances || []).find(
    (b) => (b.currency || "").toUpperCase() === currency.toUpperCase()
  );
  return Number(match?.amount?.value || 0);
}

export default {
  getWiseAccountRequirements,
  createWiseRecipient,
  createWiseTransfer,
  getWiseBalance,
};
