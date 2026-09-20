---
name: cityvibe-map
description: Feature-to-file map for the Cityvibe monorepo (mobile Expo app, Express/Mongo server, web Vite app, admin Vite app). Load at the start of every session and consult BEFORE searching for where anything lives — auth, events, passes, chat, vendors, catalogue, cart, orders, bookings, payments, payouts, earnings, guides, notifications, email, search, location, admin, uploads, jobs, migrations. Use it to jump straight to the right files instead of scanning the repo.
---

# Cityvibe feature map

Four deployables in one repo. Find the feature in the table, go straight to the
files. Only search if the feature is genuinely absent here.

| Dir | What | Run |
|---|---|---|
| `server/` | Express 5 + Mongoose + Socket.IO, ESM (`"type": "module"`) | `cd server && npm run dev` |
| `mobile/` | Expo + expo-router + TypeScript (the product) | `cd mobile && npm start` |
| `web/` | Vite + React public site — browse, auth, ticket checkout | `cd web && npm run dev` |
| `admin/` | Vite + React internal admin console | `cd admin && npm run dev` |

Server layout: `src/{routes,controllers,models,services,middleware,utils,jobs,config}`.
Mobile layout: `app/` (routes), `components/`, `contexts/`, `hooks/`, `services/`,
`utils/`, `libs/`, `constants/`. The `@/*` TS alias maps to the `mobile/` root.

## Landmines — read before touching the server

