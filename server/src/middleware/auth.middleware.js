import jwt from "jsonwebtoken";
import config from "../config/env.js";

// Sliding session: there's no refresh-token flow, just a flat expiresIn on
// every signed token. Without this, an actively-used app still hits a hard
// wall exactly `expiresIn` after the LAST LOGIN (not after inactivity) and
// the user gets bounced to /login mid-session, which reads as an unexplained
// logout. Once a token is past this age, a request that verifies fine gets a
// freshly-signed replacement (full expiresIn again) on X-Refreshed-Token —
// so a session that's actually being used renews itself indefinitely, and
// only a session with no requests for a full expiry window ever truly expires.
const REFRESH_THRESHOLD_SECONDS = 24 * 60 * 60; // reissue once older than 1 day

function maybeRenewToken(decoded, res) {
  if (decoded.guest || !decoded.iat) return;
  const ageSeconds = Date.now() / 1000 - decoded.iat;
  if (ageSeconds < REFRESH_THRESHOLD_SECONDS) return;
  const refreshed = jwt.sign({ id: decoded.id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  res.setHeader("X-Refreshed-Token", refreshed);
}

// Required authentication - user must be logged in
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    // `guest` marks a short-lived guest-checkout token (no real account). It's
    // accepted here so guests can drive the ticket purchase endpoints, but
    // `rejectGuest` blocks it from account-scoped routes.
    req.user = { id: decoded.id, isGuest: !!decoded.guest };
    maybeRenewToken(decoded, res);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// Blocks guest-checkout tokens from account-scoped routes (profile, events,
// chat, …). Mount after `authenticate` on anything a guest must not reach.
export function rejectGuest(req, res, next) {
  if (req.user?.isGuest) {
    return res.status(403).json({ message: "Sign in to use this feature." });
  }
  next();
}

// Optional authentication - attach user if token exists, but don't require it
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = { id: decoded.id };
    maybeRenewToken(decoded, res);
  } catch {
    // invalid token — continue without auth
  }

  next();
}
