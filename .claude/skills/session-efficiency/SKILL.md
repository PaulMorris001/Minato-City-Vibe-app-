---
name: session-efficiency
description: Token, context and tool-call discipline for the Cityvibe monorepo. Load at the start of every session and re-read before any broad search, before reading a large file, and when the context window is filling up. Covers which files must never be read whole, how to search cheaply, how to batch tool calls, what to keep out of responses, and when to compact or hand off.
---

# Session efficiency

This repo is large (~57k lines of mobile TS, ~29k lines of server JS, plus two
Vite apps). Naive exploration burns the context window before any work starts.
These rules are about spending tokens where they buy correctness.

## The rule that matters most

**Never open a file to find out what is in it.** Use `cityvibe-map` to get the
path, `grep` to get the line number, then read a window around that line. A
full-file read is a last resort reserved for files under ~200 lines or files you
are about to rewrite.

## Files that must never be read whole

| File | Lines | Instead |
|---|---|---|
| `mobile/tsconfig.json` | ~242 KB | `grep -n '"paths"' -A6` — it is a vendored blob, `cat` will blow the window |
| `mobile/app/event/[id].tsx` | 3482 | grep the handler/component name, read ±60 lines |
| `mobile/app/chat/[id].tsx` | 3130 | same |
| `mobile/app/manage-events.tsx` | 2351 | same |
| `mobile/app/(tabs)/home.tsx` | 1825 | same |
| `server/src/controllers/event.controller.js` | 2527 | grep the exported function name, read that function only |
| `server/src/controllers/auth.controller.js` | 1796 | same |
| `server/src/controllers/payments.controller.js` | 1080 | same |
| `server/src/services/chat.service.js` | 1022 | same |
| anything under `node_modules/`, `mobile/ios/Pods/`, `mobile/dist/` | — | never read; exclude from every search |

Standard exclusion for any repo-wide search:

```bash
--include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=Pods --exclude-dir=dist \
  --exclude-dir=build --exclude-dir=.expo --exclude-dir=.git
```

## Search ladder — stop as soon as you have the answer

1. **`cityvibe-map`** — if the feature is in the map, you already have the path. No search needed.
2. **`grep -rn "<exact symbol>"`** — function name, endpoint string, model name. Exact strings beat fuzzy descriptions.
3. **`grep -rln`** (names only) when you expect many hits — get the file list, then grep with `-n` inside the one file you care about.
4. **Read with `offset`/`limit`** around the hit.
5. Only if 1–4 all fail: a broader read.

Do not run the same search twice with different phrasings. If a grep returns
nothing, the string is wrong — check spelling against the map before widening.

## Batch aggressively

Independent tool calls go in **one** message. Exploring a feature usually means
one message with: server controller grep + mobile screen grep + model read. Three
round-trips collapsed into one. Do not serialize calls that have no data
dependency between them.

## Do not re-verify what the tools already told you

- After `Edit`/`Write` succeeds, the change is on disk. Do **not** re-read the file to confirm.
- After a successful `git` command, do not re-run it to check.
- Do not read a file you wrote earlier in the same session — you have its content.

## Type-checking and lint noise

`mobile/` has roughly **3000 baseline `tsc` errors** from a vendored blob. Raw
`tsc` output is useless and enormous. Always filter to the files you touched:

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -E "^(app|components|contexts|hooks|utils|services|libs)/" | grep -F "<file-you-edited>"
```

`server/` has no test command (`npm test` is a stub) — do not run it and do not
report its output as a result.

## Response discipline

- Never paste file contents back to the user. Cite `path:line`; the terminal makes it clickable.
- Never echo a diff you just applied. Summarize what changed in one line per file.
- Never narrate options you are not going to take, or re-explain a decision the user already made.
- No preambles ("Great question", "Let me start by…"). Lead with the answer or the action.

## Context budget over a long session

Track roughly where you are:

- **Early (plenty of room):** explore freely within the ladder above.
- **Mid:** stop re-reading files. Work from what you already have. Prefer targeted greps over new reads.
- **Late (context filling):** stop exploring entirely. Finish the current edit, then write down anything durable — see below — before the window compacts.

The harness summarizes automatically when the window fills, so do not wrap up
work early or force a handoff. But **do** externalize state that a summary would
lose: intermediate results and long output go in the scratchpad directory, not in
the conversation.

## Persist the non-obvious, not the visible

Before a long session ends, write to the user's memory directory anything that
was **hard to discover and cheap to forget**: a landmine, a required migration
order, a convention that contradicts what the code appears to do. Do not save
file structure, past fixes, or anything the repo already records — that is what
`cityvibe-map` and git history are for.

## Subagents

Per this project's standing instruction: **do not spawn agents unless the user
explicitly asks.** A cold subagent re-derives context you already hold, which
costs more than doing the work inline. A task being multi-part is not a reason to
fan out.

## Long-running commands

Use `run_in_background: true` for anything that outlives a single answer (Expo
dev server, `vite dev`, `nodemon`, EAS builds). Do not foreground-block on them
and do not poll them with `sleep` loops.
