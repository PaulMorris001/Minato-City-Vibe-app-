import CouponTransaction from "../models/couponTransaction.model.js";

/**
 * GET /wallet/credit-history — the requesting user's own OurCityVibe credit
 * ledger, newest first. Backs the "history of spending" list on
 * mobile/app/wallet-rewards.tsx, below the balance card.
 */
export async function getCreditHistory(req, res) {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const transactions = await CouponTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("type amount currency description order createdAt");

    res.json({ transactions });
  } catch (error) {
    console.error("getCreditHistory:", error);
    res.status(500).json({ message: "Error fetching credit history" });
  }
}
