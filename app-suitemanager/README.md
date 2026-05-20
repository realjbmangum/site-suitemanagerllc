# Suite Manager Document Portal

The branded document upload + HR resources app at **`app.suitemanagerllc.com`**.

Astro + Tailwind v4 on Cloudflare Pages with D1 (metadata) and R2 (files).

> Specs live one level up: `../tasks/PRD-document-portal.md`,
> `../tasks/TECHNICAL-SPEC.md`, `../tasks/DESIGN-BRIEF.md`.

---

## Status

**Scaffolded May 20, 2026.** Routes and layouts exist with placeholder data
matching the design brief. Auth, the API layer, and the R2/D1 wiring are
**not implemented yet** — those are the next sessions of work.

Pages present:

| Route | For | What's wired |
|---|---|---|
| `/login` | everyone | Static form. Posts to `/api/auth/login` (not built). |
| `/upload` | GM | Static UI matching the GM mockup. |
| `/resources` | GM/Strand/HR | Static UI for the HR Resources library. |
| `/dashboard` | Strand/admin | Static UI matching the back-office mockup. |
| `/admin/templates` | HR/admin | Static UI for the HR upload tool. |

Visual reference: `mockups/01-gm-upload.png`, `mockups/02-strand-dashboard.png`.

---

## First-time setup

```bash
# from this directory
npm install

# Create D1 — paste the returned database_id into wrangler.toml
wrangler d1 create suitemanager-portal

# Create R2 bucket
wrangler r2 bucket create suitemanager-portal-files

# Apply schema
npm run db:apply:remote

# Set secrets (in Cloudflare Pages project, NOT in wrangler.toml)
wrangler pages secret put SESSION_SECRET --project-name suitemanager-portal

# Email transport is Microsoft Graph (Suite Manager's M365 tenant), wired in a
# later session. Once the Azure AD app registration exists:
#   wrangler pages secret put GRAPH_CLIENT_SECRET --project-name suitemanager-portal
# and set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_SENDER_USER_ID as plain vars.
```

## Dev

```bash
npm run dev          # Astro dev server (no D1/R2 access in this mode)
npm run preview      # wrangler pages dev with D1+R2 bindings
```

## Build & deploy

```bash
npm run build
npm run deploy
```

After the first deploy, add the custom domain `app.suitemanagerllc.com` in
the Cloudflare Pages project (Settings → Custom domains).

---

## Next sessions of work (build order from PRD §10)

1. Auth — login API, session cookie, middleware, password hashing (PBKDF2 via Web Crypto)
2. R2 storage + `/api/upload`
3. Email notification routing
4. `/api/documents` — list / filter / search / patch
5. Dashboard wiring + pending-review logic
6. HR Resources API + UI wiring (folders, upload, replace, versioning)
7. Audit log writes on every upload / download
8. Role-based query scoping
9. Branding polish pass
