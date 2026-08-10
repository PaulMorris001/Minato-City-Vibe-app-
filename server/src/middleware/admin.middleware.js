import jwt from "jsonwebtoken";
import config from "../config/env.js";

export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    // Verified against the admin-only secret — a user token can't satisfy this
    // even if it somehow carried an `isAdmin` claim.
    const decoded = jwt.verify(token, config.jwt.adminSecret);
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
