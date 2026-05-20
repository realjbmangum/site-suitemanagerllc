# Technical Spec — Suite Manager Document Portal
> Status: DRAFT (v2) | Date: May 20, 2026 | Owner: Brian Mangum (Ascend Systems)
> Companion to: `tasks/PRD-document-portal.md`
> v2 changes: Standalone app at `app.suitemanagerllc.com`; HR upload removed; HR Resources library added.

---

## 1. Architecture Overview

The portal is a **standalone** Astro + Cloudflare Pages app at `app.suitemanagerllc.com`, in its own repo folder (`app-suitemanager/`). The marketing site at `suitemanagerllc.com` is unaffected.

```
                 ┌──────────────────────────────┐
  GM browser ───▶│  app.suitemanagerllc.com      │
  Strand browser │  (Astro on Cloudflare Pages)  │
  HR admin       │                               │
  SM admin       │  ┌─────────────────────────┐  │
                 │  │ Pages Functions (API)   │  │
                 │  └───┬─────────┬───────┬───┘  │
                 └──────│─────────│───────│──────┘
                        ▼         ▼       ▼
                   D1 (meta)  R2 (files)  Email API
                                          (notifications)
```

- **Astro** renders portal pages (server output, not static — auth required).
- **Pages Functions** handle auth, uploads, downloads, dashboard queries, resources.
- **D1** stores all metadata: users, properties, documents (GM uploads), resources (HR templates), audit events.
- **R2** stores file blobs in two key prefixes: `documents/` for GM uploads and `resources/` for HR templates. Remote binding only — never local.
- **Email API** sends routing notifications.

Deploy mode: Cloudflare **Pages** with `output: 'server'` and the Cloudflare adapter. Run the Cloudflare preflight audit before deploying.

---

## 2. Subdomain & Routing

| Route | Access | Purpose |
|---|---|---|
| `/login` | public | Login form |
| `/upload` | GM | GM upload view (own property only) |
| `/resources` | GM, Strand, HR, admin | Browse HR template library, download |
| `/dashboard` | Strand, SM admin | Back-office document table |
| `/admin/templates` | HR admin, SM admin | Upload/organize/replace HR templates |
| `/admin/users` | SM admin | Manage properties + accounts |
| `/api/auth/*` | public/session | Login, logout, session check |
| `/api/upload` | GM (POST) | Receive file + metadata |
| `/api/documents` | Strand/admin (GET) | List/filter/search documents |
| `/api/documents/:id/download` | role-checked | Stream file from R2, log event |
| `/api/documents/:id` | Strand/admin (PATCH) | Mark reviewed, assign, note, archive |
| `/api/resources` | session (GET) | List templates, scoped by folder |
| `/api/resources` | HR/admin (POST) | Upload new template |
| `/api/resources/:id` | HR/admin (PATCH/DELETE) | Rename, move, replace, remove |
| `/api/resources/:id/download` | session (GET) | Stream template, log event |

Custom domain `app.suitemanagerllc.com` → CNAME to the Pages project.

---

## 3. Data Model (D1 — `suitemanager-portal`)

```sql
-- Properties (hotels)
CREATE TABLE properties (
  id            TEXT PRIMARY KEY,        -- nanoid (no double underscores)
  name          TEXT NOT NULL,           -- "Hampton Inn Myrtle Beach"
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  active        INTEGER NOT NULL DEFAULT 1
);

-- Users — per-GM login + Strand + HR admin + SM admin
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,           -- PBKDF2 via Web Crypto
  role          TEXT NOT NULL,           -- 'gm' | 'strand' | 'hr' | 'admin'
  property_id   TEXT REFERENCES properties(id),  -- required for role='gm', null otherwise
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,          -- random 32-byte hex
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documents — GM-uploaded operational docs (invoices, statements, other)
CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id),
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL,           -- 'invoice' | 'statement' | 'other'  (no HR uploads in v1)
  vendor        TEXT,                    -- "Cintas", "Ecolab" ...
  amount_cents  INTEGER,                 -- nullable; invoices only
  note          TEXT,
  r2_key        TEXT NOT NULL,           -- properties/{id}/{category}/{docId}-{filename}
  filename      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  mime_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new', -- 'new' | 'reviewed' | 'archived'
  flagged       INTEGER NOT NULL DEFAULT 0,  -- pending-review flag
  assigned_to   TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at   TEXT
);

-- Audit log — every upload and download
CREATE TABLE audit_events (
  id          TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,             -- 'upload' | 'download' | 'review' | 'archive' | 'assign'
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Resources — HR-uploaded templates GMs can browse and download
CREATE TABLE resource_folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,             -- "Onboarding", "Training", "Policies"
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE resources (
  id          TEXT PRIMARY KEY,
  folder_id   TEXT REFERENCES resource_folders(id),
  title       TEXT NOT NULL,             -- human label, e.g. "Blank I-9 (2026)"
  description TEXT,
  r2_key      TEXT NOT NULL,             -- resources/{folder_id}/{resourceId}-{filename}
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE INDEX idx_docs_property      ON documents(property_id);
CREATE INDEX idx_docs_category      ON documents(category);
CREATE INDEX idx_docs_status        ON documents(status);
CREATE INDEX idx_audit_doc          ON audit_events(document_id);
CREATE INDEX idx_resources_folder   ON resources(folder_id);
CREATE INDEX idx_resources_active   ON resources(archived_at);
```

All interface field names in TypeScript are **camelCase** (`propertyId`, `amountCents`, `uploadedBy`).

---

## 4. R2 Bucket — `suitemanager-portal-files`

Two key prefixes inside one bucket:
- GM uploads: `documents/{propertyId}/{category}/{documentId}-{sanitizedFilename}`
- HR templates: `resources/{folderId}/{resourceId}-{sanitizedFilename}`

