/**
 * Flutterwave API client
 *
 * Thin wrapper over the Flutterwave v3 REST API using the platform secret key.
 * We use native fetch (Node 18+) to avoid pulling in an HTTP client dependency,
 * mirroring how the rest of the server makes outbound calls.
 */

import config from "./env.js";

const BASE = "https://api.flutterwave.com/v3";

/**
 * Make an authenticated request to the Flutterwave API.
 * @param {string} path - path after /v3 (e.g. "/transactions/123/verify")
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {object} [options.body] - JSON body (auto-stringified)
 * @param {object} [options.query] - query params
 * @returns {Promise<object>} parsed Flutterwave response body (`{ status, message, data }`)
 */
export async function flwRequest(path, { method = "GET", body, query } = {}) {
  if (!config.flutterwave.secretKey) {
    throw new Error("Flutterwave secret key is not configured (FLW_SECRET_KEY)");
  }

  let url = `${BASE}${path}`;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.flutterwave.secretKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok || json?.status === "error") {
    const message = json?.message || `Flutterwave request failed (${res.status})`;
    const err = new Error(message);
    err.statusCode = res.status;
    err.flwResponse = json;
    throw err;
  }

  return json;
}

export default { flwRequest };
