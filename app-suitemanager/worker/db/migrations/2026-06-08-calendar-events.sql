-- Migration: shared calendar + GM PTO workflow.
--
-- Two sources of events live in this table:
--   - regional: admin/Suite-Manager corporate folks post their own
--     travel/OOO. Posted directly; visible to admin + strand. Never to GMs.
--   - gm_pto:   GMs request time off via /my-property → admin reviews →
--     decision emails the GM. Approved PTO appears on the shared calendar.
--
-- Date storage convention: starts_at and ends_at are ISO YYYY-MM-DD when
-- all_day=1, ISO datetime otherwise. all_day defaults to 1 because both
-- regional schedules and PTO are almost always day-level.
--
-- Apply with: npm run db:apply:remote (or wrangler d1 execute --file=...)
CREATE TABLE IF NOT EXISTS calendar_events (
  id              TEXT PRIMARY KEY,
  owner_user_id   TEXT NOT NULL REFERENCES users(id),
  source          TEXT NOT NULL CHECK (source IN ('regional','gm_pto')),
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL,
  -- For regional: 'travel' | 'ooo' | 'other'
  -- For gm_pto:   'vacation' | 'sick' | 'personal'
  starts_at       TEXT NOT NULL,
  ends_at         TEXT NOT NULL,
  all_day         INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  approval_status TEXT NOT NULL DEFAULT 'not_required'
                  CHECK (approval_status IN ('not_required','pending','approved','denied')),
  approval_reason TEXT,
  decided_by      TEXT REFERENCES users(id),
  decided_at      TEXT,
  property_id     TEXT REFERENCES properties(id),  -- denorm for GM PTO; NULL for regional
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_owner    ON calendar_events(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_dates    ON calendar_events(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_calendar_approval ON calendar_events(approval_status);
CREATE INDEX IF NOT EXISTS idx_calendar_source   ON calendar_events(source);
