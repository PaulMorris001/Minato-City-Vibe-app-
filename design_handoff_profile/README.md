# Handoff: NightVibe Profile Screen

## Overview
A simplified, more modern **Profile** screen for NightVibe. Replaces the previous flat layout with a quieter editorial treatment: a single avatar + name row, an inline verified badge, flat stat row, search, and a Hosted/Attended-filtered event list. Same dark + neon-purple palette and `Bricolage Grotesque` / `Inter` type pairing as the rest of the app.

This handoff covers **Variant A — "Quiet editorial"** (the approved direction). Variant B is included in the source for reference but is **out of scope**.

## About the design files
The files in this bundle are **design references created in HTML** — a high-fidelity prototype showing the intended look and behavior. They are **not** production code to copy directly. The task is to **recreate this design in the target codebase's existing environment** (React Native / Expo, SwiftUI, Flutter — whatever NightVibe is built in) using its established components, theming, navigation, and data-fetching patterns.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are locked. Hex values, type ramp, and spacings below are exact — use them as the source of truth. Don't lift the prototype's inline-styled `<div>`s wholesale; rebuild with your codebase's primitives.

---

## Screen layout

A single scrollable screen with a small top row, an avatar+name header, a flat stats row, a search field, an events section with text tabs, and the existing bottom tab bar. Designed at **360 × 780** logical pixels (iPhone frame).

```
┌──────────────────────────────────┐
│  Status bar                      │
├──────────────────────────────────┤
│  PROFILE                  [ ⚙ ]  │  ← top row
│                                  │
│   ⬤   SetemiL   ✦                │  ← avatar + name + verified
│       @setemil · Vendor          │
│                                  │
│   4 Followers   11 Following     │  ← flat stat row
│   5 Events                       │
│                                  │
│  ┌─ 🔍 Search users… ──────────┐ │
│                                  │
│  Events            Hosted Attended│  ← section header + text tabs
│  ┌────────────────────────────┐  │
│  │ 🌺  BADDDD              •  │  │
│  │     Apr 30 · Atlanta       │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ 🌅  Mood                •  │  │
│  │     Apr 7 · Somewhere      │  │
│  └────────────────────────────┘  │
│                                  │
├──────────────────────────────────┤
│  🏠   🌐   🏆   📅   👤          │  ← bottom tab bar
└──────────────────────────────────┘
```

### 1. Top row
`padding: 8px 18px 0`, flex space-between.
- Left: small kicker label `"PROFILE"` — Bricolage Grotesque 800, **13px**, color `rgba(244,238,255,0.62)`, letter-spacing 0.18em, uppercase.
- Right: single round glassy settings button — 36×36, radius 50%, bg `rgba(255,255,255,0.05)`, border `1px solid rgba(255,255,255,0.08)`, settings (gear) icon, 16×16, stroke 2, color `#F4EEFF`.

**There are no other top-level action buttons** — no message icon, no edit-profile / share-card pair. Keep it sparse.

### 2. Hero (avatar + name)
`padding: 20px 22px 0`, position: relative. A soft aurora glow lives behind the row only.

**Aurora glow** — absolute, `top: -30; left: 50%; transform: translateX(-50%); width: 320; height: 220`, `border-radius: 50%`, `background: radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)`, `filter: blur(40px)`, `z-index: 0`, `pointer-events: none`.

**Row** (`z-index: 1`, flex, `gap: 14`, align-items center):
- **Avatar** — 68×68, `border-radius: 50%`. Background is the user's avatar image; in the demo it's a CSS gradient `linear-gradient(160deg, #22D3EE 0%, #7C3AED 50%, #EC4899 100%)`. **No ring.** Initial fallback: Bricolage Grotesque 800, 30px, white, letter-spacing -0.04em, centered. Subtle inner shadow `inset 0 0 30px rgba(0,0,0,0.25)`. `flex-shrink: 0`.
- **Name block** (`flex: 1; min-width: 0`):
  - Top row: flex, `gap: 8`, align-center.
    - Name: Bricolage Grotesque **900, 26px, letter-spacing -0.03em, line-height 1.05**, color `#F4EEFF`, single-line ellipsis.
    - **Verified badge** (only if `user.isVerified`) — 20×20 circle, gradient `linear-gradient(135deg, #A855F7, #EC4899)`, white sparkle glyph `✦` (font-size 11, line-height 1), `box-shadow: 0 4px 12px rgba(168,85,247,0.45)`. `flex-shrink: 0`. Has `title="Verified"` for accessibility.
  - Second line, `margin-top: 3`: Inter 12.5/500, color `rgba(244,238,255,0.62)`. Shows the handle, and if `user.isVendor` is true append ` · Vendor` in `#C084FC` weight 700 (separated by a space-bullet-space).
  - **Important:** the second line is purely passive metadata. Don't surface email here (it's PII) — keep it on the Edit Profile screen.

