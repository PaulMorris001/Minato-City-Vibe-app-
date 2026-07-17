/**
 * Wise (Wise Platform) API client.
 *
 * Thin wrapper over the Wise REST API using the platform API token. Native fetch
 * (Node 18+), mirroring the Paystack client in ./paystack.js so the rest of
 * the server makes outbound calls the same way.
 *
 * Wise is a PAYOUT-only rail: we create recipient accounts and send transfers,
 * funded from the platform's Wise balance. Collection still happens via Stripe.
 */

import config from "./env.js";

/**
 * Make an authenticated request to the Wise API.
 * @param {string} path - path after the base URL (e.g. "/v1/transfers")
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {object} [options.body] - JSON body (auto-stringified)
 * @param {object} [options.query] - query params
 * @param {object} [options.headers] - extra headers (e.g. idempotency)
 * @returns {Promise<object>} parsed Wise response body
 */
export async function wiseRequest(path, { method = "GET", body, query, headers } = {}) {
  if (!config.wise.apiToken) {
    throw new Error("Wise API token is not configured (WISE_API_TOKEN)");
  }

  let url = `${config.wise.baseUrl}${path}`;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.wise.apiToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    // Wise errors come back as { errors: [{ message }] } or { message }.
    const message =
      json?.errors?.[0]?.message || json?.message || `Wise request failed (${res.status})`;
    const err = new Error(message);
    err.statusCode = res.status;
    err.wiseResponse = json;
    throw err;
  }

  return json;
}

export default { wiseRequest };
