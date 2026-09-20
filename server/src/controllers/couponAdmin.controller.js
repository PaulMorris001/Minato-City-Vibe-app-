import CouponTransaction from "../models/couponTransaction.model.js";
import User from "../models/user.model.js";

/**
 * GET /admin/coupons — every OurCityVibe credit ledger row (earned, spent,
 * refunded, expired, adjusted), newest first. The admin-visible counterpart
 * to the buyer-facing history on mobile/app/wallet-rewards.tsx
 * (GET /wallet/credit-history) — same rows, unfiltered by user.
 */
export async function getCouponTransactions(req, res) {
  try {
    const { search = "", type = "", currency = "", page = 1, limit = 20 } = req.query;
    const query = {};
    if (type) query.type = type;
    if (currency) query.currency = currency;

    // A username/email search has to go through the user ref, not a field on
    // this collection — resolve matching user ids first, same shape as any
    // other admin list that searches a populated ref.
    if (search) {
      const users = await User.find({
        $or: [
          { username: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      query.user = { $in: users.map((u) => u._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      CouponTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("user", "username email")
        .populate("order", "total currency vendor"),
      CouponTransaction.countDocuments(query),
    ]);

    res.json({ transactions, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
