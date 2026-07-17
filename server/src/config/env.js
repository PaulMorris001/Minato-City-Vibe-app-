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
    },
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },

  // Socket.IO Configuration
  socket: {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  },

  // Trust / safety system — caps and policy windows for paid events
  trust: {
    // Until an organizer has had this many approved paid events, they're
    // considered "new" and subject to per-event caps below.
    newOrganizerThreshold: parseInt(process.env.NEW_ORGANIZER_THRESHOLD || "3", 10),
    // Caps applied to a new organizer's paid events
    newOrganizerMaxTicketPriceUsd: parseFloat(
      process.env.NEW_ORGANIZER_MAX_TICKET_PRICE_USD || "50"
    ),
    // Local-currency equivalents of the USD cap, for sellers who price in
    // their own currency (see currencyForUser). Rough conversions — they gate
    // trust, not accounting, so precision doesn't matter.
    newOrganizerMaxTicketPriceByCurrency: {
      USD: parseFloat(process.env.NEW_ORGANIZER_MAX_TICKET_PRICE_USD || "50"),
      NGN: parseFloat(process.env.NEW_ORGANIZER_MAX_TICKET_PRICE_NGN || "75000"),
    },
    newOrganizerMaxGuests: parseInt(
      process.env.NEW_ORGANIZER_MAX_GUESTS || "50",
      10
    ),
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
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || "10"),
    // Public HTTPS base URL of this server — used for provider checkout
    // return/callback URLs (e.g. the Paystack redirect).
    serverUrl: process.env.SERVER_URL || "https://api.ourcityvibe.com",
  },

  // Paystack Configuration — collection + payout rail for Nigerian sellers.
  // Collects NGN (cards/bank/USSD) via hosted checkout into the platform
  // balance and pays out to sellers' local banks via the Transfers API.
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  },

  // Wise (Wise Platform Payouts API) — the settlement rail for every seller who
  // collects via Stripe (i.e. everyone outside the Paystack footprint). Payout-
  // only: Stripe collects USD into the platform balance; Wise then settles the
  // seller's net to a local bank in ~40 currencies.
  wise: {
    apiToken: process.env.WISE_API_TOKEN || "",
    profileId: process.env.WISE_PROFILE_ID || "",
    // PEM public key from the Wise dashboard, used to verify webhook signatures.
    webhookPublicKey: process.env.WISE_WEBHOOK_PUBLIC_KEY || "",
    // Sandbox: https://api.sandbox.transferwise.tech — Prod: https://api.transferwise.com
    baseUrl: process.env.WISE_BASE_URL || "https://api.sandbox.transferwise.tech",
    // Currency the platform balance is funded in / quotes source from.
    sourceCurrency: (process.env.WISE_SOURCE_CURRENCY || "USD").toUpperCase(),
  },

  // Sign in with Apple. For native iOS sign-in, the identity token's `aud`
  // claim is the app's bundle identifier, so that's the expected audience.
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || "com.ourcityvibe.app",
  },
};

export default config;
