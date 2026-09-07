/**
 * PayPal API client
 *
 * Thin wrapper over the PayPal REST API using the platform app credentials.
 * Native fetch, no SDK — same reasoning as config/paystack.js, and PayPal's
 * Node SDKs churn between major versions while the four endpoints we use
 * (Orders v2, refunds, Payouts v1, webhook verification) have been stable.
 *
 * Unlike Paystack's static secret key, PayPal needs an OAuth2 access token.
 * Tokens last ~9 hours, so one is cached in module scope and refreshed a minute
 * before expiry; a 401 mid-flight drops the cache and retries once, which covers
 * a token revoked server-side before its stated expiry.
 *
 * Unit convention: PayPal speaks MAJOR units as decimal strings ("12.50"), which
 * is what the rest of this codebase uses — so unlike Stripe (cents) and Paystack
 * (kobo) there is no subunit conversion at this boundary, only string formatting.
 */

import config from "./env.js";

const HOSTS = {
  live: "https://api-m.paypal.com",
  sandbox: "https://api-m.sandbox.paypal.com",
};

/** Only an explicit "live" reaches production; anything else stays in sandbox. */
export function paypalHost() {
  return config.paypal.mode === "live" ? HOSTS.live : HOSTS.sandbox;
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function fetchAccessToken() {
  const { clientId, clientSecret } = config.paypal;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalHost()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    // Never log the response body here — a failed token call echoes back
    // request context that can include the client id.
    const err = new Error(`PayPal auth failed (${res.status})`);
    err.statusCode = 502;
    throw err;
  }

  cachedToken = json.access_token;
  cachedTokenExpiry = Date.now() + Math.max(0, (Number(json.expires_in) || 0) - 60) * 1000;
  return cachedToken;
}

async function accessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;
  return fetchAccessToken();
}

/**
 * Make an authenticated request to the PayPal REST API.
 *
 * @param {string} path - path after the host (e.g. "/v2/checkout/orders")
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {object} [options.body] - JSON body (auto-stringified)
 * @param {object} [options.query] - query params
 * @param {object} [options.headers] - extra headers (e.g. PayPal-Request-Id)
 * @param {boolean} [options.raw=false] - resolve to { status, body } instead of
 *   throwing on a non-2xx. Used where a specific error is expected and handled,
 *   such as re-capturing an already-captured order.
 * @returns {Promise<object>} parsed PayPal response body
 */
export async function paypalRequest(
  path,
  { method = "GET", body, query, headers = {}, raw = false, _retried = false } = {}
) {
  let url = `${paypalHost()}${path}`;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    url += `?${qs}`;
  }

  const token = await accessToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 (refunds, some payout calls) has no body to parse.
  const json = res.status === 204 ? {} : await res.json().catch(() => null);

  // A token can be revoked before its stated expiry. Drop the cache and retry
  // once so a long-lived process doesn't fail every call until restart.
  if (res.status === 401 && !_retried) {
    cachedToken = null;
    cachedTokenExpiry = 0;
    return paypalRequest(path, { method, body, query, headers, raw, _retried: true });
  }

  if (raw) return { ok: res.ok, status: res.status, body: json };

  if (!res.ok) {
    // PayPal's shape: { name, message, details: [{ issue, description }], debug_id }.
    const issue = json?.details?.[0]?.issue;
    const err = new Error(json?.message || `PayPal request failed (${res.status})`);
    err.statusCode = res.status;
    err.paypalIssue = issue || json?.name;
    err.paypalDebugId = json?.debug_id;
    throw err;
  }

  return json;
}

/** PayPal amounts are decimal strings in major units, always 2dp for our currencies. */
export function toPaypalAmount(major) {
  return Number(major).toFixed(2);
}

export default { paypalRequest, paypalHost, toPaypalAmount };
