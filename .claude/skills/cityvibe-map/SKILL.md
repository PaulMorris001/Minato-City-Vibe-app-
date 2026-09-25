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
13. **Two different, non-overlapping trust gates guard public events, and only one of them is enforced server-side.** The mobile Public toggle (`app/create-event/index.tsx`, née `CreateEventModal`) blocks itself on `user.verified` (identity verification) alone — a client-only rule with no server counterpart for a public *free* event. The server's own gate in `createEvent` (event.controller.js, "Trust gates for sellers") only fires `if (isPublic && isPaid)` and additionally requires `emailVerifiedAt` and a completed payout destination. Every "Get Verified" prompt there sends the user to `app/public-event-verification.tsx` (a landing page) → `app/public-event-verification-steps.tsx` (a 3-step wizard: email → identity → payout, each step embedding the same submit flow as its standalone screen — see `components/verification/`) so an organizer isn't blocked by the payout gate a second time the moment they turn on ticket sales. Completing the wizard's payout step does not itself change whether the Public toggle unlocks — only approved identity verification does, asynchronously, after human review.
14. **An event can be in several cities at once.** The top-level `location`/`address`/`city`/`state`/`country`/`geo` are only venue #1; `Event.additionalLocations` holds the parallel venues (one pass covers all). Any query that means "events in city X" must also match `additionalLocations.city` — `eventCityFilter()` in event.controller.js for the feeds/search, `findNearbyCityEvents` unwinds venues, and `engagementPush.job.js` uses an indexed `$or`. A bare `{ city }` silently hides multi-venue events from that city. `updateEvent` replaces the list only when `additionalLocations` is sent (web edit and old builds send venue #1 alone); going virtual clears it. Emails use `venueSummary()` from `utils/eventLocations.js`. A pass that named ONE venue uses `venueLabel()` instead — listing every venue would send that holder to the wrong door.
15. **An attendee's venue pick reaches fulfillment on the PAYMENT PROVIDER's own metadata, not the confirm body.** `locationIndex` rides Stripe's PI `metadata`, PayPal's `custom_id` (a 5th `|`-delimited field — `parseCustomId` tolerates its absence on pre-picker ids) and, for batches, the frozen `TicketOrder.items[].locationIndex`. Paystack and the free-ticket path have nowhere to keep it, so those two alone re-read it from the confirm body. Drop it from a provider's metadata and the buyer's own confirm still works while the **capture webhook** — the path that runs when the browser never comes back — issues passes with no venue, which reads as "never picked" on the guest list. `fulfillTicket` resolves the index against the live event and silently drops one that no longer names a venue: a paid ticket must not fail to issue over a venue label.
16. **Sub-events (`server/src/utils/subEvents.js`) are a DIFFERENT feature from multiple locations, and the two are mutually exclusive on one event.** `allStops(event)` returns `[mainStop, ...event.subEvents]` with the main stop's id always `null` — which is also what every `Attendance`/`Ticket`/`TicketOrder.items[]` record predating this feature carries in its `subEvent` field, so old data reads as "the main event" with no backfill. A **priced stop can never be RSVP'd** — `rsvpEvent`'s multi-select reconcile (`subEvents: (string|null)[]` in the body) rejects any selection containing a stop with a price, and **a programme event's tickets can only ever be bought through the batch rail** (`initTicketBatch`) — `resolvePurchase` outright refuses the single-ticket rail for any event with `subEvents.length`, because that rail's one-Ticket-per-`(event,user)` guard has no concept of *which stop*, so a main-event purchase there would permanently block every later sub-event purchase by the same buyer. Both `initTicketBatch` and `resolvePurchase`'s ticket branch used to gate purchase on the umbrella's own `event.isPaid`, which 400'd a real purchase of a priced stop on a nominally-free main event (free main + one priced sub-event, the same case `previewDiscountHandler` already handled correctly) — fixed to gate on `event.isPaid || hasProgramme(event)` instead; per-stop price/tier is still resolved and validated server-side via `resolveTicketTier(stop, tierId)` regardless.
17. **`fulfillTicketOrder`'s discount-remainder used to land on the literal last item — now it lands on the last item WITH A NONZERO PRICE.** A mixed basket (a paid stop plus a free one) that ends on the free item would otherwise get charged the rounding remainder of a discount, silently billing a stop that was supposed to cost nothing. Any future change to that spread loop must preserve the "skip zero-price items when placing the remainder" rule.
18. **A TicketOffer is never "paid" — its status enum has no such value.** `requested | quoted | declined | cancelled` is the whole lifecycle; payment is recorded on the `TicketOrder` whose `ticketOffer` field points back at it, which is why `getTicketOffer` computes `paid` from a separate lookup rather than reading the offer. Anything rendering an offer has to do the same or it goes on offering "Pay" to someone who already paid — `markPaidTicketOffers` in `chat.service.js` is the batched version for a page of chat messages. That populate uses a `toObject` transform on purpose: `paid` is not in the schema, so it would vanish off a populated Mongoose document (same trap as Landmine #7).
19. **On a hidden-price event, `ticketPrice: 0` means "no asking price", NOT "free".** `createEvent` lets a public paid event go on sale with no price and no tiers when `hidePrice` is true — every ticket is then sold on the negotiated invoice alone, and `event.isPaid` is the only thing separating it from a free event. `stopRequiresPayment(event, stop)` in `utils/eventPricing.js` is the one answer to "does this stop cost money": true for the MAIN stop of any paid event whatever its price, and still false for a zero-price programme stop (those carry no `isPaid` of their own and stay free RSVP stops). Read `stop.ticketPrice > 0` directly and a stranger free-RSVPs a ticketed event — that is exactly what `reconcileStopRsvp` did. Two guards keep the state honest: `updateEvent` refuses to clear the price of a *visible* paid event, and refuses to un-hide one that has no live price, because `hidePrice` applies immediately while a price edit is held for admin review.

## Auth & accounts

- Server: `routes/auth.route.js`, `controllers/auth.controller.js` (1796 lines — grep, don't read), `middleware/auth.middleware.js`
- Token renewal: the middleware silently reissues a token past a certain age on the `X-Refreshed-Token` response header; the client persists it in `mobile/utils/apiClient.ts`
- OTP + email verification: `controllers/verification.controller.js`, `services/verification.service.js`, `services/email.service.js`
- Identity verification (government ID, distinct from email OTP above): `GET/POST /verification/{status,submit}` → `mobile/app/verify-account.tsx`, and the same submit flow embedded inline in `components/verification/IdentityStep.tsx` (see the public-event-verification wizard, Events section). `verification.service.js`'s `markVerified()` sets `User.verified = true` and fires a `verification_approved` notification (bell + push) — `components/shared/VerifiedBadgePopup.tsx`, rendered on `app/(tabs)/profile.tsx` (the `verification_approved` notification's tap target — see Notifications & email), adds a one-time celebratory modal on top of that the next time the app opens, tracked client-side only in AsyncStorage (`verified_badge_seen_<userId>`, same no-server-flag approach as `RaffleWinnerPopup.tsx` below) since there's no server-side "seen" field for this.
- Guest checkout tokens (buy without an account): `controllers/guestCheckout.controller.js`
- Mobile: `app/login.tsx`, `app/signup.tsx`, `app/verify-otp.tsx`, `app/verify-signup-email.tsx`, `app/verify-email.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/onboarding.tsx`, `app/auth/google.tsx`; helpers `utils/googleAuth.ts`, `utils/appleAuth.ts`, `utils/requireAuth.ts`; UI in `components/auth/`
- Web: `web/src/pages/Login.tsx`, `Signup.tsx`, `web/src/context/AuthContext.tsx`
- Account deletion: `routes/deleteAccount.route.js`, `mobile/app/settings.tsx`, `web/src/pages/DeleteAccount.tsx`
- Both delete surfaces end at the web login's confirmation toast. The React page passes router state `{ notice: "account-deleted" }`; the legacy server-rendered page can only cross origins, so it 303s to `${PUBLIC_WEB_URL}/login?notice=account-deleted`. The `NOTICES` map in `web/src/pages/Login.tsx` is the shared key list — renaming a key there silently breaks the server redirect.
- Date of birth: `server/src/utils/dateOfBirth.js` + `mobile/utils/dateOfBirth.ts` (mirrored 13+ rule, the floor `mobile/app/terms.tsx` promises). Required by the mobile signup wizard's `dob` step, **optional server-side** so older builds and `web/src/pages/Signup.tsx` still register — those accounts are backfilled through the profile setup checklist tile → `mobile/app/edit-profile.tsx`. Flows register → `PendingSignup.dateOfBirth` → `User.dateOfBirth` at verifySignup. No backfill script exists or can exist.

**Client vs vendor account switch** is a mobile-side concept: `contexts/AccountContext.tsx`
(`activeAccount: "client" | "vendor"`, persisted in SecureStore) + `utils/navigation.ts`
(`resetToAccountRoot`). Client tabs live in `app/(tabs)/`, vendor tabs in `app/(vendor)/`. The
switch control itself is `components/shared/AccountSwitchToggle.tsx` (an animated Client/Vendor
pill — confirms via `Alert`, calls `switchAccount`, then hands the resolved type to an
`onSwitched` callback so the host decides how to reset navigation), used by `app/settings.tsx`'s
Account section and by the profile-modal popup in **both** tab layouts: `app/(tabs)/_layout.tsx`
(shown only when `user.isVendor` — otherwise that modal just shows a plain "Client Account" badge,
since there's nothing to switch to) and `app/(vendor)/_layout.tsx` (shown unconditionally with
`hasVendorAccount` hardcoded true — reaching this layout at all means the account already has a
vendor side, so Client is always a valid switch target). The vendor modal's own "Account" menu
row (→ `/vendor-account`) is labeled "Profile" in the UI, unrelated to this Account/Profile
naming — don't confuse the two when searching for one or the other.

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
- Mobile: `app/event/[id].tsx` (3482 lines), `app/manage-events.tsx`, `app/public-events.tsx`, `app/external-event/[id].tsx`, `app/event-attendees/[eventId].tsx`, `app/event-dashboard/[eventId].tsx`, `app/event-vendors/[eventId].tsx`, `app/create-event/{index,locations,sub-events,tiers,venue-proof,_layout}.tsx` + `contexts/CreateEventContext.tsx` (the create-event flow — replaced the old single `components/client/CreateEventModal.tsx`, which no longer exists), `components/shared/AdditionalLocationsEditor.tsx` (extra venues, shared by create + edit), `app/public-event-verification.tsx` (landing page) → `app/public-event-verification-steps.tsx` (the wizard) → `components/verification/{EmailStep,IdentityStep,PayoutStep}.tsx`, `components/shared/PublicEventCard.tsx`, `ExternalEventCard.tsx`, `hooks/useEventActions.ts`, `hooks/useDiscoverFeed.ts`, `utils/eventDetails.ts`
- **`event.image`/`event.images` entries can be video URLs, not just photos** — `Event.image` is just `gallery[0]`, and the gallery accepts videos (see `MultiImagePicker`/`MediaTile`, `utils/media.ts`'s `isVideoUrl`). Any card or hero that renders `event.image` with a bare `<Image source={{ uri: event.image }}>` silently shows nothing for a video-only event, because an `.mp4` URL isn't a decodable image — this hit `event/[id].tsx`'s hero, `PublicEventCard.tsx`, `manage-events.tsx` (list + pending cards), `(tabs)/profile.tsx` and `(tabs)/home.tsx`'s small cards, and `share/[token].tsx` before all of them were switched to `<MediaTile uri={event.image} posterOnly />` (or, for `event/[id].tsx`'s hero specifically, `autoPlay` with no `posterOnly` so the cover self-plays). Route any new event-cover surface through `MediaTile` from the start.
- **Event Organizer Dashboard**: `app/event-dashboard/[eventId].tsx` — a creator-only per-event control panel (hero + stat tiles for views/going/checked-in/revenue, a ticket-sales panel with the open/closed toggle + a progress bar + recent sales, and a 2×2 quick-action tile grid). Reached from `(tabs)/profile.tsx`'s own full-width "Event Dashboard" button (below the Edit/Share Profile row, not inside it) → `/manage-events` (the existing "My Events" list), and from a new per-card "Dashboard" button on `manage-events.tsx` (creator-only, alongside Share/Invite/Edit/Delete) → `/event-dashboard/[eventId]`. It's a thin aggregator, not new backend: every number comes from existing endpoints (`GET /events/:eventId` for `seenCount`/`rsvpCount`/`ticketsSold`/`vendors`/`vendorInvites`, `GET /events/:eventId/attendance` for check-in counts, `GET /events/:eventId/tickets` — `getEventTicketSales`, previously called from nowhere in the app — for revenue + a buyer list, and the existing `PATCH /events/:eventId/ticket-sales` for the toggle). Its "Edit Event" tile deep-links to `manage-events.tsx?editEventId=<id>`, which auto-opens the existing edit modal once that event is in the fetched list (ref-guarded so it only fires once).
  - **Multi-venue and programme events get different dashboard treatment, mirroring their mutual exclusivity server-side.** `additionalLocations` (same event, several simultaneous venues, one ticket) renders as a plain read-only "LOCATIONS" list. A `subEvents` programme (each stop sells and toggles independently — see the Landmine above) replaces the single "TICKET SALES" panel with one card per stop. `getEventTicketSales` (event.controller.js) now also returns a `stops` array from `allStops(event)` — the main event first with `id: null`, each stop's `sold`/`remaining` computed by grouping the already-fetched ticket list by `Ticket.subEvent`, no extra query. A NEW endpoint, `PATCH /events/:eventId/sub-events/:subEventId/ticket-sales` (`setStopTicketSales`), is the per-stop twin of `setTicketSales` — it requires `stop.ticketPrice > 0` (mirroring `setTicketSales`'s `event.isPaid` requirement) and only ever touches that one stop's `ticketSalesClosedAt`, so pausing a finished brunch doesn't touch the still-upcoming club night. The dashboard fetches ticket sales whenever `event.isPaid || subEvents.length > 0`, since a programme stop can charge even when the umbrella event's own `isPaid` is false.
- **Managing a vendor already on an event vs. adding a new one are two different screens, on purpose.** `app/event-vendors/[eventId].tsx` is the real "manage" surface — confirmed/pending/declined lists with remove/withdraw buttons — reached from the dashboard's vendor tile, from `event/[id].tsx`'s "ON THE BILL" section's "Manage" link, and from a "Manage vendors" action-sheet item there. **Adding** a vendor stays entirely on `event/[id].tsx` (the action-sheet's "Add a vendor" item and the vendor-empty-state both open its local `vendorSearchVisible` search/add modal) — these two used to share one mislabeled "Manage vendors" entry point that actually only added vendors, with vendor *removal* reachable only via an undiscoverable long-press on a vendor card (`onLongPress={... handleRemoveVendor}`, still there, now just redundant with the dedicated screen). `DELETE /events/:eventId/vendors/:vendorId` (`removeVendorFromEvent`) is the one endpoint both the long-press and the new screen call — it strips the vendor from `Event.vendors` AND any `vendorInvites` entry regardless of status, so it works whether the vendor was accepted or only ever invited.
- **`Event.seenCount`/`viewedBy`** (`event.controller.js`'s `getEventById`) already IS the view-count metric — a unique-non-creator-viewer counter, incremented in-place and returned as `seenCount`; do not add a new `views`/`viewCount` field, it would duplicate this.
- Web: `web/src/pages/Events.tsx`, `EventDetails.tsx`, `ExternalEventDetails.tsx`, `MyEvents.tsx`, `EditEvent.tsx`
- Admin: `admin/src/pages/Events.tsx`, `PaidEvents.tsx`, `EventEdits.tsx`
- Birthday Raffle: `models/raffleCampaign.model.js`, `services/raffleCampaign.service.js`, `controllers/birthdayRaffle.controller.js`, `routes/birthdayRaffle.route.js` (`GET /raffle/public` is unauthenticated, `GET /raffle/status` needs a token), `drawRaffleWinners`/`setRaffleWinner` in `admin.controller.js` → `mobile/app/birthday-raffle/{index,status,rules}.tsx`, `admin/src/pages/Raffle.tsx`
- **Announcing an open campaign** is `mobile/components/shared/RafflePromoPopup.tsx`, mounted on `app/(tabs)/home.tsx` beside the existing `RaffleBanner`. It gates on `GET /raffle/public`'s `active` alone and is **not** remembered between launches — while a campaign runs it reappears on every cold start, held to once per launch by a module-scope flag so a tab switch back to home doesn't re-nag. Its `onVisibilityChange` callback holds `RateAppPrompt` back only while it is actually on screen; suppressing for the whole launch would mute the rating ask for an entire campaign.
- **The raffle is a promotion with published official rules, and the code has to match them.** `mobile/app/birthday-raffle/rules.tsx` is the binding text; it is bundled (never fetched) because App Store guideline 5.3.2 requires it to be readable at all times, and it must state that Apple is not a sponsor. Winners come from `POST /admin/raffle/campaigns/:id/draw` — a **merit ranking**, not a random draw: the eligible entrants with the most verified RSVPs take the prize tiers highest-to-lowest, ties broken by whoever reached that count first (one prize per entrant, only their best-performing event competes). `minReferrals` is only a floor to be eligible at all — there is no ceiling. `setRaffleWinner` is a correction tool for a forfeited prize, NOT how winners are chosen. Changing the ranking, the scoring or the prize wording means changing the rules screen too.
- **Campaigns are monthly batches, matched by an entry's own `date` — see Landmine #12.** A user can register a birthday event for any month up to 6 months out; it competes in the current batch if dated this month, otherwise it's "pending" (surfaced by `GET /raffle/status`'s `pending: true`) until that month's campaign is created. `getRaffleStatus` in `birthdayRaffle.controller.js` picks one entry across all of a user's qualifying events to show (an already-decided winner first, then one currently competing, then the soonest pending one) — a user can hold several qualifying events across different months at once.
- **A raffle prize's credit can be vendor-locked.** `RaffleCampaign.vendorNGN`/`vendorUSD` (both `ref: "user"`, matching `Order.vendor`) name the vendor each currency's winners may spend at; `null` means any vendor, same as before this field existed. The lock actually lives on the WINNER, not the campaign — `User.couponVendorNGN`/`couponVendorUSD`, refreshed by `reconcileWinnerCoupon` in admin.controller.js. One lock per currency, not a per-award ledger: winning a later campaign with a different vendor overwrites it, even over leftover balance from an earlier win.
- **Never `String()` a possibly-populated ref to compare ids.** `reserveOrderCoupon` in `coupon.service.js` once did `String(lockedVendor) !== String(order.vendor)` — but `resolvePurchase` in `payments.controller.js` hands it an ORDER with `.vendor` populated (a full Document), and `String(populatedDoc)` is `"[object Object]"`, not its id. That made every vendor-locked balance look mismatched even against its own assigned vendor, so the credit silently never applied. Always normalize with `doc.vendor?._id || doc.vendor` first (the pattern `confirmFreeOrder`'s `createPayout` call already used) before comparing.
- **Admin has a read-only OurCityVibe credit ledger**: `controllers/couponAdmin.controller.js` (`GET /admin/coupons`) reads `CouponTransaction` → `admin/src/pages/Coupons.tsx`. Same rows as the buyer-facing `GET /wallet/credit-history`, unfiltered by user.

## Ticket negotiation

- Organizer option: `Event.hidePrice` in `models/event.model.js`; a standard price in `ticketPrice`/`ticketTiers` is OPTIONAL on a hidden-price event and is only ever a guide (see Landmine #18). Public serialization: `utils/eventPricing.js`; the authenticated negotiation screen deliberately reveals whatever standard price exists.
- API: `controllers/ticketOffer.controller.js` via `routes/event.route.js`: `GET /events/:eventId/negotiation`, `POST /events/:eventId/offers`, `GET|PATCH /ticket-offers/:offerId`. `models/ticketOffer.model.js`, `utils/ticketOffer.js`.
- Mobile: `app/negotiate-ticket/[eventId].tsx`, `app/ticket-offer/[id].tsx`, `services/ticketOffer.service.ts`; `ticket_offer` cards in `components/chat/MessageBubble.tsx`. All three deliberately mirror the vendor-order invoice: `ticket-offer/[id].tsx` is the twin of `order-confirm/[orderId].tsx` (same header, counterparty row, sticky action bar) and both render their line items through the shared `components/shared/InvoiceSummary.tsx`; the chat card reuses MessageBubble's own `orderCard`/`orderCta`/`orderStatusPill` styles, and `ticket_offer` must stay in that file's standalone-card list or the card gets wrapped in a text bubble. Web discovery hands negotiation into the app, like product/service chats.
- Checkout: `POST /payments/init/tickets/:eventId` accepts `offerId`; buyer, final price, quantity and selection are re-derived from the finalized offer. `TicketOrder.ticketOffer` has a unique sparse index and `paymentInit` stores the resumable provider checkout. Fulfillment uses the existing batch rail. Hidden events reject ordinary checkout/discount previews. Deploy server before mobile; no existing event data needs backfilling.
- Tests: `node --test server/src/tests/ticketOffers.test.mjs server/src/services/payments/*.test.mjs`.

## Passes, tickets, check-in

One unified concept: **every** RSVP and every paid ticket issues a QR entry pass.

- `services/pass.service.js` → `issueEventPass()`, `computeAttendanceStatus()`
- `models/attendance.model.js`, `models/ticket.model.js`, `models/ticketOrder.model.js`
- `routes/attendance.route.js`, `controllers/attendance.controller.js`, `utils/qrcode.js`
- `services/eventSignups.service.js` — `buildEventSignups()`, the one guest-list answer behind both `GET /events/:eventId/signups` (organizer) and `GET /admin/events/:id/signups` (admin). Two gates, one body: an admin token is signed with a different secret and can never satisfy `authenticate`.
- **Which venue an attendee picked lives on the PASS and the TICKET, as `locationIndex` + a `locationName`/`locationCity` snapshot.** The index is into `allVenues(event)` (0 = the event's own location) because `additionalLocations` subdocs are `_id: false` and `updateEvent` replaces the whole array — no id would be stable. `resolveVenueChoice()`/`venueOptions()` in `utils/eventLocations.js` validate and list them; absent is a real value meaning "never asked" (single-venue event, old app build, server-rendered share page), never venue #1. The per-venue breakdown in `buildEventSignups` is counted off passes, not tickets — one pass is one body at one door.
- Mobile: `app/passes.tsx`, `app/scan.tsx`, `app/check-in/[eventId].tsx`, `app/event-attendees/[eventId].tsx`, `components/shared/EventQRModal.tsx`, `components/shared/VenuePicker.tsx` (`eventVenues`/`needsVenuePick` mirror `allVenues`), `utils/qrShare.ts`
- Web: `web/src/components/VenueChoice.tsx` (`eventVenues`/`venueCount`/`venueLabel`) — the venue radios on `EventDetails.tsx` (RSVP) and per ticket in `Pay.tsx`
- Sub-events (the programme feature): `server/src/utils/subEvents.js` (`allStops`/`findStop`/`stopLabel`/`normalizeSubEvents`), used by `event.controller.js`'s `createEvent`/`updateEvent`/`rsvpEvent` (the `reconcileStopRsvp` multi-select path) and `payments.controller.js`'s `initTicketBatch`. Mobile: `components/shared/SubEventsEditor.tsx` (authoring — carries the `InfoTip` explaining what a programme is, in both its disabled and enabled branch, so create AND the manage-events edit modal get it), `components/shared/StopPicker.tsx` (`eventStops`/`selectionTotal`/`stopKey`, the RSVP-or-pay checkbox sheet on `app/event/[id].tsx` — a checked stop with more than one tier expands a radio-chip group via `tierChoices`/`onTierChange`, so the guest picks a specific band instead of always getting the cheapest), `components/shared/TicketTiersEditor.tsx` (extracted from the old create-event modal, also used by the `tiers` sub-event screen). Web: `components/ProgrammePicker.tsx` (mirrors `StopPicker.tsx` but only picks WHICH stops — the per-stop tier choice lives one screen later, in `pages/Pay.tsx`'s `makeStopSlot`/`updateSlot` inline picker), wired into `EventDetails.tsx`'s `TicketBox` and `Pay.tsx`'s `programmeMode` slot-seeding path.

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
- **The vendor dashboard's "Bookings" tab (`components/vendor/BookingsTab.tsx`) lists `Order` docs, not the legacy `booking.model.js`/`booking.controller.js` docs** — despite the name. It fetches `GET /orders/vendor?status=quoted,paid`; a `requested` order (not yet invoiced) never appears here, it only lives in chat until the vendor quotes it. The separate `Booking` model (a direct "request this service for a date" flow, its own `confirmed`/`rejected` status) has no UI surface reachable from this tab.
- `PATCH /orders/:id/decline` (vendor-only) is the vendor's **cancel** action on a `requested` or `quoted` order — it stays open through `quoted` on purpose, since that's still unpaid, and is exactly what `BookingsTab`'s "Cancel Order" button (shown only on `quoted` cards — a `paid` order can't be cancelled here) calls. It now **requires** a non-empty `reason` in the body (400 without one), stores it on `Order.cancellationReason`, and posts it into the order's chat as a system message. `PATCH /orders/:id/cancel` (client-only) is the client's mirror of this and does NOT require a reason.

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
- Credit history ledger — every balance change above also writes a row here; this collection is read-only history, never the balance's source of truth: `models/couponTransaction.model.js`, `controllers/wallet.controller.js`, `GET /wallet/credit-history` (`routes/wallet.route.js`) → rendered below the card on `mobile/app/wallet-rewards.tsx`. Admin's unfiltered view of the same collection: `controllers/couponAdmin.controller.js` (`GET /admin/coupons`) → `admin/src/pages/Coupons.tsx`
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
- App-store rating prompt (mobile only, no server side): `mobile/utils/appRating.ts` owns the gate — `markRatingMoment()` is called from success paths (`hooks/useEventActions.ts`, `app/create-event/index.tsx`) and `components/shared/RateAppPrompt.tsx`, mounted on `app/(tabs)/home.tsx`, shows itself only when the gate allows. `app/settings.tsx`'s "Rate OurCityvibe" row calls `openStoreReview()` directly and settles the gate, so asking there stops the prompt. `expo-store-review`'s `storeUrl()` reads `ios.appStoreUrl`/`android.playStoreUrl` out of `app.config.js`, which is why those are set there; the module is native, so a build made before it was added falls back to that link instead of the in-app sheet.
- How-to manual (event creation, guides, vendors): content authored once in `server/src/content/manual.js`, served public by `routes/manual.route.js` (`GET /manual`, `GET /manual/:slug`) → `mobile/app/help/{index,[slug]}.tsx` and `web/src/pages/{Help,HelpTopic}.tsx`. Both clients fetch it; nothing is bundled, so a copy edit needs no app release. Entry points: mobile Settings → "How it works", vendor AccountTab, CreateEventModal.

## Admin console

`routes/admin.route.js` + `controllers/admin.controller.js` (959 lines) + `middleware/admin.middleware.js`
→ `admin/src/pages/*` (Dashboard, Users, Events, PaidEvents, EventEdits, EventCancellations,
Announcements, Vendors, VendorTypes, Cities, Guides, Payouts, DiscountCodes, Reports,
Verifications, Analytics, Raffle), shared UI in `admin/src/components/ui/` — though the review-queue
pages (EventEdits, EventCancellations) use inline styles + `constants/colors`, not those primitives.

`Dashboard.tsx`'s "Action Items" panel is the at-a-glance pending-work overview (verifications,
payouts, event edits, paid-event approvals, cancellations, reports, plus an informational "new
users today" tile) — each tile navigates to its review page. There is **no dedicated
count-only endpoint** for this: `adminApi.getActionItems()` (`admin/src/api/admin.ts`) fires the
six existing paginated queue endpoints with `limit=1` in parallel and reads
`total`/`pagination.total`/`openCount` off each (every one of the six already returns that
independent of page size), plus `getStats()` for `newUsersToday` (added to `GET /admin/stats`
specifically for this — `User.countDocuments({ createdAt: { $gte: startOfToday } })`). Adding a
7th queue means adding one more parallel call here, not a new server route.

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
