-- Migration: make documents.property_id nullable and add expense/mileage categories.
-- SQLite can't drop NOT NULL or alter a CHECK in place, so we rebuild the table.
-- Apply with:
--   wrangler d1 execute suitemanager-portal --remote --file=./worker/db/migrations/2026-05-27-documents-corporate.sql
--
-- Disable FK checks for the duration of the rebuild — audit_events.document_id
-- would otherwise blow up when documents is dropped mid-migration.
PRAGMA foreign_keys = OFF;

CREATE TABLE documents_new (
  id            TEXT PRIMARY KEY,
  property_id   TEXT REFERENCES properties(id),   -- NULL = Corporate
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL CHECK (category IN ('invoice','statement','other','expense','mileage')),
  vendor        TEXT,
  amount_cents  INTEGER,
  note          TEXT,
  r2_key        TEXT NOT NULL,
  filename      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  mime_type     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','archived')),
  flagged       INTEGER NOT NULL DEFAULT 0,
  assigned_to   TEXT REFERENCES users(id),
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  check_number   TEXT,
  check_date     TEXT,
  paid_at        TEXT,
  paid_by        TEXT REFERENCES users(id),
  approval_status      TEXT NOT NULL DEFAULT 'not_required',
  approval_reason      TEXT,
  approval_decided_by  TEXT REFERENCES users(id),
  approval_decided_at  TEXT,
  invoice_number TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at   TEXT
);

INSERT INTO documents_new
  (id, property_id, uploaded_by, category, vendor, amount_cents, note,
   r2_key, filename, size_bytes, mime_type, status, flagged, assigned_to,
   payment_status, check_number, check_date, paid_at, paid_by,
   approval_status, approval_reason, approval_decided_by, approval_decided_at,
   invoice_number, created_at, reviewed_at)
SELECT
   id, property_id, uploaded_by, category, vendor, amount_cents, note,
   r2_key, filename, size_bytes, mime_type, status, flagged, assigned_to,
   payment_status, check_number, check_date, paid_at, paid_by,
   approval_status, approval_reason, approval_decided_by, approval_decided_at,
   invoice_number, created_at, reviewed_at
FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX IF NOT EXISTS idx_documents_approval ON documents(approval_status);
CREATE INDEX IF NOT EXISTS idx_docs_property      ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_docs_category      ON documents(category);
CREATE INDEX IF NOT EXISTS idx_docs_status        ON documents(status);

PRAGMA foreign_keys = ON;
