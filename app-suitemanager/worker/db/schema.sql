-- Suite Manager Document Portal — D1 schema
-- v2 (2026-05-20): GM uploads (Invoice/Statement/Other) + HR Resources library.
-- Apply with: npm run db:apply:remote

-- Properties (hotels)
-- v2 (2026-05-20): expanded for CRM-style fields from the ASA property roster.
CREATE TABLE IF NOT EXISTS properties (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  code            TEXT,                            -- CHORUM / internal property code (e.g. AFFMYR)
  brand           TEXT,                            -- 'asa' (Affordable Suites of America) | 'acs' (Affordable Corporate Suites) | NULL
  owner_group     TEXT,                            -- "Arthur/Chris", "Richard/Michael" etc.; freeform until owners table exists
  address_street  TEXT,
  address_city    TEXT,
  address_state   TEXT,                            -- 2-letter abbreviation
  address_zip     TEXT,
  room_count      INTEGER,
  phone           TEXT,                            -- front-desk
  fax             TEXT,
  emergency_phone TEXT,                            -- 24/7 GM cell
  property_email  TEXT,                            -- property inbox
  latitude        REAL,                             -- geocoded via Nominatim (scripts/geocode-properties.mjs)
  longitude       REAL,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_code ON properties(code);

-- Users (per-GM login + Strand + HR admin + SM admin)
-- password_hash is NULL while an invite is outstanding (set via /invite/:token).
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  password_hash     TEXT,                                  -- PBKDF2 via Web Crypto; NULL until invite activated
  role              TEXT NOT NULL CHECK (role IN ('gm','strand','admin')),
  property_id       TEXT REFERENCES properties(id),
  active            INTEGER NOT NULL DEFAULT 1,
  invite_token      TEXT,                                  -- 64-char hex; NULL after activation
  invite_expires_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_token);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documents — operational docs in Strand's payment queue.
-- property_id is NULL for Corporate uploads (personal expense reports, mileage,
-- special invoices) submitted by admin or strand. Property-scoped uploads
-- (GMs + admin-on-behalf) keep property_id set so a GM only sees their own.
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  property_id   TEXT REFERENCES properties(id),   -- NULL = Corporate
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL CHECK (category IN ('invoice','statement','other','expense','mileage')),
  vendor        TEXT,
  amount_cents  INTEGER,
  note          TEXT,
  r2_key        TEXT NOT NULL,                            -- documents/{propertyId}/{category}/{id}-{filename}
  filename      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  mime_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','archived')),
  flagged       INTEGER NOT NULL DEFAULT 0,
  assigned_to   TEXT REFERENCES users(id),
  -- Payment workflow
  payment_status TEXT NOT NULL DEFAULT 'unpaid',           -- 'unpaid' | 'paid'
  check_number   TEXT,
  check_date     TEXT,
  paid_at        TEXT,
  paid_by        TEXT REFERENCES users(id),
  -- Approval workflow (invoices at/above the threshold setting)
  approval_status      TEXT NOT NULL DEFAULT 'not_required', -- 'not_required' | 'pending' | 'approved' | 'denied'
  approval_reason      TEXT,
  approval_decided_by  TEXT REFERENCES users(id),
  approval_decided_at  TEXT,
  invoice_number TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_approval ON documents(approval_status);

-- App settings (key-value). e.g. approval_threshold_cents.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('approval_threshold_cents', '50000');

-- Resources — HR-uploaded templates GMs can browse and download
CREATE TABLE IF NOT EXISTS resource_folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resources (
  id          TEXT PRIMARY KEY,
  folder_id   TEXT REFERENCES resource_folders(id),
  title       TEXT NOT NULL,
  description TEXT,
  r2_key      TEXT NOT NULL,                              -- resources/{folderId}/{id}-{filename}
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

-- Financial statements — uploaded by Strand/admin (and later owners),
-- property-scoped, time-series. P&Ls / balance sheets / cash flow /
-- budgets / other. GMs see only their own property; admin sees all.
CREATE TABLE IF NOT EXISTS financial_statements (
  id              TEXT PRIMARY KEY,
  property_id     TEXT NOT NULL REFERENCES properties(id),
  uploaded_by     TEXT NOT NULL REFERENCES users(id),
  statement_type  TEXT NOT NULL CHECK (statement_type IN ('profit_loss','balance_sheet','cash_flow','budget','other')),
  period_year     INTEGER NOT NULL,
  period_month    INTEGER,                                  -- NULL for annual statements
  title           TEXT NOT NULL,
  description     TEXT,
  r2_key          TEXT NOT NULL,                            -- properties/{id}/financials/{year}/{mm}/{type}/...
  filename        TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  mime_type       TEXT NOT NULL,
  archived_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_financials_property_period
  ON financial_statements(property_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_financials_type ON financial_statements(statement_type);
CREATE INDEX IF NOT EXISTS idx_financials_active ON financial_statements(archived_at);

-- Property fact sheet — labeled operational data (alarm codes, utility
-- accounts, access instructions). Visible to that property's GM + Strand + admin.
CREATE TABLE IF NOT EXISTS property_facts (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  label       TEXT NOT NULL,
  value       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_property_facts_property ON property_facts(property_id);

-- Property document library — inspections, QAs, licenses, permits, contracts.
CREATE TABLE IF NOT EXISTS property_files (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL CHECK (category IN ('inspection','qa','license','permit','contract','other')),
  title       TEXT NOT NULL,
  description TEXT,
  expires_at  TEXT,
  r2_key      TEXT NOT NULL,
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_property_files_property ON property_files(property_id);
CREATE INDEX IF NOT EXISTS idx_property_files_active ON property_files(archived_at);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id),
  resource_id TEXT REFERENCES resources(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,                              -- 'upload'|'download'|'review'|'archive'|'assign'|'login'
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_property      ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_docs_category      ON documents(category);
CREATE INDEX IF NOT EXISTS idx_docs_status        ON documents(status);
CREATE INDEX IF NOT EXISTS idx_audit_doc          ON audit_events(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource     ON audit_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_resources_folder   ON resources(folder_id);
CREATE INDEX IF NOT EXISTS idx_resources_active   ON resources(archived_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);
