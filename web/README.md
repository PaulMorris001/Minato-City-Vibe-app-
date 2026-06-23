# CityVibe Web (marketing + legal)

The public website for CityVibe, hosted at **https://www.ourcityvibe.com** on
Hostinger. It is a static Vite + React + React Router app — no server runtime.

These pages used to be served by the backend (Render). They now live here so the
API server only handles the API, deep-link share pages, and the app-link
verification files.

## Pages

| Route             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `/`               | Marketing landing page                              |
| `/privacy`        | Privacy policy                                      |
| `/csae-policy`    | Child safety (CSAE) policy — path matches Play Console |
| `/csae`           | Alias for `/csae-policy`                             |
| `/delete-account` | Account deletion form (calls the backend API)       |

> Event/guide **share links** and the `/.well-known/*` app-link files are NOT
> here — they require server-side rendering + database access and stay on the
> backend at `api.ourcityvibe.com`.

## Develop

```bash
cd web
npm install
npm run dev      # http://localhost:5174
```

## Configuration

`src/config.ts` reads the backend URL from `VITE_API_URL`, defaulting to
`https://api.ourcityvibe.com`. The delete-account form POSTs to
`${API_BASE}/api/account/delete`.

## Build & deploy to Hostinger

```bash
cd web
npm install
npm run build    # outputs static files to web/dist
```

Then upload the **contents of `dist/`** to your Hostinger `public_html`
directory (via hPanel File Manager or FTP). The included `.htaccess` (copied
into `dist/`) makes Apache serve `index.html` for client-side routes so
`/privacy`, `/csae-policy`, and `/delete-account` resolve on a direct hit or
hard refresh.

### DNS (Hostinger)

- `www.ourcityvibe.com` → your Hostinger site (handled automatically when the
  domain is on Hostinger).
- Apex `ourcityvibe.com` → redirect to `www` (set in hPanel → Redirects), or
  point it at the same site.
- `api.ourcityvibe.com` → **CNAME** to the target Render shows under the web
  service's *Settings → Custom Domains* (do NOT point this at Hostinger).
