# Cityvibe

## Session start — do this first, every session

Before answering the first request, invoke all three project skills:

1. `session-efficiency` — token, context and tool-call discipline for this repo
2. `cityvibe-map` — feature-to-file map; consult it **before** searching for anything
3. `code-standards` — the engineering bar and house conventions for writing code

Invoke them via the Skill tool (`session-efficiency`, `cityvibe-map`,
`code-standards`). They live in `.claude/skills/`. Re-read `cityvibe-map` before
any exploration and `code-standards` before any edit.

## Session end — before you say the work is done

If the task changed the shape of the repo — added, moved, renamed or deleted a
file, changed a route or endpoint, added a migration, or turned up a non-obvious
invariant — invoke `map-sync` and update `cityvibe-map` to match. The map is the
first thing every session reads, so a stale one sends the next session
confidently to files that no longer exist. Skip it for changes that touch only
the inside of an existing function.

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
- Payments: collection is Stripe (outside Nigeria) or Paystack (Nigeria); settlement is Stripe Connect (US/UK/EEA/CA/CH) or Paystack (Nigeria), and everywhere else has no rail by design. PayPal is built but gated behind `PAYPAL_ENABLED` + credentials. Deploy **server before mobile**.
- Mongoose `toObject()` does **not** flatten `Map` fields (`toJSON()` does), and `JSON.stringify(new Map())` is `{}`. Use `toObject({ flattenMaps: true })` on anything with a Map path — this silently emptied every chat unread badge.
- Cancelling an event with tickets sold files a **request** for admin review (`Event.cancellationRequest`) and closes ticket sales; refunds only run from the admin approve endpoint. Only an event with nothing outstanding cancels outright.
- Whether tickets can be sold is `server/src/utils/eventLifecycle.js` and nowhere else. `date` is the start, `endDate` optional; with no end date the event runs until a day after `date`.
- Per-sale amounts are stored in **cents** for PayPal and Stripe, **major units** for Paystack, in the same `sellerNetCents`/`vendorNet` fields. `Payout.amount` is always major. Getting this wrong pays a seller 1% or 100× what they're owed.
- The Birthday Raffle's official rules (`mobile/app/birthday-raffle/rules.tsx`) are bundled, not fetched — App Store 5.3.2 requires them readable at all times and must state Apple is not a sponsor. Winners are a merit ranking by highest verified RSVPs (no ceiling above the minReferrals floor), not a random draw; changing the ranking or scoring means changing the rules text.
- A raffle winner's OurCityVibe credit (amount AND vendor lock) only reconciles when their rank changes (`setRaffleWinner`) or when a campaign's prizes/vendor assignment are edited (`updateRaffleCampaign` → `reconcileCampaignPrizeEdit`). Skipping that second call leaves already-picked winners credited/locked to the stale values.
- A raffle prize's credit can be vendor-locked: `RaffleCampaign.vendorNGN`/`vendorUSD` name the vendor each currency's winners may spend at (null = any vendor); the lock itself lives on the winner as `User.couponVendorNGN`/`couponVendorUSD`, one per currency, overwritten by whichever campaign they most recently won.
- A vendor has two different ids: `order.vendor`/`Service.vendor`/`RaffleCampaign.vendorNGN`/`vendorUSD` all store their **User account** id, but `GET /vendors/:vendorId` (vendor-details) looks up the separate **Vendor listing** doc's own `_id`. Converting between them means `Vendor.findOne({ user: <userId> })` — never assume the two are interchangeable.
- Raffle campaigns are concurrent monthly batches, not one-at-a-time: an `Event`'s campaign is whichever `RaffleCampaign` window contains its own `date` (the birthday), not `createdAt`. A birthday can be registered up to 6 months ahead (`birthdayRaffleDateError`) and sits "pending" until that month's campaign exists — `findCampaignForDate`/`syntheticMonthCampaign` in `raffleCampaign.service.js` resolve that; `getCurrentCampaign()` only ever means "whichever campaign covers today".
- Never `String()` a ref that might arrive populated to compare ids — a populated Mongoose Document stringifies to `"[object Object]"`, not its id. This silently broke the vendor-lock check in `reserveOrderCoupon` (`order.vendor` comes in populated). Normalize with `doc.field?._id || doc.field` first.
- An event can be in several cities: top-level `city`/`location` are only venue #1, the rest are `Event.additionalLocations`. Any "events in city X" query must also match `additionalLocations.city` (`eventCityFilter` in event.controller.js) or multi-venue events vanish from that city.
- Which venue an attendee picked is `locationIndex` (+ a name/city snapshot) on the **Attendance pass and the Ticket** — an index into `allVenues(event)`, because `additionalLocations` subdocs have no `_id`. Absent means "never asked" (single venue, old build, share page), never venue #1. Validate with `resolveVenueChoice()` in `utils/eventLocations.js`.
- That pick reaches fulfillment on the payment provider's own metadata — Stripe PI `metadata`, PayPal `custom_id`'s 5th field, `TicketOrder.items[].locationIndex` for batches. Only Paystack and the free-ticket path re-read it from the confirm body. Drop it from a provider's metadata and the capture webhook issues venue-less passes while the buyer's own confirm looks fine.
- Sub-events are a separate feature from multiple locations, mutually exclusive on one event: the main stop's `subEvent` id is always `null` (so old passes/tickets need no backfill), a priced stop can never be RSVP'd (must buy a ticket), and any event with a programme must buy tickets through the batch rail (`initTicketBatch`) — never the single-ticket rail, which has no per-stop concept and would permanently block later sub-event purchases.
- Migrations in `server/scripts/` and `server/src/scripts/` are manual — say so when a change needs one.
- Public events have two separate trust gates: the mobile Public toggle (`app/create-event/index.tsx`, née `CreateEventModal`) blocks on identity verification (`user.verified`) alone, client-side, even for free events; the server only enforces email + identity + payout, and only `if (isPublic && isPaid)`. Every "Get Verified" prompt there routes to `/public-event-verification`, not `/settings` — a version that pointed at `/settings` shipped briefly when `create-event/index.tsx` replaced `CreateEventModal` (the new file didn't carry the fix forward). `app/public-event-verification.tsx` surfaces all three (email/identity/payout) so ticket sales don't hit a gate nobody warned about, but finishing it doesn't itself unlock the Public toggle.
- The vendor dashboard's "Bookings" tab (`components/vendor/BookingsTab.tsx`) lists `Order` docs (`GET /orders/vendor`), not `booking.model.js` docs, despite the name. Its "Cancel Order" button (quoted/unpaid orders only) calls `PATCH /orders/:id/decline`, which now requires a `reason` and stores it on `Order.cancellationReason`.
- `event.image`/`event.images` can be video URLs (the gallery picker allows video) — always render them through `components/shared/MediaTile.tsx`, never a bare `<Image>`, or a video-only event silently shows nothing.
- `event.isPaid` only reflects the MAIN event's own price — a `subEvents` programme stop can charge (`stop.ticketPrice > 0`) even when the umbrella's `isPaid` is false. Any UI/query gating on "does this event sell tickets" must also check `subEvents.length > 0` (or call `hasProgramme(event)`), and each stop's ticket-sales toggle is its own endpoint (`PATCH /events/:eventId/sub-events/:subEventId/ticket-sales`), separate from the main event's `PATCH /events/:eventId/ticket-sales`. `initTicketBatch` and `resolvePurchase`'s ticket branch (`payments.controller.js`) both gated purchase entirely on `event.isPaid` and would 400 a real, priced sub-event stop on a nominally-free main event — fixed to gate on `event.isPaid || hasProgramme(event)` instead; `previewDiscountHandler` already had this right and was the reference for the fix.
- On a hidden-price event (`Event.hidePrice`), `ticketPrice: 0` means "no asking price", **not** free — `createEvent` lets a public paid event go on sale with no price and no tiers, and every ticket is then sold on the negotiated invoice alone. `stopRequiresPayment(event, stop)` in `server/src/utils/eventPricing.js` is the one answer to "does this stop cost money" (true for the main stop of any paid event; still false for a zero-price programme stop). Reading `stop.ticketPrice > 0` directly lets a stranger free-RSVP a ticketed event. `updateEvent` refuses to clear a *visible* paid event's price, and refuses to un-hide one with no live price — `hidePrice` applies immediately while a price edit waits for admin review.
- A `TicketOffer` is never "paid" — its status enum is only `requested|quoted|declined|cancelled`, and payment lives on the `TicketOrder` pointing back at it. Compute `paid` from that lookup (`getTicketOffer`, or `markPaidTicketOffers` for a page of chat messages) or the UI keeps offering "Pay" to someone who already paid. That populate needs a `toObject` transform, since `paid` isn't in the schema and would vanish off a Mongoose doc.
- Per-stop **tier** selection (not just which stops) lives in `mobile/components/shared/StopPicker.tsx` (`tierChoices`/`onTierChange`, radio-chip UI under a checked multi-tier stop) and, on web, `pages/Pay.tsx`'s per-slot inline tier picker (`makeStopSlot`/`updateSlot`) — the event page's own `ProgrammePicker.tsx` only picks WHICH stops, same as mobile's checklist row. Before this, both checkout paths silently always charged each stop's cheapest tier with no way to pick another.