Legacy convention (single prefix): `properties/{propertyId}/{category}/{documentId}-{sanitizedFilename}`
- Encryption at rest is on by default.
- Remote binding in `wrangler.toml`; never use `--local`.
- Files are never served publicly — all access goes through `/api/documents/:id/download`, which checks role + property scope, streams the blob, and writes an `audit_events` row.

---

## 5. Auth & Access Control

- **Login:** email + password. Password hashed with PBKDF2 (Web Crypto `subtle.deriveBits`, ≥100k iterations, per-user salt).
- **Session:** random token in an `HttpOnly; Secure; SameSite=Strict` cookie; row in `sessions`; 12-hour expiry.
- **Middleware** on every `/portal/*` and `/api/*` (except login) resolves the session, loads the user, attaches `{ userId, role, propertyId }` to context.

Access matrix enforced server-side:

| Role | Upload docs | See documents | Browse Resources | Upload Resources | Manage accounts |
|---|---|---|---|---|---|
| `gm` | own property only | own property only | yes (read-only) | no | no |
| `strand` | no | all properties, all categories | yes (read-only) | no | no |
| `hr` | no | **no** | yes | yes | no |
| `admin` | no | all properties, all categories | yes | yes | yes |

The `hr` role has zero visibility into GM document uploads — Engage handles that flow. HR's surface is Resources only.

---

## 6. Upload Flow

1. GM submits multipart POST to `/api/upload`: file + `category`, `vendor`, `amountCents`, `note`.
2. Server validates: session role = `gm`; MIME in allowlist (`application/pdf`, `image/jpeg`, `image/png`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`); size ≤ limit (default 25 MB — confirm with Chris).
3. Generate `documentId` (nanoid), compute `r2Key`, `put` blob to R2.
4. Insert `documents` row (`property_id` = GM's own).
5. Flag logic: set `flagged = 1` if size over threshold or category is `other` with no vendor.
6. Insert `audit_events` `upload` row.
7. Fire notification email (§7).
8. Return doc summary → UI shows confirmation + appends to recent-uploads strip.

---

## 7. Email Notifications

Transport: **Microsoft Graph API**, using Suite Manager's M365 tenant. App registration with `Mail.Send` application permission (admin-consented). Send via `POST https://graph.microsoft.com/v1.0/users/{senderUserId}/sendMail` after exchanging client credentials for a token at `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`.

On successful GM upload, send a Graph mail:

| Category | Recipient |
|---|---|
| `invoice`, `statement` | Strand Accounting inbox |
| `other` | SM admin |

Body: property name, GM name, category, vendor, amount, note, deep link to the dashboard row. Recipient addresses are env-config, not hardcoded. The OAuth access token is cached in module-scope memory until expiry (~60 min) to avoid per-request token requests.

HR Resources uploads do **not** send notifications by default — Karen pushes templates on her own schedule. A future enhancement could optionally email all GMs when a new template is published.

Wired in a later session — not part of the auth/upload sprint.

---

## 8. Dashboard Queries

`GET /api/documents` supports query params: `property`, `category`, `vendor`, `status`, `dateFrom`, `dateTo`, `amountMin`, `amountMax`, `q` (free-text over filename/vendor/note), `sort`, `page`. Role scoping is applied before any filter. Returns paginated rows + aggregate tiles (pending-review count, total storage bytes).

Row mutations via `PATCH /api/documents/:id`: `markReviewed`, `assign`, `addNote`, `archive` — each writes an `audit_events` row.

---

## 9. Environment Variables

| Var | Type | Purpose |
|---|---|---|
| `DB` | D1 binding | `suitemanager-portal` database |
| `FILES` | R2 binding | `suitemanager-portal-files` bucket |
| `GRAPH_TENANT_ID` | var | M365 tenant id (Suite Manager) |
| `GRAPH_CLIENT_ID` | var | Azure AD app registration client id |
| `GRAPH_CLIENT_SECRET` | secret | Azure AD app registration client secret |
| `GRAPH_SENDER_USER_ID` | var | Mailbox user id to send `from` |
| `STRAND_ACCOUNTING_EMAIL` | var | Invoice/statement notification recipient |
| `ADMIN_EMAIL` | var | `other` + fallback notifications |
| `SESSION_SECRET` | secret | Session token signing |
| `MAX_UPLOAD_BYTES` | var | Default 26214400 (25 MB) |

Secrets are runtime-only on Cloudflare — not available at build time.

---

## 10. Observability

- Audit log is the system of record for uploads/downloads — queryable, exportable for an auditor.
- Cloudflare Pages Functions logs for errors.
- Storage tile reads `SUM(size_bytes)` from `documents`.

---

## 11. Build Order (maps to PRD §10)

1. `wrangler.toml` — add D1 + R2 bindings; create DB and bucket.
2. Apply schema (`schema.sql`); seed properties + users for launch.
3. Auth: login/logout API, session middleware, password hashing.
4. `/api/upload` + GM upload view.
5. R2 storage routing + key convention.
6. Email notification routing.
7. `/api/documents` + dashboard table, filters, search.
8. Pending-review flag logic + tiles.
9. `PATCH` row actions + audit writes.
10. Role-based query scoping + HR silo.
11. Branding pass.

---

## 12. Open Technical Questions

- [ ] `docs.` vs `files.` subdomain.
- [ ] Confirm max file size (default 25 MB).
- [ ] Transactional email provider — reuse SendGrid (already in portfolio infra) vs Resend.
- [ ] Property + GM list for launch seed data.
- [ ] Strand and HR recipient email addresses.
- [ ] Password reset flow for v1, or admin-issued credentials only?

---

*Created May 19, 2026. Companion to PRD-document-portal.md.*
