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
    // Deep-link scheme used for Stripe Connect onboarding redirect
    appUrl: process.env.APP_URL || "nightvibe://",
    // HTTPS server URL used as Stripe's required return/refresh URLs
    serverUrl: process.env.SERVER_URL || "https://api.ourcityvibe.com",
  },

  // Flutterwave Configuration — secondary provider for African vendors who
  // can't onboard to Stripe Connect. Collects (cards/mobile money/NGN) into the
  // platform balance and pays out to vendors' local banks via the Transfers API.
  flutterwave: {
    secretKey: process.env.FLW_SECRET_KEY || "",
    publicKey: process.env.FLW_PUBLIC_KEY || "",
    encryptionKey: process.env.FLW_ENCRYPTION_KEY || "",
    // Shared secret set in the Flutterwave dashboard; compared against the
    // `verif-hash` header on incoming webhooks.
    secretHash: process.env.FLW_SECRET_HASH || "",
  },

  // Sign in with Apple. For native iOS sign-in, the identity token's `aud`
  // claim is the app's bundle identifier, so that's the expected audience.
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || "com.obito.cityvibe",
  },
};

export default config;
