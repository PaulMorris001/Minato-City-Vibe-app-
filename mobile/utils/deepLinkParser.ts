/**
 * Deep link parser — single source of truth for turning a URL into an Expo
 * Router target. Pure function; no side effects. Callers (e.g. `app/_layout.tsx`
 * and tests) hand it any url they receive (from `Linking.getInitialURL`, the
 * `url` event, a notification payload, or a manual deep link in dev) and
 * either route on the result or no-op on `null`.
 *
 * Recognized URLs:
 *   https://api.ourcityvibe.com/event/<x>   → /event/[id]   (id = x)
 *   https://api.ourcityvibe.com/guide/<x>   → /guide/[id]   (id = x)
 *   https://api.ourcityvibe.com/share/<t>   → /share/[token] (token = t)
 *   mobile://event/<x>                          → /event/[id]
 *   mobile://guide/<x>                          → /guide/[id]
 *   mobile://share/<t>                          → /share/[token]
 *
 * Everything else (other hosts, other schemes, unknown kinds, empty segments,
 * malformed encoding) returns null so callers can ignore safely.
 */

export type DeepLinkPathname =
  | "/event/[id]"
  | "/guide/[id]"
  | "/share/[token]";

export interface ParsedDeepLink {
  pathname: DeepLinkPathname;
  params: Record<string, string>;
}

// New canonical host plus the legacy Render host, so share links created
// before the domain move still open the app during the transition.
const ALLOWED_HTTPS_HOSTS = new Set([
  "api.ourcityvibe.com",
  "night-vibe.onrender.com",
]);
const APP_SCHEME = "mobile:";
const MAX_IDENTIFIER_LEN = 128;

// Whitelist of recognized first segments → which pathname they map to and the
// param name to use. Keeps the parser declarative and easy to extend.
const KIND_TO_ROUTE: Record<
  string,
  { pathname: DeepLinkPathname; paramName: string }
> = {
  event: { pathname: "/event/[id]", paramName: "id" },
  guide: { pathname: "/guide/[id]", paramName: "id" },
  share: { pathname: "/share/[token]", paramName: "token" },
};

const isSafeIdentifier = (raw: string): boolean => {
  if (!raw) return false;
  if (raw.length > MAX_IDENTIFIER_LEN) return false;
  // No whitespace; everything else (alphanum, hyphen, underscore, hex, etc.)
  // is fine — the destination route does its own validation.
  return !/\s/.test(raw);
};

export function parseDeepLink(
  url: string | null | undefined
): ParsedDeepLink | null {
  if (!url || typeof url !== "string") return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Build the list of path segments. For the custom `mobile://` scheme,
  // `new URL("mobile://event/abc")` parses `event` into `host` and `/abc` into
  // `pathname` — so prepend the host as the first segment.
  let segments: string[];
  if (parsed.protocol === "https:") {
    if (!ALLOWED_HTTPS_HOSTS.has(parsed.host)) return null;
    segments = parsed.pathname.split("/").filter(Boolean);
  } else if (parsed.protocol === APP_SCHEME) {
    const head = parsed.host ? [parsed.host] : [];
    segments = [...head, ...parsed.pathname.split("/").filter(Boolean)];
  } else {
    return null;
  }

  if (segments.length < 2) return null;
  const kind = segments[0].toLowerCase();
  const route = KIND_TO_ROUTE[kind];
  if (!route) return null;

  let identifier: string;
  try {
    identifier = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
  if (!isSafeIdentifier(identifier)) return null;

  return {
    pathname: route.pathname,
    params: { [route.paramName]: identifier },
  };
}

/**
 * Cheap predicate used by callers that only care whether a URL is one of
 * ours (e.g. to avoid logging unrelated URLs). Equivalent to
 * `!!parseDeepLink(url)` and slightly more efficient for the common case.
 */
export const isAppDeepLink = (url: string | null | undefined): boolean =>
  parseDeepLink(url) !== null;
