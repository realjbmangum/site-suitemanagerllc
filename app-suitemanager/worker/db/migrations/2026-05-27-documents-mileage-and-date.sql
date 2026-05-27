-- Migration: per-category fields for Corporate documents.
-- Adds nullable columns so old code keeps working — both are NULL for
-- existing rows.
--
--   miles            miles driven (mileage category only)
--   transaction_date  date the underlying transaction happened — meaning
--                     varies by category:
--                       invoice → due date
--                       expense → date of expense
--                       mileage → trip date
--                       other   → unused / free
--
-- Apply with:
--   wrangler d1 execute suitemanager-portal --remote --file=./worker/db/migrations/2026-05-27-documents-mileage-and-date.sql

ALTER TABLE documents ADD COLUMN miles REAL;
ALTER TABLE documents ADD COLUMN transaction_date TEXT;
