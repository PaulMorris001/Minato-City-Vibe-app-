/**
 * NoSQL-injection sanitizer (Express 5 compatible).
 *
 * Mongoose query filters built from `req.body` / `req.query` / `req.params` are
 * vulnerable when an attacker can smuggle MongoDB operators into a value, e.g.
 * sending `{ "email": { "$ne": null } }` to bypass a lookup. The usual fix,
 * `express-mongo-sanitize`, reassigns `req.query` — but in Express 5 `req.query`
 * is a getter-only property, so that throws. This middleware instead mutates the
 * objects in place: it recursively removes any key that starts with `$` or
 * contains a `.` (Mongo's operator / dotted-path syntax), which neutralizes the
 * injection without replacing the request objects.
 *
 * Values themselves are left untouched — strings like a JSON-looking event
 * title are preserved (that's a content-validation concern, handled separately).
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Buffer.isBuffer(value);
}

function sanitizeInPlace(obj, removed) {
  if (!isPlainObject(obj)) return;

  if (Array.isArray(obj)) {
    for (const item of obj) sanitizeInPlace(item, removed);
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
      removed.push(key);
      continue;
    }
    sanitizeInPlace(obj[key], removed);
  }
}

export function sanitizeRequest(req, _res, next) {
  const removed = [];
  // req.body and req.params are safe to mutate. req.query is a getter in
  // Express 5 — we mutate the object it returns in place rather than reassigning.
  sanitizeInPlace(req.body, removed);
  sanitizeInPlace(req.params, removed);
  try {
    sanitizeInPlace(req.query, removed);
  } catch {
    // Some routers expose a frozen query object; ignore if we can't touch it.
  }

  if (removed.length) {
    console.warn(
      `[sanitize] stripped suspicious keys from ${req.method} ${req.path}: ${removed.join(", ")}`
    );
  }
  next();
}