### 3. Stats row
`margin-top: 18` (from the hero), flat row of three stats. Flex, align-items: baseline, `gap: 22`. Each stat is two adjacent inline elements:
- Number — Bricolage Grotesque 800, **20px**, letter-spacing -0.02em, line-height 1, color `#F4EEFF`.
- Label — Inter 11.5/500, color `rgba(244,238,255,0.62)`.

Order and content:
1. `{user.followers} Followers`
2. `{user.following} Following`
3. `{user.events.length} Events`

No card, no border, no dividers. Stats are tappable: tapping "Followers" / "Following" opens the corresponding list, tapping "Events" jumps the page to the events section (or no-ops; it's mainly decorative).

### 4. Search field
`padding: 20px 22px 0`. A single read-style row:
- Container: `padding: 11px 14px`, `border-radius: 12`, bg `rgba(255,255,255,0.04)`, border `1px solid rgba(255,255,255,0.08)`. Flex, align-center, `gap: 10`.
- 14×14 search icon, stroke 2.2, color `rgba(244,238,255,0.38)`.
- Placeholder text: `"Search users…"` — Inter 13/500, color `rgba(244,238,255,0.38)`.

In production: focus this opens an inline user search overlay (existing pattern in the app — match it). Don't ship a static field.

### 5. Events section
`padding: 22px 22px 24px`.

**Section header** — flex space-between, `margin-bottom: 14`:
- Title `"Events"` — Bricolage Grotesque 800, **20px**, letter-spacing -0.02em, color `#F4EEFF`.
- **Text tabs** — flex `gap: 14`. Two tabs only:
  - `Hosted` — filters `events` where `event.createdBy === user._id`
  - `Attended` — filters `events` where `user._id ∈ event.rsvpUsers` and `event.createdBy !== user._id`
  
  Each tab is plain text, `padding-bottom: 4`, Inter 12/700, no background, no border. Inactive color `rgba(244,238,255,0.38)`; active color `#F4EEFF`. Active tab has a **gradient underline** — 2px tall, `border-radius: 2`, `background: linear-gradient(90deg, #A855F7, #EC4899)`, positioned `absolute; left: 0; right: 0; bottom: 0`. No "All" tab — events live in one of the two buckets.

**Event list** — flex column, `gap: 8`. Each row:
- Container: `padding: 10px 12px`, `border-radius: 14`, bg `rgba(26,16,48,0.7)`, border `1px solid rgba(255,255,255,0.08)`. Flex row, align-center, `gap: 12`. Tappable → event detail.
- **Cover thumb** — 52×52, `border-radius: 10`, `position: relative; overflow: hidden`, border `1px solid rgba(255,255,255,0.14)`. Background = event image / fallback gradient. Decorative emoji placed at `right: -6; bottom: -10; font-size: 38; opacity: 0.45; transform: rotate(-8deg)`. The emoji is a category accent — derived from event tags or pre-assigned per category. Skip if your events don't have one.
- **Body** (`flex: 1; min-width: 0`):
  - Title: Bricolage Grotesque 700, 14.5px, letter-spacing -0.01em, color `#F4EEFF`, single-line ellipsis.
  - Sub-row, `margin-top: 3`, Inter 11.5/500, color `rgba(244,238,255,0.62)`, flex `gap: 6`, align-center. Two segments separated by a 2.5×2.5 round dot in `rgba(244,238,255,0.38)`:
    - Formatted date (e.g. `"Apr 30, 2026"`)
    - Location (e.g. `"Atlanta"`)
- **Role indicator** (right, `flex-shrink: 0`) — small dot + label. Flex row `gap: 6`, align-center.
  - Dot: 6×6 circle.
    - `created` (current user is the host): bg `#A855F7`, glow `box-shadow: 0 0 10px rgba(168,85,247,0.6)`. Label color `#C084FC`.
    - `attended` (current user RSVP'd): bg `rgba(255,255,255,0.35)`, no glow. Label color `rgba(244,238,255,0.38)`.
  - Label: Inter 10.5/700, `letter-spacing: 0.05em`, `text-transform: uppercase`. Text = `"created"` or `"attended"`. **No chip, no background, no border.**

### 6. Bottom tab bar
The existing tab bar — no changes. `padding-top: 10; padding-bottom: 26`. Top fade `linear-gradient(to top, rgba(11,6,19,0.98) 40%, rgba(11,6,19,0))`. `border-top: 1px solid rgba(255,255,255,0.08)`. Five tabs, evenly spaced. Profile is active — its icon + label color `#A855F7` (others `rgba(244,238,255,0.38)`), label weight 700 when active else 500. Profile icon uses a **filled** silhouette when active; outline otherwise.

---

## Interactions & behavior

### Tap targets
- Settings cog → settings screen.
- Avatar / name → no-op (this is already the current user's profile). On another user's profile, the avatar can open a full-screen avatar viewer.
- Followers / Following stats → respective list screens.
- Events stat → smooth-scroll the page to the Events section.
- Search field → user search overlay.
- Hosted / Attended tabs → swap the filtered list. Animate the gradient underline sliding between tabs (200ms ease).
- Event row → event detail screen.

### Empty states
- **No hosted events:** centered text "You haven't hosted yet" (Bricolage 700, 14, dim) + a single primary "Create event" pill (gradient `linear-gradient(100deg, #A855F7 0%, #7C3AED 50%, #EC4899 100%)`, white text, shadow `0 10px 28px rgba(168,85,247,0.45)`).
- **No attended events:** "Nothing yet — pick a night." + secondary "Browse events" pill (transparent, border `1px solid rgba(255,255,255,0.14)`).

### State variants
- **Not verified:** the verified badge is simply absent. Name stays in the same row; no extra spacing reserved.
- **Not a vendor:** drop the ` · Vendor` segment from the subline.
- **Loading:** skeletons for avatar (gradient pulse), name (rounded rect 120×26), handle line (80×12), stats (3 × 80×20 rounded rects), and 3–5 event-row placeholders (rounded rect 52×52 + two text lines).

### Animations
- Tab swap underline: 200ms ease.
- Avatar press: 100ms scale 0.97.
- Row press: 100ms bg shift to `rgba(26,16,48,0.95)`.

---

## Data model mapping

| Model field | UI element |
|---|---|
| `user.name` | Big display name |
| `user.handle` | Sub-line `@handle` |
| `user.avatar` | 68px circle background image |
| `user.isVerified` | Verified ✦ badge next to name |
| `user.isVendor` | ` · Vendor` accent in sub-line |
| `user.followers.length` | Stat: Followers |
| `user.following.length` | Stat: Following |
| `user.events.length` | Stat: Events (combined hosted + attended count) |
| `event.title` | Row title |
| `event.date` | Row sub-line, formatted `MMM d, yyyy` |
| `event.location` (short form) | Row sub-line second segment |
| `event.image` | Row thumb background |
| `event.createdBy === user._id` | Drives the `created` / `attended` role indicator and the Hosted/Attended filter |
| `event.rsvpUsers` includes `user._id` | Drives Attended filter |

Do **not** show: email, bio, joined date, vibes, friends overlap, badges array, city. The previous design surfaced too much PII / chrome — this trim is intentional.

---

## State management

```ts
type ProfileScreenState = {
  user: User;                 // fetched via /api/me or /api/users/:id
  events: EventSummary[];     // user's hosted + attended events, sorted desc by date
  tab: 'hosted' | 'attended';
  isLoading: boolean;
};
```

Endpoints:
- `GET /api/me` (or `/api/users/:id` for other profiles) — returns user + counts.
- `GET /api/users/:id/events?role=hosted|attended` — paginated event list. Or one combined endpoint with a `role` field on each item; either is fine.

The Hosted/Attended split can be done client-side from a single combined list since the screen is short (5–20 events typical). Server-side filtering is the right call once a user has 50+ events.

---

## Design tokens

### Colors
| Token | Hex / value | Use |
|---|---|---|
| `bg` | `#0B0613` | Screen background |
| `surface` | `rgba(26,16,48,0.7)` | Event row card |
| `text` | `#F4EEFF` | Primary text |
| `textDim` | `rgba(244,238,255,0.62)` | Sub-text, stat labels |
| `textMute` | `rgba(244,238,255,0.38)` | Inactive tab labels, dots, placeholders |
| `stroke` | `rgba(255,255,255,0.08)` | Default hairline |
| `strokeHi` | `rgba(255,255,255,0.14)` | Thumb border |
| `purple` | `#A855F7` | Created-dot, gradient mid |
| `purpleSoft` | `#C084FC` | Vendor accent, created label color |
| `pink` | `#EC4899` | Gradient end |

### Brand gradients
- **Verified badge:** `linear-gradient(135deg, #A855F7, #EC4899)`.
- **Active tab underline / primary CTA:** `linear-gradient(90deg, #A855F7, #EC4899)`.
- **Hero aurora:** `radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)`, blur 40.

### Shadows
- Verified badge: `0 4px 12px rgba(168,85,247,0.45)`.
- Created-event dot glow: `0 0 10px rgba(168,85,247,0.6)`.
- Avatar inner: `inset 0 0 30px rgba(0,0,0,0.25)`.

### Typography
- **Display:** Bricolage Grotesque 900 — name (26px). Letter-spacing -0.03em.
- **Heading:** Bricolage Grotesque 800 — section title (20px), stat values (20px), kicker label (13px). Letter-spacing -0.02em (except kicker, which is +0.18em uppercase).
- **Sub-heading:** Bricolage Grotesque 700 — event row title (14.5px), avatar initial fallback (30px). Letter-spacing -0.01em / -0.04em.
- **Body / UI:** Inter 500 for general text, 700 for emphasis. 11–13px.
- **Micro labels:** Inter 10.5/700, uppercase, letter-spacing 0.05em (role indicator).

### Spacing
- Edge padding: **22px** on the main content area (top row uses 18px to match nav alignment elsewhere in the app).
- Hero internal: 14px gap between avatar and name block.
- Stats row: 22px gap between stats.
- Stat number/label: 6px gap.
- Events section: 8px gap between rows, 14px between header and list.

### Radii
- Avatar / dots / verified badge: 50%.
- Search field: 12.
- Event row: 14.
- Event row thumb: 10.
- Settings button: 50% (36×36).

---

## Assets
- Avatar image (`user.avatar`) — fall back to the initial-on-gradient if missing. Generate the fallback gradient deterministically from `user._id` (existing app pattern presumably).
- Event cover image (`event.image`) — same fallback rules as on the event detail screen.
- Icons (all inline SVG in the prototype — replace with your icon set):
  - settings / gear (top-right)
  - search (in field)
  - bottom-tab icons: home, vendors, best-of, events, profile

Fonts (load via your existing pipeline; the prototype uses Google Fonts):
- `Bricolage Grotesque` weights 700, 800, 900
- `Inter` weights 500, 700

---

## Files in this bundle
- `Profile screen.html` — host page that mounts both variants side by side. Variant A is the target; Variant B is included for reference.
- `profile.jsx` — exports `ProfileEditorial` (this design — the target) and `ProfileMemberCard` (the other variant, out of scope). Also exports `DEMO_PROFILE` as a fixture.
- `tweaks-panel.jsx` — prototyping utility for the variant toggle. **Not needed for production.**

Reference the prototype side-by-side with this README. Numbers in the prototype are the source of truth where this README is silent.
