---
name: code-standards
description: Engineering bar and house conventions for writing Cityvibe code — server (Express/Mongoose/ESM) and frontend (Expo/React Native, Vite/React). Load at the start of every session and re-read before writing or editing any code. Covers the think-first process, backend controller/route/model/payment conventions, mobile theming/navigation/data-fetching conventions, and the review pass to run before declaring work done.
---

# Code standards

Write code a senior engineer on this team would write: the smallest change that
fully solves the problem, in the idiom already present in the file.

## Think before implementing

For anything beyond a one-line fix, answer these **before** the first edit:

1. **Does this already exist?** Check `cityvibe-map`, then grep. This codebase has real duplication pressure — an events screen, a vendor screen and a guide screen all want the same card. Extend the shared thing; don't fork it.
2. **Where does it belong?** Server: route → controller → service → model, and business logic that more than one controller needs goes in `services/`. Mobile: screen files own layout and wiring; anything reused goes in `components/shared/`.
3. **What is the smallest correct change?** Prefer editing an existing function over adding a parallel one. New files need to earn their place.
4. **What breaks?** Who else imports this, which screens render it, is there a migration, does mobile need a matching change, does the server need to deploy first (for payments: **yes**).
5. **What is the failure mode?** Network drop, missing auth, empty list, a slug instead of an ObjectId, a seller in a country with no payout rail.

If steps 1–5 reveal the request is ambiguous in a way that changes the work, ask
**before** building. If it's ambiguous in a way that doesn't, pick the obvious
option, say so in one line, and continue.

## Universal rules

- **Match the file you're in.** Comment density, naming, error handling, import order. A file that uses `try/catch` + `res.status().json()` does not get a new handler wrapped in `asyncHandler`.
- **No defensive scaffolding for problems you don't have.** No new abstraction layer, no config flag, no `options` object with one caller. Add the second parameter when there is a second caller.
- **Comment the *why*, never the *what*.** The good comments in this repo explain a decision (why retries are capped at 2, why Wise was removed, why a route must be registered above another). `// set the user id` is noise — delete it.
- **No dead code.** Don't leave the old path commented out, don't add an unused export, don't add a `TODO` in place of doing it.
- **Never widen scope silently.** Fix the bug you were asked to fix. Note adjacent problems in your reply; don't drive-by refactor them.
- **Don't log secrets** — tokens, Stripe/Paystack keys, OTP codes, raw webhook bodies.

## Server (`server/`)

**ESM everywhere.** `"type": "module"`, so every relative import needs its `.js`
extension.

**Controller shape** — the real house pattern:

```js
/**
 * POST /orders
 * One line on what it does, plus any non-obvious invariant.
 */
export async function createOrder(req, res) {
  try {
    const { vendorId, items } = req.body;
    if (!vendorId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "vendorId and a non-empty items array are required" });
    }
    // ...
    return res.status(201).json({ order });
  } catch (err) {
    console.error("createOrder:", err);
    return res.status(500).json({ message: "Failed to create order" });
  }
}
```

- Named `export async function`, one per endpoint, JSDoc'd with its method + path.
- Validate inputs up front and return `400` with a message that names the offending field.
- **Do not** use `utils/response.js` — it is dead code across all 30 controllers.
- Error messages sent to clients are user-facing: no stack traces, no internal ids.

**Routes** — `routes/x.route.js` imports the named handlers, applies
`authenticate` (or `optionalAuth`) **per route**, exports the router default.
Register specific paths above parameterized ones and say so in a comment when the
ordering is load-bearing.

**Models** — check the export style before importing (see `cityvibe-map`
landmine #1). Snapshot prices onto orders/tickets at purchase time; never
recompute a historical total from the live `Service` doc.

**Money** — `computeSplit()` in `services/payments/split.js` works in **major**
units; convert to cents/kobo only at the provider boundary. Never trust an amount
from the client — re-derive it server-side. Every new purchasable type gets a
`fulfill*` function in `services/payments/fulfillment.js`; nothing else should
grant entitlements.

**Ids from params** — use `findEventByAnyId` / `resolveUserId` for anything that
a share link can reach.

**Config** — read through `src/config/env.js`, not `process.env`.

**Migrations** — a schema change that needs backfill ships with a script in
`server/scripts/` or `server/src/scripts/`, and you tell the user it must be run.

## Mobile (`mobile/`)

**Theming is not optional.** ~100 files already use it:

```tsx
const createStyles = (c: ThemeColors) => StyleSheet.create({ ... });  // module scope

export default function Screen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
}
```

The factory must be at module scope so its identity is stable. **No hardcoded hex
in new screen code** — pull from `constants/theme.ts` tokens. Deliberate
exceptions that already exist and should stay: auth/poster screens are pinned
dark, gradient tuples on `PrimaryButton`, and the vendor-details screen's own
palette in `constants/vendorServicesTheme.ts`.

**Navigation** — expo-router file-based routes under `app/`. Back buttons go
through `components/shared/GlassBackButton.tsx` / `GlassIconButton` (44 files
already do); use the `overMedia` variant on photo overlays. Account-root switches
go through `resetToAccountRoot` in `utils/navigation.ts` so the back stack is
reset.

**Data fetching** — call `axios` directly with the default import. Timeout,
retry/backoff and the `X-Refreshed-Token` handoff are installed globally in
`utils/apiClient.ts`; a bespoke axios instance would silently opt out of all of
it. If you add a POST endpoint that is safe to replay, add it to
`RETRYABLE_POSTS` there.

**State** — the four contexts (`Account`, `Cart`, `Theme`, `Unread`) are the
app's shared state. Don't add a fifth for something screen-local.

**UI** — reach for `components/shared/` before writing a new component; there are
already primitives for empty states, skeletons, avatars, bottom sheets, pickers,
buttons and image viewers. New screens show a skeleton from `components/skeletons/`
while loading and an `EmptyState` when there's nothing, not a bare spinner.

**Big screens** — `event/[id].tsx`, `chat/[id].tsx` and friends are thousands of
lines. Edit surgically inside them; do not "clean them up" as part of an
unrelated task.

## Web & admin (`web/`, `admin/`)

Vite + React + react-router. `web/` talks to the API via `src/lib/api.ts` and
`src/config.ts`; `admin/` via `src/api/client.ts` + `src/api/admin.ts`. Admin UI
composes from `admin/src/components/ui/` (`PageShell`, `Table`, `Modal`, `Badge`,
`Pagination`, `SearchInput`, `StatCard`) — new admin pages should look like the
existing ones with zero new primitives.

## Before you say it's done

1. Re-read your own diff. Remove anything that isn't needed for the change.
2. Type-check only what you touched: `cd mobile && npx tsc --noEmit 2>&1 | grep -F "<your-file>"` (the ~3000 baseline errors are noise).
3. Payments touched? Run `node --test server/src/services/payments/*.test.mjs`.
4. State plainly what you changed, what you verified, and what you did **not**
   verify. If something is untested or you skipped part of the ask, say so — do
   not round up to "done".
