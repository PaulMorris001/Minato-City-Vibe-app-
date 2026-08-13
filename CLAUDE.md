# Cityvibe

## Session start — do this first, every session

Before answering the first request, invoke all three project skills:

1. `session-efficiency` — token, context and tool-call discipline for this repo
2. `cityvibe-map` — feature-to-file map; consult it **before** searching for anything
3. `code-standards` — the engineering bar and house conventions for writing code

Invoke them via the Skill tool (`session-efficiency`, `cityvibe-map`,
`code-standards`). They live in `.claude/skills/`. Re-read `cityvibe-map` before
any exploration and `code-standards` before any edit.

## Repo shape

Four deployables in one repo:

| Dir | What | Run |
|---|---|---|
| `server/` | Express 5 + Mongoose + Socket.IO, ESM | `cd server && npm run dev` |
| `mobile/` | Expo + expo-router + TypeScript (the product) | `cd mobile && npm start` |
| `web/` | Vite + React public site (browse, auth, ticket checkout) | `cd web && npm run dev` |
| `admin/` | Vite + React admin console | `cd admin && npm run dev` |

## Non-negotiables (details in the skills)

- **Never** read `mobile/tsconfig.json`, or any of the 1000+ line screens/controllers, in full. Grep for the symbol, read a window around it.
- `mobile/` has ~3000 baseline `tsc` errors from a vendored blob — always filter output to the files you touched.
- Server model exports are **mixed**: `Booking`, `CatalogueCategory`, `Order`, `Service`, `City`/`VendorType`/`Vendor` are named exports; the rest are default. Wrong import shape fails only at runtime.
- Every router mounts at `/api/`, so auth is applied **per route**, never `router.use(authenticate)`.
- `:eventId` / `:userId` params can be slugs or shareTokens — use `utils/resolveEvent.js` / `utils/resolveUser.js`, not `findById`.
- `server/src/utils/response.js` is dead code despite the README. Controllers use `try/catch` + `res.status().json({ message })`.
- Mobile styling goes through `useThemedStyles` + `constants/theme.ts` tokens. No hardcoded hex in new code.
- Mobile HTTP goes through the plain `axios` default import — global timeout/retry/token-refresh live in `utils/apiClient.ts`.
- Payments: two collection providers (Stripe, Paystack) and only two settlement rails (Paystack NG, Stripe Connect US/UK/EEA/CA/CH); everywhere else has no rail by design. Deploy **server before mobile**.
- Migrations in `server/scripts/` and `server/src/scripts/` are manual — say so when a change needs one.
