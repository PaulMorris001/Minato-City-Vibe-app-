# Deploying the admin portal to Hostinger

The admin portal ships as a static Vite bundle on its **own subdomain**,
`admin.ourcityvibe.com`, hosted on the same Hostinger plan as the marketing site.

## Why a subdomain and not `ourcityvibe.com/admin`

The admin session token lives in `localStorage` (`src/contexts/AuthContext.tsx`).
`localStorage` is partitioned by **origin**, so:

- On its own subdomain, an XSS anywhere in the public site — which renders
  user-supplied event titles, vendor bios and guide text — cannot read the admin
  token. The browser's same-origin policy is the boundary.
- Served from a `/admin` path, the two share one origin and that boundary is
  gone. One stored-XSS in user content becomes full admin compromise: delete
  users, approve payouts, resolve reports.

Both options are "deployed on Hostinger together" — same plan, same panel, one
upload each. The subdomain just keeps the boundary.

**What this does not do:** the bundle is public static JS. Every route, endpoint
and field name in it is readable by anyone. Nothing here hides the portal, and
nothing should be treated as if it does. Authorization is enforced entirely by
the API (`authenticateAdmin` in `server/src/middleware/admin.middleware.js`).

---

## One-time setup

### 1. Server environment (Render)

Set these on the API service, then redeploy:

| Variable | Value |
| --- | --- |
| `ADMIN_JWT_SECRET` | `openssl rand -base64 48` — **must differ from `JWT_SECRET`** |
| `ADMIN_PASSWORD_HASH` | output of `npm run hash-admin-password` (from repo root) |
| `CORS_ORIGIN` | `https://www.ourcityvibe.com,https://ourcityvibe.com,https://admin.ourcityvibe.com` |

Then **delete** the plaintext `ADMIN_PASSWORD` variable.

The server logs a `[security]` warning at boot for each of these that's still
unset, so check the deploy logs are clean afterwards. Nothing hard-fails — that's
deliberate, so a deploy can't lock you out of the portal.

Existing admin sessions are invalidated the moment `ADMIN_JWT_SECRET` changes
(old tokens no longer verify). Just log in again.

### 2. Create the subdomain in hPanel

1. hPanel → **Domains → Subdomains**
2. Create subdomain: `admin` on `ourcityvibe.com`
3. Note the document root it creates — usually
   `domains/admin.ourcityvibe.com/public_html`
4. hPanel → **Security → SSL** → issue/force the free certificate for the new
   subdomain. The `.htaccess` redirects HTTP→HTTPS, but the cert has to exist
   first or the redirect lands on a warning page.

DNS propagation for the subdomain typically takes a few minutes; the SSL issue
step will fail until it resolves.

---

## Each deploy

```bash
# from the repo root
npm run build:sites      # builds web/dist and admin/dist
# or individually:
npm run build:admin
```

Then upload via hPanel **File Manager** (or SFTP):

| Build output | Upload to |
| --- | --- |
| `admin/dist/*` | `domains/admin.ourcityvibe.com/public_html/` |
| `web/dist/*` | `public_html/` |

**Upload the contents of `dist/`, not the `dist` folder itself.**

Two things to watch:

- **Include the dotfile.** `admin/dist/.htaccess` is what provides the SPA
  fallback, HTTPS redirect, CSP and cache headers. Hostinger's File Manager
  hides dotfiles by default — enable "show hidden files" and confirm it landed,
  or the portal 404s on every route except `/`.
- **Delete the old `assets/` directory first.** Vite fingerprints filenames, so
  stale bundles accumulate forever otherwise.

`index.html` is served `no-cache` and `assets/*` are `immutable`, so a fresh
build reaches browsers immediately without a hard refresh.

---

## Verify after deploying

1. `https://admin.ourcityvibe.com` loads the login page over HTTPS.
2. Navigate to `/users`, then **hard-refresh** — it should stay on `/users`, not
   404. (This is the `.htaccess` SPA fallback working.)
3. Log in. Check the browser console for CSP violations — there should be none.
4. Confirm the API is reachable cross-origin: the dashboard stats should load.
   A CORS error here means `CORS_ORIGIN` is missing the admin subdomain.
5. Deliberately fail the login ~10 times; you should get
   "Too many attempts" (the `adminLoginLimiter`, 15-minute window). Successful
   logins don't count against it.

If step 4 fails with a CSP `connect-src` error rather than a CORS error, the API
origin in `.htaccess` doesn't match what `src/api/client.ts` is calling.

---

## Local development

```bash
npm run admin     # vite dev on :5173, talks to localhost:3100
npm run server
```

`VITE_API_URL` overrides the API base if you need to point a dev build at
production or a staging box.
