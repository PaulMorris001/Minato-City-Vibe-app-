---
name: map-sync
description: Update the cityvibe-map skill after shipping a feature, so the next AI session starts from an accurate feature-to-file map instead of a stale one. Run it before finishing any task that added, moved, renamed or deleted files, changed a route or endpoint, added a migration script, or uncovered a non-obvious invariant. Covers how to read the change set cheaply, which map section to edit, what earns a Landmine entry, what to delete, and what must never go in the map.
---

# Map sync

`cityvibe-map` is the first thing every session reads and the reason nobody has
to grep for where things live. That only holds while it is true. A map that
describes the repo as it was six months ago is worse than no map: it sends
sessions confidently to files that moved, and they trust it because it is a
skill.

Your job here is small and mechanical. Read what changed, edit the matching
lines, delete what is gone. This is not a changelog and not documentation.

## When to run

Before finishing any task that:

- added, moved, renamed or deleted a file that another session would need to find
- added or changed a route, endpoint, or background job
- added a migration or one-off script
- turned up an invariant that contradicts what the code looks like it does

Skip it when nothing about the repo's shape changed — a bug fix inside an
existing function, a copy tweak, a dependency bump. Editing the map to record
that a function got faster is noise.

## Step 1 — read the change set, don't scan the repo

```bash
git diff --name-status main...HEAD
git status --porcelain
```

That is the entire input. `--name-status` gives you the A/M/D/R letter per path,
which is exactly the four things this skill acts on. **Do not** re-explore the
repo to "check" the map — that costs more than the map is worth and is how this
step gets skipped next time.

Read a changed file only when the diff alone doesn't tell you what a reader would
need to find it by.

## Step 2 — route each path to its section

`cityvibe-map/SKILL.md` has a fixed set of `##` sections, ordered by product
importance rather than alphabetically. Route by what the file *does*, not where
it sits:

| Changed path involves | Section |
|---|---|
| login, signup, OTP, tokens, account deletion | Auth & accounts |
| follow, block, report, profiles, favorites | Users, social graph, moderation |
| events, external/aggregated events | Events |
| tickets, passes, QR, check-in, attendance | Passes, tickets, check-in |
| chat, messages, sockets, inboxes | Chat & messaging |
| cities, vendor types, vendor profiles, vendor tabs | Vendor discovery & vendor account |
| catalogue, services, cart, orders, bookings | Catalogue → cart → order → booking |
| providers, checkout, payouts, earnings, discounts | Payments |
| guides | Guides |
| push, in-app notifications, email | Notifications & email |
| search, location, uploads, deep links, logging, legal | Search, location, uploads, misc |
| admin console | Admin console |
| jobs, migrations, one-off scripts | Background jobs & one-off scripts |
| env, config, theme/constants files | Config |

Inside a section, entries are grouped `Server:` / `Mobile:` / `Web:` / `Admin:`.
Add the path to the line that already exists rather than starting a new bullet.

A genuinely new product area gets a new `##` section, placed by dependency order
(near the sections it builds on), not appended to the end.

## Step 3 — apply the smallest edit

- **Added file** → add the path to the right group, in the same bare style as its
  neighbours. No description unless the name doesn't carry it.
- **Renamed/moved file** → change the path in place. Check whether the old name
  appears anywhere else in the map, including in prose.
- **Deleted file** → delete the entry. Also delete any Landmine or note that only
  existed because of that file. **This is the step that gets forgotten**, and a
  map that lists deleted files is the specific failure this skill exists to
  prevent.
- **New route or endpoint** → update the route table in the section that owns it.
  If ordering between routes is load-bearing, say so on the line.
- **New migration or script** → add it to Background jobs & one-off scripts, and
  say it must be run per environment. These get forgotten precisely because
  nothing runs them automatically.
- **Line counts** → only for files big enough that reading them whole would hurt,
  and only as a warning to grep instead. Do not add or update counts otherwise.

## Step 4 — Landmines, sparingly

The numbered Landmines list at the top is the highest-value part of the map and
the easiest to dilute. An entry earns its place only if a competent engineer
would get it wrong by reading the code and believing what they saw. The existing
entries are the calibration: mixed model export styles, per-route auth,
load-bearing route order, raw-body parsers before `express.json()`, params that
may be slugs, a util that looks live but is dead.

Add one when the change created or revealed something of that kind. Renumber the
list if you insert in the middle. Delete an entry the change made untrue.

"We added a new controller" is not a landmine. "This controller's amounts are in
cents while its sibling's are in major units, and currency can't tell them
apart" is.

When you add a Landmine, mirror it into the **Non-negotiables** list in
`CLAUDE.md` as one line. That file is loaded even when the map is not.

## What must never go in the map

- Prose explaining how something works. That belongs in the code, or in
  `code-standards` if it is a convention.
- Changelog entries, dates, PR numbers, or who changed what. Git has those.
- Anything that will be false next month — counts, sizes, "recently added".
- Duplicates of what `session-efficiency` or `code-standards` already own. The
  map answers "where", those two answer "how much" and "how".

Memory is a separate question: `session-efficiency` already says to persist the
non-obvious to the user's memory directory, and explicitly says file structure is
the map's job. Don't write structure into memory, and don't write session notes
into the map.

## Step 5 — check your own edit

Re-read the diff of `cityvibe-map/SKILL.md` and confirm:

1. Every path you added exists (`ls` it — a typo'd path in the map is worse than
   an absent one, because it will be trusted).
2. Every path you deleted is genuinely gone from the repo.
3. Nothing you wrote is a sentence a reader would skip.

Then tell the user in one line what you changed about the map, the same way you
report any other file you touched. It is a real edit to a checked-in file, not
bookkeeping to be done silently.
