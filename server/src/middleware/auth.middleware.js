import jwt from "jsonwebtoken";
import config from "../config/env.js";

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
  } catch {
    // invalid token — continue without auth
  }

  next();
}
