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
4. **Webhook raw-body parsers are registered before `express.json()`** in `src/index.js` for `/api/stripe/webhook`, `/api/stripe/connect/webhook`, `/api/paystack/webhook`. Moving them breaks signature verification.
5. **`:eventId` / `:userId` params may be a slug or a shareToken**, not just an ObjectId — website share links depend on this. Use `utils/resolveEvent.js` (`findEventByAnyId`) and `utils/resolveUser.js` (`resolveUserId`). A bare `findById` 500s or fake-404s that traffic.
6. **`utils/response.js` (`sendSuccess`/`sendError`/`asyncHandler`) is dead code** — zero controllers use it, despite what the README claims. Match the real pattern: `try/catch` + `res.status(n).json({ message })`.

## Auth & accounts

- Server: `routes/auth.route.js`, `controllers/auth.controller.js` (1796 lines — grep, don't read), `middleware/auth.middleware.js`
- Token renewal: the middleware silently reissues a token past a certain age on the `X-Refreshed-Token` response header; the client persists it in `mobile/utils/apiClient.ts`
- OTP + email verification: `controllers/verification.controller.js`, `services/verification.service.js`, `services/email.service.js`
- Guest checkout tokens (buy without an account): `controllers/guestCheckout.controller.js`
- Mobile: `app/login.tsx`, `app/signup.tsx`, `app/verify-otp.tsx`, `app/verify-signup-email.tsx`, `app/verify-email.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/onboarding.tsx`, `app/auth/google.tsx`; helpers `utils/googleAuth.ts`, `utils/appleAuth.ts`, `utils/requireAuth.ts`; UI in `components/auth/`
- Web: `web/src/pages/Login.tsx`, `Signup.tsx`, `web/src/context/AuthContext.tsx`
- Account deletion: `routes/deleteAccount.route.js`, `mobile/app/settings.tsx`, `web/src/pages/DeleteAccount.tsx`

**Client vs vendor account switch** is a mobile-side concept: `contexts/AccountContext.tsx`
(`activeAccount: "client" | "vendor"`, persisted in SecureStore) + `utils/navigation.ts`
(`resetToAccountRoot`). Client tabs live in `app/(tabs)/`, vendor tabs in `app/(vendor)/`.

## Users, social graph, moderation

- Follow: `routes/follow.route.js`, `controllers/follow.controller.js`, `utils/followCheck.js`, `utils/followCounts.js` → `mobile/app/followers.tsx`, `following.tsx`, `services/follow.service.ts`, `components/shared/FollowButton.tsx`
- Block / report: `controllers/block.controller.js`, `controllers/report.controller.js`, `utils/blockFilter.js`, `utils/contentFilter.js` → `mobile/app/blocked-users.tsx`, `components/shared/ReportBlockSheet.tsx`, `services/moderation.service.ts`
- Profiles: `controllers/user.controller.js` → `mobile/app/(tabs)/profile.tsx`, `app/user/[id].tsx`, `app/user-profile.tsx`
- Favorites: `controllers/favorites.controller.js` → `mobile/app/favorites.tsx`

## Events

- Server: `routes/event.route.js`, `controllers/event.controller.js` (2527 lines — grep for the exported handler), `models/event.model.js`
- External/aggregated events: `controllers/externalEvent.controller.js`, `services/eventbrite.service.js`, `services/ticketmaster.service.js`, `models/externalEvent.model.js`, `models/eventbritePlace.model.js`
- Mobile: `app/event/[id].tsx` (3482 lines), `app/manage-events.tsx`, `app/public-events.tsx`, `app/external-event/[id].tsx`, `app/event-attendees/[eventId].tsx`, `components/client/CreateEventModal.tsx`, `components/shared/PublicEventCard.tsx`, `ExternalEventCard.tsx`, `hooks/useEventActions.ts`, `hooks/useDiscoverFeed.ts`, `utils/eventDetails.ts`
- Web: `web/src/pages/Events.tsx`, `EventDetails.tsx`, `ExternalEventDetails.tsx`, `MyEvents.tsx`, `EditEvent.tsx`
- Admin: `admin/src/pages/Events.tsx`, `PaidEvents.tsx`, `EventEdits.tsx`

## Passes, tickets, check-in

One unified concept: **every** RSVP and every paid ticket issues a QR entry pass.

- `services/pass.service.js` → `issueEventPass()`, `computeAttendanceStatus()`
- `models/attendance.model.js`, `models/ticket.model.js`, `models/ticketOrder.model.js`
- `routes/attendance.route.js`, `controllers/attendance.controller.js`, `utils/qrcode.js`
- Mobile: `app/passes.tsx`, `app/scan.tsx`, `app/check-in/[eventId].tsx`, `components/shared/EventQRModal.tsx`, `utils/qrShare.ts`

## Chat & messaging

- Server: `routes/chat.route.js`, `controllers/chat.controller.js`, `services/chat.service.js` (1022 lines), `services/socket.service.js`, `models/chat.model.js`, `models/message.model.js`
- **Client and vendor inboxes are separate.** `Chat.context` + `vendorParticipant` split them; `/chats` takes a `scope` param. Do not merge them.
- Mobile: `app/chat/[id].tsx` (3130 lines), `app/(tabs)/chats.tsx`, `app/(vendor)/chats.tsx`, `app/messages.tsx`, `components/chat/*`, `components/vendor/VendorChatsTab.tsx`, `services/chat.service.ts`, `services/socket.service.ts`, `utils/chatHelpers.ts`, `chatDisplay.ts`, `messageText.ts`, `reactions.ts`, `contexts/UnreadContext.tsx`

## Vendor discovery & vendor account

Discovery is three levels: **City → VendorType → Vendor** (all in `models/vendor.model.js`).

- Server: `routes/vendor.route.js`, `controllers/vendors.controller.js`, `controllers/verification.controller.js`
- Mobile discovery: `app/(tabs)/vendors.tsx`, `app/vendor-types/[cityId].tsx`, `app/vendor-list/[cityId]/[typeId].tsx`, `app/vendor-details/[vendorId].tsx`, `components/vendor-details/*`
- Mobile vendor-side: `app/(vendor)/{dashboard,services,bookings,chats,account}.tsx` — each is a thin shell over `components/vendor/{DashboardTab,ServicesTab,BookingsTab,VendorChatsTab,AccountTab}.tsx`
- Onboarding: `app/vendor-setup.tsx`, `components/client/BecomeVendorModal.tsx`
- Web/admin: `web/src/pages/VendorProfile.tsx`, `admin/src/pages/Vendors.tsx`, `VendorTypes.tsx`, `Cities.tsx`, `Verifications.tsx`
- The vendor-details screen uses its **own** palette (`mobile/constants/vendorServicesTheme.ts`), not the global theme tokens

## Catalogue → cart → order → booking

Two-level catalogue: `CatalogueCategory` (`kind: "product" | "service"`) contains `Service` items.

- Server: `routes/catalogueCategory.route.js` + `controllers/catalogueCategory.controller.js`; `routes/service.route.js` + `controllers/service.controller.js`; `routes/order.route.js` + `controllers/order.controller.js`; `routes/booking.route.js` + `controllers/booking.controller.js`
- Order lifecycle: client checks out a cart against **one** vendor → server re-derives every price from live `Service` docs (never trusts the client) → `Order(status:"requested")` → an order card is posted into the vendor chat → vendor quotes → client confirms → pays. `computeTotals()` in `order.controller.js` is the authority on totals.
- Mobile: `app/cart.tsx`, `contexts/CartContext.tsx`, `app/order-confirm/[orderId].tsx`, `app/bookings.tsx`, `components/vendor/{ServicesTab,ServiceModal,CategoryModal,BookingsTab}.tsx`
- The order card in chat is keyed by the message **sender** — relevant whenever chat rendering changes.

## Payments

**Two independent decisions**, both in `services/payments/resolveProvider.js`:

- **Collection** (`getPayoutProvider`) — how the buyer is charged. Stripe (card/USD, into the platform balance) or Paystack (NGN local methods, Nigeria only at launch).
- **Settlement** (`getSettlementProvider`) — how the seller is paid out after admin approval. Only two rails: **Paystack transfers** (Nigeria) and **Stripe Connect** (US/UK/EEA/CA/CH). Everywhere else returns `null` — an honest "not available yet", not a fallback. Wise was deleted in Aug 2026; do not reintroduce a default rail. There is no `STRIPE_CONNECT_ENABLED` flag.
- The mobile mirror of these rollout knobs is `mobile/constants/payments.ts` — **keep them in sync**.

Unified purchase API (`routes/payments.route.js`):

```
GET  /payments/config                      publishable keys for both providers
POST /payments/guest/start-otp | verify-otp guest checkout, rate-limited
POST /payments/discount/preview             no side effects, accepts guest tokens
POST /payments/init/tickets/:eventId        batch/gift tickets — MUST stay above the generic route
POST /payments/confirm/tickets/:eventId
POST /payments/init/:type/:id               :type ∈ ticket | guide | booking | order
POST /payments/confirm/:type/:id
```

- Controllers: `payments.controller.js` (1080 lines), `stripe.controller.js`, `stripeConnect.controller.js`, `paystack.controller.js`
- `services/payments/fulfillment.js` — `fulfillTicket`, `issueRecipientTicket`, `fulfillGuide`, `fulfillBooking`, `fulfillOrder`, `formatAmountText`. **Every** successful payment lands here; new purchasable types get a `fulfill*` function.
- `services/payments/split.js` — `computeSplit()` in **major** currency units; subunit conversion (cents/kobo) happens at each provider boundary.
- `services/payments/{settleStripePayment,sellingEligibility,discount,earnings,payout}.service.js`
- Unit tests actually run here: `node --test server/src/services/payments/*.test.mjs`
- Discounts: `models/discountCode.model.js`, `discountRedemption.model.js`, `controllers/discountAdmin.controller.js`, `jobs/discountReservation.job.js`, `admin/src/pages/DiscountCodes.tsx`
- Earnings & payouts: `routes/earnings.route.js` (`/earnings/{summary,sales,payouts}`, seller is always `req.user.id`, never a param), `controllers/payoutAdmin.controller.js`, `models/payout.model.js`, `jobs/payoutRelease.job.js` → `mobile/app/earnings.tsx`, `components/shared/EarningsHero.tsx`, `admin/src/pages/Payouts.tsx`
- Onboarding screens: `mobile/app/stripe-connect-onboarding.tsx`, `app/paystack-onboarding.tsx`, `hooks/useStripePayment.ts`
- Web checkout: `web/src/pages/Pay.tsx` (Stripe.js + Paystack Inline `resumeTransaction`; provider inferred from the event currency)
- **Deploy order: server before mobile.**

## Guides (city guides, purchasable)

`routes/guide.route.js`, `controllers/guide.controller.js`, `models/guide.model.js`
→ `mobile/app/guide/[id].tsx`, `guide/create.tsx`, `guide/edit/[id].tsx`, `guide/city/[id].tsx`,
`app/my-guides.tsx`, `app/saved-guides.tsx`, `components/shared/GuideCard.tsx`,
`admin/src/pages/Guides.tsx`. Purchases fulfil through `fulfillGuide`.

## Notifications & email

- Push + in-app: `services/notification.service.js` (`notifyUser`, `sendPushNotification` — Firebase Admin + `expo-server-sdk`), `routes/notification.route.js`, `models/notification.model.js` → `mobile/app/notifications.tsx`, `utils/pushNotifications.ts`
- Email: `services/email.service.js` (nodemailer) — `sendPasswordResetOTP`, `sendSignupVerificationOTP`, `sendGuestCheckoutOTP`, `sendEventPassEmail`, `sendEventReminderEmail`, `sendPasswordResetSuccessEmail`, `sendSaleEmail`, `sendPurchaseReceiptEmail`. Unsubscribe: `routes/unsubscribe.route.js`.
- Dev note: on some ISPs (MTN) SMTP is blocked outright — `ETIMEDOUT` on `smtp.gmail.com:587` is the network, not the code. Dev OTP is `000000`; guest-OTP tolerates mail failure in dev.

## Search, location, uploads, misc

- Search: `routes/search.route.js`, `controllers/search.controller.js`, `services/userSearch.js`, `utils/escapeRegex.js` → `mobile/app/search.tsx`, `app/search-users.tsx`, `services/search.service.ts`
- Location (CSC API proxied through the server): `routes/location.route.js`, `controllers/location.controller.js` → `mobile/hooks/useLocation.ts`, `useActiveCity.ts`, `utils/location.ts`, `components/shared/{LocationPicker,LocationPickerSheet,LocationFilterBar,ActiveLocationChip}.tsx`
- Uploads: `routes/upload.route.js` (mounted at `/api/upload`), `middleware/upload.middleware.js`, `config/cloudinary.js`, `services/image.service.js`, `utils/mediaLimit.js` → `mobile/utils/imageUpload.ts`, `media.ts`, `components/shared/{ImagePickerButton,MultiImagePicker,MediaTile}.tsx`
- Deep links / share: `routes/deepLinks.route.js` (687 lines — server-rendered share pages), `utils/slug.js` → `mobile/app/share/[token].tsx`, `utils/deepLinkParser.ts`, `shareLinks.ts`, `pendingDeepLink.ts`
- Logging: `routes/log.route.js` (client → server) → `mobile/utils/remoteLog.ts`, `logger.ts`
- Legal/compliance: `routes/{privacy,csae}.route.js`, `mobile/app/{privacy,terms}.tsx`, `web/src/pages/{Privacy,Csae}.tsx`

## Admin console

`routes/admin.route.js` + `controllers/admin.controller.js` (959 lines) + `middleware/admin.middleware.js`
→ `admin/src/pages/*` (Dashboard, Users, Events, PaidEvents, EventEdits, Vendors, VendorTypes,
Cities, Guides, Payouts, DiscountCodes, Reports, Verifications, Analytics), shared UI in
`admin/src/components/ui/`.

## Background jobs & one-off scripts

Started from `server/src/index.js`: `eventReminder.job.js`, `payoutRelease.job.js`,
`externalEventsRefresh.job.js`, `discountReservation.job.js`.

Migrations — **these must actually be run against each environment**, they are not automatic:
`server/scripts/{backfill-slugs,migrate-catalogue-categories,ingest-eventbrite,hash-admin-password,verify-oauth-accounts}.mjs`
and `server/src/scripts/{migrateVendorChatContext,migrateGuideSalesLedger,migrateDropWise,setupSupportAccount}.mjs`.

## Config

- Server: `src/config/env.js` is the single source of truth (also `db.js`, `stripe.js`, `paystack.js`, `cloudinary.js`). Read env through it, not `process.env` — the one deliberate exception is `services/payments/resolveProvider.js`, which reads `process.env` directly to stay test-setup-free.
- Mobile: `constants/constants.ts` (`BASE_URL`), `constants/theme.ts`, `colors.ts`, `payments.ts`, `fonts.ts`, `support.ts`, `vendorChrome.ts`, `vendorServicesTheme.ts`
- Web/admin: `web/src/config.ts`, `admin/src/api/client.ts`
