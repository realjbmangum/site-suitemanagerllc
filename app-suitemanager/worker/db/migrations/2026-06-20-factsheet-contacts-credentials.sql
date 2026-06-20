-- Migration: Fact Sheet "Red Binder" — Who-to-Call contacts + Passwords.
--
-- Two property-scoped tables back the operational fact sheet:
--   - property_contacts:    Who-to-Call directory. Three categories —
--       'people' (GM, housekeeper), 'vendors' (alarm, landscaper, plumber,
--       HVAC, etc.), 'emergency_utility' (police non-emer, electric, gas,
--       water/sewer, trash, etc.). Visible to that property's GM + Strand + admin.
--   - property_credentials: Passwords/logins (Guest Supply, HD Supply, Expedia,
--       Onity machines, alarm codes, etc.). Passwords are stored ENCRYPTED
--       (password_ciphertext + password_iv); never plaintext.
--
-- No-duplication rule: address, room_count, front-desk phone, fax,
-- emergency_phone (24/7 GM cell) and property_email already live on the
-- properties record / Overview tab — do NOT re-capture them here. The GM
-- person is the assigned user (read-only), not re-entered.
--
-- is_custom = 1 marks rows a GM added beyond the seeded default set.
--
-- Apply with: npm run db:apply:remote (or wrangler d1 execute --file=...)
CREATE TABLE IF NOT EXISTS property_contacts (
  id             TEXT PRIMARY KEY,
  property_id    TEXT NOT NULL REFERENCES properties(id),
  category       TEXT NOT NULL CHECK (category IN ('people','vendors','emergency_utility')),
  label          TEXT NOT NULL,
  contact_name   TEXT,
  phone          TEXT,
  mobile         TEXT,
  email          TEXT,
  account_number TEXT,
  fax            TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_custom      INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_property_contacts_property ON property_contacts(property_id);

CREATE TABLE IF NOT EXISTS property_credentials (
  id                  TEXT PRIMARY KEY,
  property_id         TEXT NOT NULL REFERENCES properties(id),
  label               TEXT NOT NULL,
  account_number      TEXT,
  username            TEXT,
  password_ciphertext TEXT,
  password_iv         TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  is_custom           INTEGER NOT NULL DEFAULT 0,
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_property_credentials_property ON property_credentials(property_id);
