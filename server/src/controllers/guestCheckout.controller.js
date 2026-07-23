/**
 * Guest checkout — lets someone buy a ticket without creating an account.
 *
 * Flow: the buyer enters an email, we email a 6-digit code (reusing the signup
 * OTP machinery), they enter it, and we hand back a short-lived "guest" JWT. The
 * web app sends that token like any Bearer token, so the existing purchase
 * endpoints work unchanged — `req.user.id` resolves to a passwordless guest user
 * keyed by the email. If they ever register with the same address, the account
 * upgrades in place (email is unique).
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
import User from "../models/user.model.js";
import { generateOTP, sendGuestCheckoutOTP } from "../services/email.service.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes, matching signup
const GUEST_TOKEN_TTL = "2h"; // short — a guest token only needs to survive checkout

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Find an existing user by email, or create a passwordless guest user. Used both
 * for the buyer (after OTP) and for gift recipients (by their email). Never
 * downgrades or overwrites a real account — an existing user is returned as-is.
 *
 * @param {string} email
 * @param {string} [name]  display name hint (recipient's name), best-effort
 * @returns {Promise<import("mongoose").Document>}
 */
export async function findOrCreateGuestUser(email, name = "") {
  const normalized = normalizeEmail(email);
  const existing = await User.findOne({ email: normalized });
  if (existing) return existing;

  // Usernames are required + unique (case-insensitive at the app layer). Derive a
  // readable base from the name/email localpart, then guarantee uniqueness with a
  // random suffix and a short retry loop.
  const base =
    String(name || "").trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16) ||
    normalized.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16) ||
    "guest";

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = `${base}_${crypto.randomBytes(3).toString("hex")}`;
    const taken = await User.findOne({ username: new RegExp(`^${username}$`, "i") }).select("_id");
    if (taken) continue;
    try {
      return await User.create({
        email: normalized,
        username,
        isGuest: true,
        authProvider: "local",
        termsAcceptedAt: new Date(),
      });
    } catch (err) {
      // Concurrent create raced us to this email — return the winner.
      if (err?.code === 11000) {
        const winner = await User.findOne({ email: normalized });
        if (winner) return winner;
      }
      // Username collided despite the check — retry with a new suffix.
    }
  }
  throw new Error("Could not create guest account");
}

/** Sign a short-lived token that authenticates a guest for checkout only. */
export function signGuestToken(userId) {
  return jwt.sign({ id: userId.toString(), guest: true }, config.jwt.secret, {
    expiresIn: GUEST_TOKEN_TTL,
  });
}

/**
 * POST /payments/guest/start-otp  body: { email }
 * Emails a checkout code to the address. Always responds 200 (don't leak whether
 * the email maps to an existing account).
 */
export const startGuestOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    const user = await findOrCreateGuestUser(email);
    const otp = generateOTP();
    user.signupOTP = otp;
    user.signupOTPExpires = new Date(Date.now() + OTP_TTL_MS);
    await user.save();

    try {
      await sendGuestCheckoutOTP(email, otp);
    } catch (mailErr) {
      // In dev the OTP is the fixed code (000000), so a blocked/flaky mailer
      // must not stop checkout — log the code and let the flow continue. In
      // production the buyer genuinely needs the emailed code, so surface it.
      console.error("sendGuestCheckoutOTP failed:", mailErr?.message ?? mailErr);
      if (!config.dev.fixedOtp) {
        return res
          .status(502)
          .json({ message: "We couldn't email your code right now. Please try again shortly." });
      }
      console.log(`[guest-checkout] DEV fallback — OTP for ${email} is ${otp}`);
    }
    return res.status(200).json({ message: "We've emailed you a code." });
  } catch (error) {
    console.error("startGuestOtp error:", error);
    return res.status(500).json({ message: "Couldn't send the code. Please try again." });
  }
};

/**
 * POST /payments/guest/verify-otp  body: { email, otp }
 * On match, returns a guest token the client uses for the batch purchase.
 */
export const verifyGuestOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    if (!EMAIL_RE.test(email) || !otp) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    const user = await User.findOne({ email });
    if (
      !user ||
      !user.signupOTP ||
      user.signupOTP !== otp ||
      !user.signupOTPExpires ||
      user.signupOTPExpires.getTime() < Date.now()
    ) {
      return res.status(400).json({ message: "That code is invalid or has expired." });
    }

    // Confirmed: clear the OTP and mark the email verified.
    user.signupOTP = undefined;
    user.signupOTPExpires = undefined;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    await user.save();

    return res.status(200).json({
      token: signGuestToken(user._id),
      email: user.email,
    });
  } catch (error) {
    console.error("verifyGuestOtp error:", error);
    return res.status(500).json({ message: "Couldn't verify the code. Please try again." });
  }
};

export default { startGuestOtp, verifyGuestOtp, findOrCreateGuestUser, signGuestToken };
