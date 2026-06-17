import rateLimit from "express-rate-limit";

// Shared options. `standardHeaders` emits RateLimit-* headers; legacy X-RateLimit-*
// are off. The default key is req.ip — which is the real client IP only because
// index.js sets `trust proxy` (the app runs behind Render's proxy).
const base = {
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * General auth limiter for credential endpoints (login, register, OAuth).
 * Generous enough not to bother real users, tight enough to blunt credential
 * stuffing and automated signup abuse.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    message: "Too many attempts. Please wait a few minutes and try again.",
  },
});

/**
 * Stricter limiter for one-time-code endpoints (password reset, OTP resend,
 * email verification). These send email and are the prime target for spam, so
 * they get a tighter budget.
 */
export const otpLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 6,
  message: {
    message: "Too many code requests. Please wait a few minutes and try again.",
  },
});
