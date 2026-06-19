-- Drop the CHECK constraint on documents.category so new categories
-- (e.g. deposit_slip, per Strand/Julie Jun 2026) can be added without a
-- schema migration each time. Category is now validated in app code
-- (lib/files.ts categoryFromForm). Existing values are preserved.
--
-- documents has an inbound FK (audit_events.document_id -> documents.id), so
-- foreign_keys must be FULLY OFF for the drop+rename. IDs are preserved on
-- reinsert, so the existing audit links stay valid.
--
-- NOTE: matches the LIVE 28-column shape (incl. miles, transaction_date added
-- by a prior migration that never updated schema.sql).
PRAGMA foreign_keys=OFF;

CREATE TABLE documents_new (
  id            TEXT PRIMARY KEY,
  property_id   TEXT REFERENCES properties(id),
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL,
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
  reviewed_at   TEXT,
  miles         REAL,
  transaction_date TEXT
);

INSERT INTO documents_new SELECT * FROM documents;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX IF NOT EXISTS idx_documents_approval ON documents(approval_status);
CREATE INDEX IF NOT EXISTS idx_docs_property ON documents(property_id);
CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);

PRAGMA foreign_keys=ON;
