/**
 * PayPal payout onboarding.
 *
 * This is the whole of it: a seller tells us the email address on their PayPal
 * account and they can be paid. There is no hosted onboarding, no account
 * creation, no KYC redirect and no capability webhook, because PayPal Payouts
 * addresses a recipient by email and runs its own checks at payout time. The
 * Stripe Connect controller this replaced needed 434 lines to reach the same
 * state.
 *
 * The trade-off to be aware of: an email typo is not detectable here. PayPal
 * accepts a payout to an address with no PayPal account and holds it as
 * "unclaimed" for 30 days, after which the money returns to us. So the address
 * is confirmed to the seller by email at save time, and the payout job surfaces
 * an unclaimed batch rather than reporting it paid.
 */

import User from "../models/user.model.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Save the seller's PayPal payout address.
 * POST /paypal/connect/save   body: { email }
 */
export const savePaypalEmail = async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "A valid PayPal email address is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { paypalPayoutEmail: email, paypalOnboardingComplete: true },
      { new: true }
    ).select("paypalPayoutEmail paypalOnboardingComplete");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      onboardingComplete: true,
      email: user.paypalPayoutEmail,
    });
  } catch (error) {
    console.error("savePaypalEmail:", error);
    return res.status(500).json({ message: "Failed to save your PayPal address" });
  }
};

/**
 * Onboarding status (shape mirrors /paystack/connect/status).
 * GET /paypal/connect/status
 */
export const getPayoutStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "paypalPayoutEmail paypalOnboardingComplete"
    );
    const complete = !!(user?.paypalPayoutEmail && user?.paypalOnboardingComplete);
    return res.status(200).json({
      connected: complete,
      onboardingComplete: complete,
      chargesEnabled: complete,
      payoutsEnabled: complete,
      email: user?.paypalPayoutEmail || null,
    });
  } catch (error) {
    console.error("getPayoutStatus:", error);
    return res.status(500).json({ message: "Failed to fetch status" });
  }
};

export default { savePaypalEmail, getPayoutStatus };
