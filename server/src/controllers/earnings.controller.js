/**
 * Seller-facing earnings endpoints.
 *
 * The seller is ALWAYS `req.user.id`, never a route or query param — one
 * seller must never be able to read another's revenue, so there is deliberately
 * no id to tamper with.
 */

import {
  getEarningsSummary,
  listSales,
  listPayouts,
} from "../services/payments/earnings.service.js";

const SALE_TYPES = new Set(["ticket", "guide", "booking", "order"]);
const PAYOUT_STATUSES = new Set([
  "awaiting_approval",
  "processing",
  "paid",
  "failed",
  "rejected",
]);

/**
 * Headline figures: lifetime, this month, what's pending, what's held.
 * GET /earnings/summary
 */
export const getSummary = async (req, res) => {
  try {
    res.json(await getEarningsSummary(req.user.id));
  } catch (error) {
    console.error("getSummary error:", error);
    res.status(500).json({ message: "Couldn't load your earnings" });
  }
};

/**
 * Sale-by-sale history, newest first.
 * GET /earnings/sales?type=&cursor=&limit=
 */
export const getSales = async (req, res) => {
  try {
    const { cursor, type } = req.query;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    res.json(
      await listSales(req.user.id, {
        cursor,
        limit,
        type: SALE_TYPES.has(type) ? type : undefined,
      })
    );
  } catch (error) {
    console.error("getSales error:", error);
    res.status(500).json({ message: "Couldn't load your sales" });
  }
};

/**
 * The seller's own payout records.
 * GET /earnings/payouts?status=&page=&limit=
 */
export const getPayouts = async (req, res) => {
  try {
    const { status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    res.json(
      await listPayouts(req.user.id, {
        status: PAYOUT_STATUSES.has(status) ? status : undefined,
        page,
        limit,
      })
    );
  } catch (error) {
    console.error("getPayouts error:", error);
    res.status(500).json({ message: "Couldn't load your payouts" });
  }
};

export default { getSummary, getSales, getPayouts };
