-- Migration: Systems & Technology matrix (added 2026-06-25).
--
-- One row per property-system. Backs the corporate cross-property "Systems"
-- matrix (/corporate/systems) that answers two ops questions Chris raised:
--   1. Termination legend — when a property is dropped, every vendor + account
--      to cancel and who to notify (filter the matrix to one property).
--   2. Double-pay detection — two active vendors for the SAME service_type at
--      one property = a billing overlap to kill.
--
-- Why a dedicated table (not property_contacts): we need a STRUCTURED
-- service_type from a controlled list (phone/isp/wifi_managed/cable_tv/cameras/
-- alarm_fire/door_locks/pms) plus cost, contract term, cancel-notice and a
-- status — fields that don't fit the generic Who-to-Call contact shape, and
-- that keep the matrix / double-pay queries clean.
--
-- monthly_cost_cents is stored in cents to match documents.amount_cents.
--
-- Apply with: npm run db:apply:systems:local   (or :remote)
CREATE TABLE IF NOT EXISTS property_systems (
  id                 TEXT PRIMARY KEY,
  property_id        TEXT NOT NULL REFERENCES properties(id),
  service_type       TEXT NOT NULL,   -- phone|isp|wifi_managed|cable_tv|cameras|alarm_fire|door_locks|pms
  vendor_name        TEXT NOT NULL,
  account_number     TEXT,
  contact_name       TEXT,
  contact_phone      TEXT,
  contact_email      TEXT,
  monthly_cost_cents INTEGER,         -- cents; NULL = unknown
  contract_end       TEXT,            -- ISO date the term/contract ends (optional)
  cancel_notice      TEXT,            -- how to cancel, e.g. "30 days written notice to billing@"
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','cancelled')),
  notes              TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_by         TEXT NOT NULL REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_property_systems_property ON property_systems(property_id);
CREATE INDEX IF NOT EXISTS idx_property_systems_type     ON property_systems(service_type);
CREATE INDEX IF NOT EXISTS idx_property_systems_status   ON property_systems(status);
