/**
 * Admin payout queue.
 *
 * The "admins approve payouts" gate: vendor money is held in the platform
 * balance and surfaced here as Payout records. An admin reviews the queue and
 * approves (runs the real transfer) or rejects (leaves the funds put).
 */

import Payout from "../models/payout.model.js";
import { executePayout } from "../services/payments/payout.service.js";

/**
 * List payouts, newest first. Defaults to the pending-approval queue.
 * GET /admin/payouts?status=awaiting_approval&page=1&limit=50
 */
export const getPayouts = async (req, res) => {
  try {
    const status = req.query.status || "awaiting_approval";
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);

    const filter = status === "all" ? {} : { status };
    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("vendor", "username email businessName location")
        .lean(),
      Payout.countDocuments(filter),
    ]);

    res.status(200).json({
      payouts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("getPayouts error:", error.message);
    res.status(500).json({ message: "Failed to load payouts" });
  }
};

/**
 * Approve a payout → run the actual provider transfer.
 * POST /admin/payouts/:id/approve
 */
export const approvePayout = async (req, res) => {
  try {
    const payout = await executePayout(req.params.id, { approvedBy: req.user?.username });
    res.status(200).json({ message: "Payout approved and sent", payout });
  } catch (error) {
    console.error("approvePayout error:", error.message);
    // The payout has been marked "failed" with the error by executePayout; the
    // admin can retry once the cause (e.g. underfunded Wise balance) is fixed.
    res.status(400).json({ message: error.message || "Couldn't release payout" });
  }
};

/**
 * Reject a payout — funds stay in the platform balance, nothing is sent.
 * POST /admin/payouts/:id/reject   { reason? }
 */
export const rejectPayout = async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: "Payout not found" });
    if (payout.status === "paid") {
      return res.status(409).json({ message: "Payout already sent — can't reject" });
    }
    payout.status = "rejected";
    payout.rejectedReason = req.body?.reason || "";
    await payout.save();
    res.status(200).json({ message: "Payout rejected", payout });
  } catch (error) {
    console.error("rejectPayout error:", error.message);
    res.status(500).json({ message: "Failed to reject payout" });
  }
};

export default { getPayouts, approvePayout, rejectPayout };
