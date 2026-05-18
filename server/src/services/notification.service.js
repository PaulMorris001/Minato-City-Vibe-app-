import admin from "firebase-admin";
import { createRequire } from "module";

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
 * Send a push notification via Firebase Cloud Messaging.
 * Silently no-ops if the token is missing.
 */
export async function sendPushNotification(pushToken, title, body, data = {}) {
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
  }
}
