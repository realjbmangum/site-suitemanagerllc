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

-- Documents — GM-uploaded operational docs
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL REFERENCES properties(id),
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL CHECK (category IN ('invoice','statement','other')),
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
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at   TEXT
);

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
