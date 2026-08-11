/**
 * Environment Configuration
 * Centralized environment variable management
 * All environment variables should be accessed through this module
 */

import dotenv from "dotenv";

dotenv.config();

/**
 * Validates required environment variables
 * @throws {Error} if required variables are missing
 */
function validateEnv() {
  const required = ["MONGO_URI", "JWT_SECRET", "PORT"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

// Validate on module load
validateEnv();

/**
 * Environment configuration object
 */
export const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    env: process.env.NODE_ENV || "development",
  },

  // Dev conveniences. These MUST never activate in production — each is gated
  // on NODE_ENV so a stray env var on Render can't turn them on.
  dev: {
    // When true, every signup/reset OTP is "000000" so you can create accounts
    // with any (even fake) email locally without waiting for a real code.
    // On by default outside production; set DEV_FIXED_OTP=false to opt out.
    fixedOtp:
      (process.env.NODE_ENV || "development") !== "production" &&
      process.env.DEV_FIXED_OTP !== "false",
  },

  // Database Configuration
  database: {
    uri: process.env.MONGO_URI,
    options: {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Fail queries immediately when disconnected instead of silently
      // queuing them until the mongoose buffering timeout (10s default) —
      // that used to surface as "buffering timed out" errors that looked
      // like a query bug when the real problem was a dead connection.
      bufferCommands: false,
    },
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",

    // Admin tokens are signed with their OWN secret so they're cryptographically
    // separate from user tokens: a leaked/forgeable user token can never be
    // turned into an admin token by adding an `isAdmin` claim, because the
    // signature won't verify. Falls back to JWT_SECRET (with a boot warning)
    // so an existing deploy doesn't lock itself out — set ADMIN_JWT_SECRET.
    adminSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
    // Short-lived by design: admin sessions are high blast-radius.
    adminExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "8h",
  },

  // CORS Configuration. Accepts a comma-separated list so the marketing site and
  // the admin subdomain can both be allowed without falling back to "*"
  // (e.g. CORS_ORIGIN="https://www.ourcityvibe.com,https://admin.ourcityvibe.com").
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    // Lets browser clients read the sliding-session renewal header (see
    // middleware/auth.middleware.js) — without this, fetch/XHR in a browser
    // can't see custom response headers even same-origin-adjacent.
    exposedHeaders: ["X-Refreshed-Token"],
  },

  // Socket.IO Configuration
  socket: {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  },

  // Trust / safety system — policy windows for paid events.
  //
  // There are deliberately NO automatic ticket-price or capacity caps here.
  // Organizers may price and size an event however they like; every public paid
  // event instead goes through the admin approval queue before it can sell a
  // single ticket (see createEvent in controllers/event.controller.js), so the
  // ceiling is a reviewer's judgement rather than a number in config.
  trust: {
    // Buyer self-refund window (hours since purchase) AND must be at least
    // this many hours before the event date.
    buyerRefundWindowHours: parseInt(
      process.env.BUYER_REFUND_WINDOW_HOURS || "24",
      10
    ),
    buyerRefundCutoffHours: parseInt(
      process.env.BUYER_REFUND_CUTOFF_HOURS || "24",
      10
    ),
    // Fraud-report threshold that surfaces an event as "flagged" in admin
    fraudReportFlagThreshold: parseInt(
      process.env.FRAUD_REPORT_FLAG_THRESHOLD || "2",
      10
    ),
  },

  // Official support account — the company-owned user that customers message
  // for help. It's a normal user document; these behaviours are layered on by
  // ID (see utils/supportAccount.js). When unset (dev/staging) every support
  // behaviour is inert and the account acts like any other user.
  support: {
    userId: process.env.SUPPORT_USER_ID || "",
    enabled: !!process.env.SUPPORT_USER_ID,
  },

  // External event ingestion providers
  externalEvents: {
    ticketmasterApiKey: process.env.TICKETMASTER_API_KEY || "",

    // Eventbrite has no public search API (retired Feb 2020); this reads their
    // undocumented internal endpoint, so it ships default-OFF and can be
    // killed via env alone if it starts failing or blocking. See
    // services/eventbrite.service.js for the full caveat.
    eventbrite: {
      enabled: process.env.EVENTBRITE_ENABLED === "true",
      maxPagesPerCity: parseInt(process.env.EVENTBRITE_MAX_PAGES || "10", 10),
    },
  },

  // Country-State-City API (location data source for pickers)
  csc: {
    apiKey: process.env.CSC_API_KEY || "",
    baseUrl: process.env.CSC_BASE_URL || "https://api.countrystatecity.in/v1",
  },

  // Stripe Configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    // Connect events (account.updated for connected accounts) are delivered to a
    // SEPARATE Stripe webhook endpoint with its OWN signing secret — the account
    // webhook secret above will NOT verify them.
    connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "",
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || "10"),
    // Public HTTPS base URL of this server — used for provider checkout
    // return/callback URLs (e.g. the Paystack redirect) and the Connect
    // onboarding return/refresh URLs.
    serverUrl: process.env.SERVER_URL || "https://api.ourcityvibe.com",
  },

  // Paystack Configuration — collection + payout rail for Nigerian sellers.
  // Collects NGN (cards/bank/USSD) via hosted checkout into the platform
  // balance and pays out to sellers' local banks via the Transfers API.
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  },

  // Sign in with Apple. For native iOS sign-in, the identity token's `aud`
  // claim is the app's bundle identifier, so that's the expected audience.
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || "com.ourcityvibe.app",
  },
};

// Boot-time warnings for admin hardening that's configured but not yet migrated.
// These are warnings rather than hard failures so a deploy can never lock the
// admin out of the portal — but each one should be resolved in production.
if (!process.env.ADMIN_JWT_SECRET) {
  console.warn(
    "[security] ADMIN_JWT_SECRET is not set — admin tokens are signed with the " +
      "same secret as user tokens. Set it to a distinct random value."
  );
}
if (!process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_PASSWORD) {
  console.warn(
    "[security] ADMIN_PASSWORD is stored in plaintext — set ADMIN_PASSWORD_HASH " +
      "to a bcrypt hash instead and remove ADMIN_PASSWORD."
  );
}
if (config.cors.origin === "*") {
  console.warn(
    "[security] CORS_ORIGIN is unset — the API accepts requests from any origin."
  );
}

export default config;
