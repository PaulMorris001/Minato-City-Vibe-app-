import admin from "firebase-admin";
import { createRequire } from "module";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { getSocketInstance } from "../services/socket.service.js";

// Lazy-init so the app doesn't crash if credentials are missing
export function getFirebaseApp() {
  if (admin.apps.length > 0) return admin.apps[0];

  // Load service account from env var (JSON string) or a local file
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    const require = createRequire(import.meta.url);
    serviceAccount = require("../../firebase-service-account.json");
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/**
 * FCM errors that mean the TOKEN is dead, not that the send failed transiently.
 * A reinstall, a restored backup or a long-idle install all produce these.
 *
 * Deliberately excludes `messaging/invalid-argument`: FCM returns that for a
 * malformed message payload too, so treating it as a dead token would let one
 * bad send wipe the push token of every recipient — and they'd only get pushes
 * back after a cold launch each. A live token is never worth that gamble.
 */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/**
 * Send a push notification via Firebase Cloud Messaging.
 * Silently no-ops if the token is missing.
 *
 * @param {string} pushToken
 * @param {string} title
 * @param {string} body
 * @param {object} [data]    extra payload; values are stringified for FCM
 * @param {object} [opts]
 * @param {string} [opts.userId]  owner of the token. When given, a token FCM
 *   rejects as dead is cleared, so we stop pushing into the void and the next
 *   app launch re-registers a live one. Without it the dead token sticks around
 *   forever and the user silently receives nothing.
 */
export async function sendPushNotification(pushToken, title, body, data = {}, { userId } = {}) {
  console.log(`[Push] Attempting to send: "${title}" → token: ${pushToken?.slice(0, 30)}...`);

  if (!pushToken) {
    console.log("[Push] Skipped — no push token");
    return;
  }

  const message = {
    token: pushToken,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: { priority: "high", notification: { channelId: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  };

  try {
    const app = getFirebaseApp();
    const response = await admin.messaging(app).send(message);
    console.log("[Push] Sent successfully, message id:", response);
  } catch (err) {
    console.error("[Push] Send error:", err?.message ?? err);
    if (userId && DEAD_TOKEN_CODES.has(err?.errorInfo?.code || err?.code)) {
      try {
        // Only clear the token we just tried: the user may have registered a
        // newer one from another device between the read and this failure.
        await User.updateOne({ _id: userId, fcmToken: pushToken }, { fcmToken: null });
        console.log(`[Push] Cleared dead token for user ${userId}`);
      } catch (clearErr) {
        console.error("[Push] Failed to clear dead token:", clearErr?.message ?? clearErr);
      }
    }
  }
}

/**
 * Notify a user: write the durable in-app Notification AND (best-effort) push.
 *
 * Use this instead of calling sendPushNotification directly. Push alone is not a
 * notification — it silently no-ops when the user has no fcmToken (never granted
 * permission, reinstalled, stale token), which is exactly how sellers ended up
 * with sales they never heard about. The Notification doc is the durable record;
 * the push is the nudge.
 *
 * Never throws: a notification failure must not roll back a fulfilled sale or
 * fail the HTTP request that triggered it. Callers may safely omit `await`.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId  recipient
 * @param {object} n
 * @param {string} n.type    notification type (drives the mobile icon + tap target)
 * @param {string} n.title
 * @param {string} n.body
 * @param {object} [n.data]  extra payload; values are stringified for FCM
 * @param {boolean} [n.push] set false for in-app only
 * @returns {Promise<object|null>} the created Notification, or null on failure
 */
export async function notifyUser(userId, { type, title, body, data = {}, push = true }) {
  // A falsy recipient is a caller bug, not a user state — it means a field name
  // is wrong upstream. Mongoose would throw a validation error that the caller's
  // catch-all swallows, so the notification vanishes silently. Shout instead.
  if (!userId) {
    console.error(
      `[notifyUser] Refusing to send "${type}" — no recipient id. This is a bug in the caller.`
    );
    return null;
  }

  let notification = null;
  try {
    notification = await Notification.create({ user: userId, type, title, body, data });
  } catch (err) {
    console.error(`[notifyUser] Failed to persist "${type}" for ${userId}:`, err?.message ?? err);
  }

  if (notification) {
    try {
      const socketInstance = getSocketInstance();
      socketInstance?.to(`user:${userId.toString()}`).emit("notification:new", notification);
    } catch (err) {
      console.error(`[notifyUser] Socket emit failed for "${type}" → ${userId}:`, err?.message ?? err);
    }
  }

  if (push) {
    try {
      const recipient = await User.findById(userId).select("fcmToken");
      await sendPushNotification(recipient?.fcmToken, title, body, { type, ...data }, { userId });
    } catch (err) {
      console.error(`[notifyUser] Push failed for "${type}" → ${userId}:`, err?.message ?? err);
    }
  }

  return notification;
}
