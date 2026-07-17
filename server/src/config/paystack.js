/**
 * Paystack API client
 *
 * Thin wrapper over the Paystack REST API using the platform secret key.
 * We use native fetch (Node 18+) to avoid pulling in an HTTP client dependency,
 * mirroring how the rest of the server makes outbound calls.
 */

import config from "./env.js";

const BASE = "https://api.paystack.co";

/**
 * Make an authenticated request to the Paystack API.
 * @param {string} path - path after the host (e.g. "/transaction/verify/ref-123")
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {object} [options.body] - JSON body (auto-stringified)
 * @param {object} [options.query] - query params
 * @returns {Promise<object>} parsed Paystack response body (`{ status, message, data }`)
 */
export async function paystackRequest(path, { method = "GET", body, query } = {}) {
  if (!config.paystack.secretKey) {
    throw new Error("Paystack secret key is not configured (PAYSTACK_SECRET_KEY)");
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
      Authorization: `Bearer ${config.paystack.secretKey}`,
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

  // Paystack signals failure with a boolean `status: false` (plus HTTP status).
  if (!res.ok || json?.status === false) {
    const message = json?.message || `Paystack request failed (${res.status})`;
    const err = new Error(message);
    err.statusCode = res.status;
    err.paystackResponse = json;
    throw err;
  }

  return json;
}

export default { paystackRequest };