1. **Model exports are mixed.** `Booking`, `CatalogueCategory`, `Order`, `Service`, and `City`/`VendorType`/`Vendor` (all three in `vendor.model.js`) are **named** exports. Everything else is `export default`. A wrong import shape fails only at runtime — it has silently broken a migration script before.
2. **Every router mounts at `/api/`.** Auth is applied **per route** (`router.post("/x", authenticate, handler)`), never `router.use(authenticate)` — a router-level guard would 401 requests merely passing through to a later router.
3. **Route order matters.** Specific paths must be registered above parameterized ones (`/payments/init/tickets/:eventId` before `/payments/init/:type/:id`; `/guides/topics` before `/guides/:id`).
4. **Webhook raw-body parsers are registered before `express.json()`** in `src/index.js` for `/api/paypal/webhook`, `/api/paystack/webhook`, `/api/stripe/webhook`. Moving them breaks signature verification.
5. **`:eventId` / `:userId` params may be a slug or a shareToken**, not just an ObjectId — website share links depend on this. Use `utils/resolveEvent.js` (`findEventByAnyId`) and `utils/resolveUser.js` (`resolveUserId`). A bare `findById` 500s or fake-404s that traffic.
6. **`utils/response.js` (`sendSuccess`/`sendError`/`asyncHandler`) is dead code** — zero controllers use it, despite what the README claims. Match the real pattern: `try/catch` + `res.status(n).json({ message })`.
7. **`toObject()` does not flatten Mongoose Maps — `toJSON()` does.** A doc with a `Map` path serialized via `toObject()` keeps real `Map` values, and `JSON.stringify(new Map(...))` is `{}`. `withSupportMarkers` in `utils/supportAccount.js` hit this and silently shipped every chat's `unreadCount`/`isMuted`/`isArchived` as empty objects, which emptied every unread badge in the app. Use `toObject({ flattenMaps: true })` on `chat.model.js` or anything else with a Map field.
8. **Cancelling an event with tickets sold is a REQUEST, not an action.** `POST /events/:eventId/cancel` refunds immediately only when nothing is outstanding; otherwise it files `Event.cancellationRequest` (202) and closes ticket sales. Refunds run only from `PATCH /admin/event-cancellations/:id/approve`.
9. **Per-sale amounts are stored in CENTS for PayPal and Stripe, MAJOR units for Paystack**, all in the same `sellerNetCents` / `vendorNet` fields. PayPal's API speaks major units, so `settlePaypalPayment.js` converts on the way in *on purpose*: `currency` is USD for both PayPal and legacy Stripe sales and cannot tell them apart, so a major-unit PayPal net would be divided again by `toMajorNet` and `ticketPayoutAmount` and pay the seller 1% of what they are owed. `Payout.amount` is always major.
10. **Picking a raffle winner reconciles their credit (amount AND vendor lock) at pick time only.** `setRaffleWinner` trues up a winner's OurCityVibe credit balance and vendor lock against the campaign's CURRENT prize table and vendor assignment the moment a rank is set/changed — but if an admin later edits that campaign's prize *values* OR its `vendorNGN`/`vendorUSD` (`updateRaffleCampaign`), nothing about that save touches winners already picked, unless `reconcileCampaignPrizeEdit` runs too (it does, whenever prizes changed OR the vendor assignment changed). Skip that call and a corrected prize/vendor silently leaves already-notified winners credited (and vendor-locked) to the OLD values forever.
11. **A vendor has TWO different ids, and they are not interchangeable.** `order.vendor`, `Service.vendor`, and (deliberately, for the coupon lock — see #10) `RaffleCampaign.vendorNGN`/`vendorUSD` all store the vendor's **User account** id. `GET /vendors/:vendorId` (the mobile vendor-details screen) looks up the separate **Vendor listing** document by its OWN `_id` — a different id space entirely. Handing a User id to that endpoint 404s with no hint why. To go from one to the other, look up `Vendor.findOne({ user: <userId> })` (see `getUserById` in auth.controller.js, or `campaignVendor` in raffleCampaign.service.js) — never assume a "vendorId"-shaped field is directly navigable.
12. **Raffle campaigns run as concurrent monthly batches, not one-at-a-time.** An `Event`'s campaign is whichever `RaffleCampaign` window contains its own `date` field (the birthday itself) — **not** `createdAt`, and not "the current campaign". `createRaffleCampaign` no longer refuses a second `status:"active"` row; several months can be active simultaneously (`windowConflict` only refuses two campaigns whose *date ranges* actually overlap). `getCurrentCampaign()` now specifically means "whichever campaign's window contains today" (for generic/no-event displays) — use `findCampaignForDate(event.date)` for a specific entry, which returns `null` when nobody has created that month's campaign yet (pair with `syntheticMonthCampaign(date)` for a same-shaped placeholder). Event creation is gated by `birthdayRaffleDateError(date)` — the event's own date must be in the future and no more than `MAX_MONTHS_AHEAD` (6) months out — entirely independent of whether that month's campaign row exists, so a December birthday can be registered in August and sits "pending" until December's campaign is created.
13. **An event can be in several cities at once.** The top-level `location`/`address`/`city`/`state`/`country`/`geo` are only venue #1; `Event.additionalLocations` holds the parallel venues (one pass covers all). Any query that means "events in city X" must also match `additionalLocations.city` — `eventCityFilter()` in event.controller.js for the feeds/search, `findNearbyCityEvents` unwinds venues, and `engagementPush.job.js` uses an indexed `$or`. A bare `{ city }` silently hides multi-venue events from that city. `updateEvent` replaces the list only when `additionalLocations` is sent (web edit and old builds send venue #1 alone); going virtual clears it. Emails use `venueSummary()` from `utils/eventLocations.js`. A pass that named ONE venue uses `venueLabel()` instead — listing every venue would send that holder to the wrong door.

14. **An attendee's venue pick reaches fulfillment on the PAYMENT PROVIDER's own metadata, not the confirm body.** `locationIndex` rides Stripe's PI `metadata`, PayPal's `custom_id` (a 5th `|`-delimited field — `parseCustomId` tolerates its absence on pre-picker ids) and, for batches, the frozen `TicketOrder.items[].locationIndex`. Paystack and the free-ticket path have nowhere to keep it, so those two alone re-read it from the confirm body. Drop it from a provider's metadata and the buyer's own confirm still works while the **capture webhook** — the path that runs when the browser never comes back — issues passes with no venue, which reads as "never picked" on the guest list. `fulfillTicket` resolves the index against the live event and silently drops one that no longer names a venue: a paid ticket must not fail to issue over a venue label.

15. **Sub-events (`server/src/utils/subEvents.js`) are a DIFFERENT feature from multiple locations, and the two are mutually exclusive on one event.** `allStops(event)` returns `[mainStop, ...event.subEvents]` with the main stop's id always `null` — which is also what every `Attendance`/`Ticket`/`TicketOrder.items[]` record predating this feature carries in its `subEvent` field, so old data reads as "the main event" with no backfill. A **priced stop can never be RSVP'd** — `rsvpEvent`'s multi-select reconcile (`subEvents: (string|null)[]` in the body) rejects any selection containing a stop with a price, and **a programme event's tickets can only ever be bought through the batch rail** (`initTicketBatch`) — `resolvePurchase` outright refuses the single-ticket rail for any event with `subEvents.length`, because that rail's one-Ticket-per-`(event,user)` guard has no concept of *which stop*, so a main-event purchase there would permanently block every later sub-event purchase by the same buyer.
16. **`fulfillTicketOrder`'s discount-remainder used to land on the literal last item — now it lands on the last item WITH A NONZERO PRICE.** A mixed basket (a paid stop plus a free one) that ends on the free item would otherwise get charged the rounding remainder of a discount, silently billing a stop that was supposed to cost nothing. Any future change to that spread loop must preserve the "skip zero-price items when placing the remainder" rule.

## Auth & accounts

- Server: `routes/auth.route.js`, `controllers/auth.controller.js` (1796 lines — grep, don't read), `middleware/auth.middleware.js`
- Token renewal: the middleware silently reissues a token past a certain age on the `X-Refreshed-Token` response header; the client persists it in `mobile/utils/apiClient.ts`
- OTP + email verification: `controllers/verification.controller.js`, `services/verification.service.js`, `services/email.service.js`
- Guest checkout tokens (buy without an account): `controllers/guestCheckout.controller.js`
- Mobile: `app/login.tsx`, `app/signup.tsx`, `app/verify-otp.tsx`, `app/verify-signup-email.tsx`, `app/verify-email.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/onboarding.tsx`, `app/auth/google.tsx`; helpers `utils/googleAuth.ts`, `utils/appleAuth.ts`, `utils/requireAuth.ts`; UI in `components/auth/`
- Web: `web/src/pages/Login.tsx`, `Signup.tsx`, `web/src/context/AuthContext.tsx`
- Account deletion: `routes/deleteAccount.route.js`, `mobile/app/settings.tsx`, `web/src/pages/DeleteAccount.tsx`
- Both delete surfaces end at the web login's confirmation toast. The React page passes router state `{ notice: "account-deleted" }`; the legacy server-rendered page can only cross origins, so it 303s to `${PUBLIC_WEB_URL}/login?notice=account-deleted`. The `NOTICES` map in `web/src/pages/Login.tsx` is the shared key list — renaming a key there silently breaks the server redirect.
- Date of birth: `server/src/utils/dateOfBirth.js` + `mobile/utils/dateOfBirth.ts` (mirrored 13+ rule, the floor `mobile/app/terms.tsx` promises). Required by the mobile signup wizard's `dob` step, **optional server-side** so older builds and `web/src/pages/Signup.tsx` still register — those accounts are backfilled through the profile setup checklist tile → `mobile/app/edit-profile.tsx`. Flows register → `PendingSignup.dateOfBirth` → `User.dateOfBirth` at verifySignup. No backfill script exists or can exist.

**Client vs vendor account switch** is a mobile-side concept: `contexts/AccountContext.tsx`
(`activeAccount: "client" | "vendor"`, persisted in SecureStore) + `utils/navigation.ts`
(`resetToAccountRoot`). Client tabs live in `app/(tabs)/`, vendor tabs in `app/(vendor)/`.

## Users, social graph, moderation

- Follow: `routes/follow.route.js`, `controllers/follow.controller.js`, `utils/followCheck.js`, `utils/followCounts.js` → `mobile/app/followers.tsx`, `following.tsx`, `services/follow.service.ts`, `components/shared/FollowButton.tsx`
- Block / report: `controllers/block.controller.js`, `controllers/report.controller.js`, `utils/blockFilter.js`, `utils/contentFilter.js` → `mobile/app/blocked-users.tsx`, `components/shared/ReportBlockSheet.tsx`, `services/moderation.service.ts`
- Profiles: `controllers/user.controller.js` → `mobile/app/(tabs)/profile.tsx`, `app/user/[id].tsx`, `app/user-profile.tsx`
- Favorites: `controllers/favorites.controller.js` → `mobile/app/favorites.tsx`

## Events

- Server: `routes/event.route.js`, `controllers/event.controller.js` (2527 lines — grep for the exported handler), `models/event.model.js`, `utils/eventLifecycle.js`, `utils/eventLocations.js` (multi-venue — see Landmine #13)
- **When an event is over, and whether a ticket can be sold, is `utils/eventLifecycle.js` and nowhere else.** `date` is the start; `endDate` is optional and, when absent, the event runs until a day after `date` (door sales). `ticketSalesClosedReason()` returns `cancelled | cancellation_pending | ended | closed_by_organizer | not_approved | null`, and both purchase paths plus every read path go through it. `upcomingFilter()` is the `$or` that keeps a multi-day event in the feeds after it starts — it merges into `$and`, never spread next to another top-level `$or`.
- Organizer stop/resume switch: `PATCH /events/:eventId/ticket-sales` (`setTicketSales`, creator or co-host, applies immediately — not held in `pendingEdits`)
- Cancellation review: `POST /events/:eventId/cancel` (stripe.controller.js) → `Event.cancellationRequest` → the admin queue. `refundAllEventTickets()` in `stripe.controller.js` is the one refund loop both paths share.
- External/aggregated events: `controllers/externalEvent.controller.js`, `services/eventbrite.service.js`, `services/ticketmaster.service.js`, `models/externalEvent.model.js`, `models/eventbritePlace.model.js`
- `ExternalEvent.geo.type` must **not** carry `default: "Point"`. Upserts run with `setDefaultsOnInsert` on, so a default writes `geo: { type: "Point" }` with no coordinates for the many upstream events that ship no lat/lng, and the `2dsphere` index rejects the insert. The same trap applies to any new GeoJSON field.
- Mobile: `app/event/[id].tsx` (3482 lines), `app/manage-events.tsx`, `app/public-events.tsx`, `app/external-event/[id].tsx`, `app/event-attendees/[eventId].tsx`, `components/client/CreateEventModal.tsx`, `components/shared/AdditionalLocationsEditor.tsx` (extra venues, shared by create + edit), `components/shared/PublicEventCard.tsx`, `ExternalEventCard.tsx`, `hooks/useEventActions.ts`, `hooks/useDiscoverFeed.ts`, `utils/eventDetails.ts`
- Web: `web/src/pages/Events.tsx`, `EventDetails.tsx`, `ExternalEventDetails.tsx`, `MyEvents.tsx`, `EditEvent.tsx`
- Admin: `admin/src/pages/Events.tsx`, `PaidEvents.tsx`, `EventEdits.tsx`
- Birthday Raffle: `models/raffleCampaign.model.js`, `services/raffleCampaign.service.js`, `controllers/birthdayRaffle.controller.js`, `drawRaffleWinners`/`setRaffleWinner` in `admin.controller.js` → `mobile/app/birthday-raffle/{index,status,rules}.tsx`, `admin/src/pages/Raffle.tsx`
- **The raffle is a promotion with published official rules, and the code has to match them.** `mobile/app/birthday-raffle/rules.tsx` is the binding text; it is bundled (never fetched) because App Store guideline 5.3.2 requires it to be readable at all times, and it must state that Apple is not a sponsor. Winners come from `POST /admin/raffle/campaigns/:id/draw` — a **merit ranking**, not a random draw: the eligible entrants with the most verified RSVPs take the prize tiers highest-to-lowest, ties broken by whoever reached that count first (one prize per entrant, only their best-performing event competes). `minReferrals` is only a floor to be eligible at all — there is no ceiling. `setRaffleWinner` is a correction tool for a forfeited prize, NOT how winners are chosen. Changing the ranking, the scoring or the prize wording means changing the rules screen too.
- **Campaigns are monthly batches, matched by an entry's own `date` — see Landmine #12.** A user can register a birthday event for any month up to 6 months out; it competes in the current batch if dated this month, otherwise it's "pending" (surfaced by `GET /raffle/status`'s `pending: true`) until that month's campaign is created. `getRaffleStatus` in `birthdayRaffle.controller.js` picks one entry across all of a user's qualifying events to show (an already-decided winner first, then one currently competing, then the soonest pending one) — a user can hold several qualifying events across different months at once.
- **A raffle prize's credit can be vendor-locked.** `RaffleCampaign.vendorNGN`/`vendorUSD` (both `ref: "user"`, matching `Order.vendor`) name the vendor each currency's winners may spend at; `null` means any vendor, same as before this field existed. The lock actually lives on the WINNER, not the campaign — `User.couponVendorNGN`/`couponVendorUSD`, refreshed by `reconcileWinnerCoupon` in admin.controller.js. One lock per currency, not a per-award ledger: winning a later campaign with a different vendor overwrites it, even over leftover balance from an earlier win.

## Passes, tickets, check-in

One unified concept: **every** RSVP and every paid ticket issues a QR entry pass.

- `services/pass.service.js` → `issueEventPass()`, `computeAttendanceStatus()`
- `models/attendance.model.js`, `models/ticket.model.js`, `models/ticketOrder.model.js`
- `routes/attendance.route.js`, `controllers/attendance.controller.js`, `utils/qrcode.js`
- `services/eventSignups.service.js` — `buildEventSignups()`, the one guest-list answer behind both `GET /events/:eventId/signups` (organizer) and `GET /admin/events/:id/signups` (admin). Two gates, one body: an admin token is signed with a different secret and can never satisfy `authenticate`.
- **Which venue an attendee picked lives on the PASS and the TICKET, as `locationIndex` + a `locationName`/`locationCity` snapshot.** The index is into `allVenues(event)` (0 = the event's own location) because `additionalLocations` subdocs are `_id: false` and `updateEvent` replaces the whole array — no id would be stable. `resolveVenueChoice()`/`venueOptions()` in `utils/eventLocations.js` validate and list them; absent is a real value meaning "never asked" (single-venue event, old app build, server-rendered share page), never venue #1. The per-venue breakdown in `buildEventSignups` is counted off passes, not tickets — one pass is one body at one door.
- Mobile: `app/passes.tsx`, `app/scan.tsx`, `app/check-in/[eventId].tsx`, `app/event-attendees/[eventId].tsx`, `components/shared/EventQRModal.tsx`, `components/shared/VenuePicker.tsx` (`eventVenues`/`needsVenuePick` mirror `allVenues`), `utils/qrShare.ts`
- Web: `web/src/components/VenueChoice.tsx` (`eventVenues`/`venueCount`/`venueLabel`) — the venue radios on `EventDetails.tsx` (RSVP) and per ticket in `Pay.tsx`
- Sub-events (the programme feature): `server/src/utils/subEvents.js` (`allStops`/`findStop`/`stopLabel`/`normalizeSubEvents`), used by `event.controller.js`'s `createEvent`/`updateEvent`/`rsvpEvent` (the `reconcileStopRsvp` multi-select path) and `payments.controller.js`'s `initTicketBatch`. Mobile: `components/shared/SubEventsEditor.tsx` (authoring), `components/shared/StopPicker.tsx` (`eventStops`/`selectionTotal`, the RSVP-or-pay checkbox sheet on `app/event/[id].tsx`), `components/shared/TicketTiersEditor.tsx` (extracted from the old create-event modal, also used by the `tiers` sub-event screen). Web: `components/ProgrammePicker.tsx` (mirrors `StopPicker.tsx`), wired into `EventDetails.tsx`'s `TicketBox` and `Pay.tsx`'s `programmeMode` slot-seeding path.

## Chat & messaging

- Server: `routes/chat.route.js`, `controllers/chat.controller.js`, `services/chat.service.js` (1022 lines), `services/socket.service.js`, `models/chat.model.js`, `models/message.model.js`
- **Client and vendor inboxes are separate.** `Chat.context` + `vendorParticipant` split them; `/chats` takes a `scope` param. Do not merge them.
- `POST /chats/direct` with `{ otherUserId, context: "vendor", vendorUserId }` opens a business thread. A vendor-context chat is **exempt from the mutual-follow gate** that blocks ordinary DMs, so a customer can message a business cold. Entry points: the vendor profile's Message button and the order flow.
- Mobile: `app/chat/[id].tsx` (3130 lines), `app/(tabs)/chats.tsx`, `app/(vendor)/chats.tsx`, `app/messages.tsx`, `components/chat/*`, `components/vendor/VendorChatsTab.tsx`, `services/chat.service.ts`, `services/socket.service.ts`, `utils/chatHelpers.ts`, `chatDisplay.ts`, `messageText.ts`, `reactions.ts`, `contexts/UnreadContext.tsx`

## Vendor discovery & vendor account

Discovery is three levels: **City → VendorType → Vendor** (all in `models/vendor.model.js`).

- Server: `routes/vendor.route.js`, `controllers/vendors.controller.js`, `controllers/verification.controller.js`
- Mobile discovery: `app/(tabs)/vendors.tsx`, `app/vendor-types/[cityId].tsx`, `app/vendor-list/[cityId]/[typeId].tsx`, `app/vendor-details/[vendorId].tsx`, `components/vendor-details/*`
- Mobile vendor-side: `app/(vendor)/{dashboard,services,bookings,chats,account}.tsx` — each is a thin shell over `components/vendor/{DashboardTab,ServicesTab,BookingsTab,VendorChatsTab,AccountTab}.tsx`
- Onboarding: `app/vendor-setup.tsx`, `components/client/BecomeVendorModal.tsx`
- Web/admin: `web/src/pages/VendorProfile.tsx`, `admin/src/pages/Vendors.tsx`, `VendorTypes.tsx`, `Cities.tsx`, `Verifications.tsx`
- The vendor-details screen uses its **own** palette (`mobile/constants/vendorServicesTheme.ts`), not the global theme tokens
- Its header carries the **Message** button that opens the client↔vendor chat (see Chat & messaging); it sits there rather than in the about card because that card only renders when the vendor has a description or social links
- `/vendor-details/[vendorId]` takes the **Vendor listing's own `_id`**, not the vendor's User account id that `order.vendor`/`Service.vendor` use — see Landmine #11 for how to convert between the two

## Catalogue → cart → order → booking

Two-level catalogue: `CatalogueCategory` (`kind: "product" | "service"`) contains `Service` items.

- Server: `routes/catalogueCategory.route.js` + `controllers/catalogueCategory.controller.js`; `routes/service.route.js` + `controllers/service.controller.js`; `routes/order.route.js` + `controllers/order.controller.js`; `routes/booking.route.js` + `controllers/booking.controller.js`
- Order lifecycle: client checks out a cart against **one** vendor → server re-derives every price from live `Service` docs (never trusts the client) → `Order(status:"requested")` → an order card is posted into the vendor chat → vendor quotes → client confirms → pays. `computeTotals()` in `order.controller.js` is the authority on totals.
- Mobile: `app/cart.tsx`, `contexts/CartContext.tsx`, `app/order-confirm/[orderId].tsx`, `app/bookings.tsx`, `components/vendor/{ServicesTab,ServiceModal,CategoryModal,BookingsTab}.tsx`
- The order card in chat is keyed by the message **sender** — relevant whenever chat rendering changes.

## Payments

**Two independent decisions**, both in `services/payments/resolveProvider.js`:

- **Collection** (`getPayoutProvider`) — how the buyer is charged. Stripe (card/USD, into the platform balance) or Paystack (NGN local methods, Nigeria only at launch).
- **Settlement** (`getSettlementProvider`) — how the seller is paid out after admin approval. Two live rails: **Paystack transfers** (Nigeria) and **Stripe Connect** (US/UK/EEA/CA/CH). Everywhere else returns `null` — an honest "not available yet", not a fallback. Wise was deleted Aug 2026; do not reintroduce a default rail.
- **PayPal is built but OFF.** `PAYPAL_ENABLED=true` plus both credentials turns it on for collection AND settlement at once; until then nothing routes to it and every function behaves as it did before PayPal existed. Server + mobile only — the web checkout has no PayPal path yet.
- **When the flag is thrown, a seller already onboarded on Connect keeps Connect.** Moving them would read as un-onboarded and block their paid listings. That rule is in `getSettlementProvider` and pinned by a test.
- The mobile mirror of these rollout knobs is `mobile/constants/payments.ts` — **keep them in sync**, including the PayPal exclusion list when it goes live.

Unified purchase API (`routes/payments.route.js`):

```
GET  /payments/config                      paystack public key only; hosted flows need no key
GET  /payments/paypal/return               bounce page → app scheme (?web=1 closes the popup)
GET  /payments/paystack/return             same, for Paystack
POST /payments/guest/start-otp | verify-otp guest checkout, rate-limited
POST /payments/discount/preview             no side effects, accepts guest tokens
POST /payments/init/tickets/:eventId        batch/gift tickets — MUST stay above the generic route
POST /payments/confirm/tickets/:eventId
POST /payments/init/:type/:id               :type ∈ ticket | guide | booking | order
POST /payments/confirm/:type/:id
```

- Controllers: `payments.controller.js`, `paypal.controller.js`, `paypalPayout.controller.js`, `paystack.controller.js`, `stripe.controller.js` (refunds only)
- PayPal REST client: `config/paypal.js` (`paypalRequest`, cached OAuth token, `toPaypalAmount`). No SDK — same reasoning as `config/paystack.js`.
- **`confirm` on PayPal captures the money**, it doesn't just verify it. An approved-but-uncaptured order expires and nobody is charged, which is why the web poll and the mobile rescue re-probe are safe to retry.
- `services/payments/fulfillment.js` — `fulfillTicket`, `issueRecipientTicket`, `fulfillGuide`, `fulfillBooking`, `fulfillOrder`, `formatAmountText`. **Every** successful payment lands here; new purchasable types get a `fulfill*` function.
- `services/payments/settlePaypalPayment.js` — the one settlement path shared by the confirm call and the capture webhook, so the two can race safely. `settleStripePayment.js` is its draining equivalent.
- `services/payments/split.js` — `computeSplit()` in **major** currency units; subunit conversion (cents/kobo) happens at each provider boundary.
- `services/payments/{sellingEligibility,discount,earnings,payout}.service.js`
- Unit tests actually run here: `node --test server/src/services/payments/*.test.mjs`
- Discounts: `models/discountCode.model.js`, `discountRedemption.model.js`, `controllers/discountAdmin.controller.js`, `jobs/discountReservation.job.js`, `admin/src/pages/DiscountCodes.tsx`
- Earnings & payouts: `routes/earnings.route.js` (`/earnings/{summary,sales,payouts}`, seller is always `req.user.id`, never a param), `controllers/payoutAdmin.controller.js`, `models/payout.model.js`, `jobs/payoutRelease.job.js` → `mobile/app/earnings.tsx`, `components/shared/EarningsHero.tsx`, `admin/src/pages/Payouts.tsx`
- PayPal payout onboarding is one email field — no hosted KYC flow, no account id: `controllers/paypalPayout.controller.js` → `mobile/app/paypal-payout-onboarding.tsx`. Paystack's is a bank capture: `app/paystack-onboarding.tsx`.
- **A PayPal payout marked "paid" only means "submitted"** — the Payouts API accepts a batch as PENDING and moves money later. `reconcilePaypalPayouts()` in `jobs/payoutRelease.job.js` polls for the terminal state, stamps `Payout.settledAt` on success and reopens the payout on a DENIED/RETURNED.
- Mobile checkout: `hooks/usePayment.ts` (was `useStripePayment.ts`) — Stripe native sheet, or a browser session for Paystack/PayPal; branches on `init.provider`
- Web checkout: `web/src/pages/Pay.tsx` (Stripe.js + Paystack popup-and-poll; provider inferred from the event currency)
- **Deploy order: server before mobile.**
- OurCityVibe credit — earned from Birthday Raffle wins, spent at checkout against an Order in the SAME currency (no NGN/USD conversion; 1 credit = 1 unit of its own currency) AND, if the winning campaign assigned one, only at that ONE vendor (`Order.vendor` must match `User.couponVendorNGN`/`couponVendorUSD` — see the raffle Landmine above): `services/payments/coupon.service.js` (`reserveOrderCoupon`, `refundOrderCoupon`, `adjustCouponBalance`, `setCouponVendorLock`, `expireStaleCoupons`), `User.couponBalanceNGN`/`couponBalanceUSD` (+ their `*UpdatedAt` twins, used only for the 30-day expiry sweep), `Order.couponApplied`, `jobs/couponExpiration.job.js` → `mobile/app/wallet-rewards.tsx` (reached from the profile menu's "Wallet & Rewards" row in `app/(tabs)/_layout.tsx`)
- Credit history ledger — every balance change above also writes a row here; this collection is read-only history, never the balance's source of truth: `models/couponTransaction.model.js`, `controllers/wallet.controller.js`, `GET /wallet/credit-history` (`routes/wallet.route.js`) → rendered below the card on `mobile/app/wallet-rewards.tsx`
- Shared components: `mobile/components/shared/CreditCard.tsx` (the animated card the balance renders as) and `RaffleWinnerPopup.tsx` (the one-time "you won" modal — used by both `birthday-raffle/index.tsx` and `birthday-raffle/status.tsx` since the winner notification deep-links to the latter)

## Guides (city guides, purchasable)

`routes/guide.route.js`, `controllers/guide.controller.js`, `models/guide.model.js`
→ `mobile/app/guide/[id].tsx`, `guide/create.tsx`, `guide/edit/[id].tsx`, `guide/city/[id].tsx`,
`app/my-guides.tsx`, `app/saved-guides.tsx`, `components/shared/GuideCard.tsx`,
`admin/src/pages/Guides.tsx`. Purchases fulfil through `fulfillGuide`.

## Notifications & email

- Push + in-app: `services/notification.service.js` (`notifyUser`, `sendPushNotification` — Firebase Admin + `expo-server-sdk`), `routes/notification.route.js`, `models/notification.model.js` → `mobile/app/notifications.tsx`, `utils/pushNotifications.ts`
- Email: `services/email.service.js` (nodemailer) — `sendPasswordResetOTP`, `sendSignupVerificationOTP`, `sendGuestCheckoutOTP`, `sendEventPassEmail`, `sendEventReminderEmail`, `sendPasswordResetSuccessEmail`, `sendSaleEmail`, `sendPurchaseReceiptEmail`, `sendEventCancelledEmail`, `sendEventCancellationApprovedEmail`, `sendPayoutSentEmail`. Unsubscribe: `routes/unsubscribe.route.js`.
- Admin broadcasts: `controllers/announcement.controller.js`, `models/announcement.model.js` → `admin/src/pages/Announcements.tsx`. Routes: `GET|POST /admin/announcements`, `GET /admin/announcement-groups` (derived cohorts, currently just vendors — no group collection exists), `POST /admin/announcements/preview` (no side effects; reach shown before an irreversible send). Fans out through `notifyUser()`, never `sendPushNotification` directly, so a recipient with a dead token still gets the in-app record.
- **Announcement targets OR together, so each one added WIDENS the audience.** Countries/states/cities match `location.*` (states and cities qualified by their parent), and a city additionally matches `pushCity` — which carries no country/state, so it can only be matched on name. The console's dropdowns are built from the `City` collection while accounts store free-text `location.state` (`"CA"` alongside `"Lagos"`), so a target can legitimately match nobody; that is what the preview endpoint exists to surface.
- `sendPushNotification(token, title, body, data, { userId })` — pass `userId` and a token FCM rejects as dead is cleared, so the next launch re-registers. Chat pushes honour `chat.isMuted`; support-chat messages additionally go through `notifyUser` (type `support_message`) so a missed push still leaves a trace.
- Mobile re-uploads a rotated FCM token via `messaging().onTokenRefresh` in `app/_layout.tsx` → `uploadPushToken()`; `getPushPermissionStatus()` backs the "notifications are off" row in `app/settings.tsx`.
- Dev note: on some ISPs (MTN) SMTP is blocked outright — `ETIMEDOUT` on `smtp.gmail.com:587` is the network, not the code. Dev OTP is `000000`; guest-OTP tolerates mail failure in dev.

## Search, location, uploads, misc

- Search: `routes/search.route.js`, `controllers/search.controller.js`, `services/userSearch.js`, `utils/escapeRegex.js` → `mobile/app/search.tsx`, `app/search-users.tsx`, `services/search.service.ts`
- Location (CSC API proxied through the server): `routes/location.route.js`, `controllers/location.controller.js` → `mobile/hooks/useLocation.ts`, `useActiveCity.ts`, `utils/location.ts`, `components/shared/{LocationPicker,LocationPickerSheet,LocationFilterBar,ActiveLocationChip}.tsx`
- Uploads: `routes/upload.route.js` (mounted at `/api/upload`), `middleware/upload.middleware.js`, `config/cloudinary.js`, `services/image.service.js`, `utils/mediaLimit.js` → `mobile/utils/imageUpload.ts`, `media.ts`, `components/shared/{ImagePickerButton,MultiImagePicker,MediaTile}.tsx`
- Deep links / share: `routes/deepLinks.route.js` (687 lines — server-rendered share pages), `utils/slug.js` → `mobile/app/share/[token].tsx`, `utils/deepLinkParser.ts`, `shareLinks.ts`, `pendingDeepLink.ts`
- Logging: `routes/log.route.js` (client → server) → `mobile/utils/remoteLog.ts`, `logger.ts`, `errorHandler.ts`
- `errorHandler.ts` monkey-patches `console.error` / `console.warn` to forward to `remoteLog`, so **a `[MOBILE ERROR]` line in the server log stream is a phone's console, not a server fault**. Production builds strip `console.log`, so this relay is the only device diagnostic there is.
- Legal/compliance: `routes/{privacy,csae}.route.js`, `mobile/app/{privacy,terms}.tsx`, `web/src/pages/{Privacy,Csae}.tsx`
- How-to manual (event creation, guides, vendors): content authored once in `server/src/content/manual.js`, served public by `routes/manual.route.js` (`GET /manual`, `GET /manual/:slug`) → `mobile/app/help/{index,[slug]}.tsx` and `web/src/pages/{Help,HelpTopic}.tsx`. Both clients fetch it; nothing is bundled, so a copy edit needs no app release. Entry points: mobile Settings → "How it works", vendor AccountTab, CreateEventModal.

## Admin console

`routes/admin.route.js` + `controllers/admin.controller.js` (959 lines) + `middleware/admin.middleware.js`
→ `admin/src/pages/*` (Dashboard, Users, Events, PaidEvents, EventEdits, EventCancellations,
Announcements, Vendors, VendorTypes, Cities, Guides, Payouts, DiscountCodes, Reports,
Verifications, Analytics, Raffle), shared UI in `admin/src/components/ui/` — though the review-queue
pages (EventEdits, EventCancellations) use inline styles + `constants/colors`, not those primitives.

Broadcast + cancellation review live in their own controllers, not `admin.controller.js`'s siblings:
`GET|POST /admin/announcements` and `GET /admin/event-cancellations` +
`PATCH /admin/event-cancellations/:id/{approve,reject}`.

`GET /admin/events/:id/signups` (`getEventSignupsAdmin`) is who's going to an event and to which
venue — the Attendees modal on `admin/src/pages/Events.tsx`. It delegates to
`services/eventSignups.service.js`, the same function the organizer's endpoint uses.

## Background jobs & one-off scripts

Started from `server/src/index.js`: `eventReminder.job.js`, `payoutRelease.job.js`,
`externalEventsRefresh.job.js`, `discountReservation.job.js`, `engagementPush.job.js`
(the "come see what's on" nudge — Mon/Wed/Fri/Sat at 18:00 UTC, 36h minimum gap per user),
`couponReservation.job.js` (releases an OurCityVibe credit reservation abandoned mid-checkout),
`couponExpiration.job.js` (sweeps a credit balance to 0 after 30 days untouched — see Payments).

Migrations — **these must actually be run against each environment**, they are not automatic:
`server/scripts/{backfill-slugs,migrate-catalogue-categories,ingest-eventbrite,hash-admin-password,verify-oauth-accounts}.mjs`
and `server/src/scripts/{migrateVendorChatContext,migrateGuideSalesLedger,migrateDropWise,migratePayoutProvider,setupSupportAccount}.mjs`.

`migratePayoutProvider.mjs` is the Stripe→PayPal cutover script: it reports the sellers who lose payout capability until they add a PayPal address (no script can add it for them) and the Stripe payouts still to drain. Run it with `--dry-run` first.

## Config

- Server: `src/config/env.js` is the single source of truth (also `db.js`, `paypal.js`, `paystack.js`, `stripe.js`, `cloudinary.js`). Read env through it, not `process.env` — the one deliberate exception is `services/payments/resolveProvider.js`, which reads `process.env` directly to stay test-setup-free.
- Mobile: `constants/constants.ts` (`BASE_URL`), `constants/theme.ts`, `colors.ts`, `payments.ts`, `fonts.ts`, `support.ts`, `vendorChrome.ts`, `vendorServicesTheme.ts`
- Web/admin: `web/src/config.ts`, `admin/src/api/client.ts`
