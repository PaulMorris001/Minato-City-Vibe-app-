import mongoose from "mongoose";
import config from "./env.js";

const RETRY_DELAY_MS = 5000;

// Visibility into connection state changes after the initial connect — the
// Node driver auto-reconnects on transient drops, but we want it logged
// instead of silently flapping (and previously, nothing logged it at all).
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  Database disconnected — attempting to reconnect");
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ Database reconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("❌ Database connection error:", error.message);
});

/**
 * Connects to MongoDB, retrying indefinitely on failure instead of giving up
 * after one attempt. Previously a failed first connect just logged and let
 * the server keep running with no DB — every route would then hang until
 * mongoose's buffering timeout before failing, with no way to recover short
 * of a manual restart.
 */
export default async function connectDB() {
  for (;;) {
    try {
      await mongoose.connect(config.database.uri, config.database.options);
      console.log("✅ Database Connected Successfully");
      console.log(`📊 Connected to: ${mongoose.connection.name}`);
      return;
    } catch (error) {
      console.error("❌ Error connecting to the database:");
      console.error("Error Code:", error.code);
      console.error("Error Message:", error.message);
      console.error(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
