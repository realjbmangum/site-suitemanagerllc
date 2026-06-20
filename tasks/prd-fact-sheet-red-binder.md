# PRD — Property Fact Sheet ("Red Binder") v2

**Status:** Draft for build · **Author:** Brian Mangum (Ascend) · **Date:** 2026-06-20
**App:** Suite Manager Document Portal (`app-suitemanager`)
**Source data:** `Docs(git-ignore)/Who to Call List.xlsx` + `Password list blank.xlsx`

---

## Overview

Replace the current flat label/value fact sheet with a **structured "red binder"** for each property: categorized **Contacts** (key people, vendors, emergency/utility) plus a **secure Credentials vault** (vendor logins, fire-alarm code, lock boxes). A **standardized template** applies to all ~31 properties so a cold GM or a traveling VP can walk into any hotel and run it. The sheet auto-formats the property page into clean, scannable sections and finally retires the physical binder + post-it notes.

This is the "State of the Union" Chris called the "lifeblood of a hotel site."

## Goals

1. **Structured Contacts** — typed fields (name, phone, mobile, email, account #, fax) grouped into **People**, **Vendors**, and **Emergency & Utilities**.
2. **Secure Credentials vault** — system/vendor, account #, username, password. Passwords **encrypted at rest**, shown **masked with click-to-reveal**, and **every reveal audited** (who / when / which credential).
3. **Standardized template** across every property (predefined rows from the two Excel lists), so every hotel's sheet has the same backbone; GMs fill the values (starting blank). Custom rows allowed.
4. **Visibility:** a GM sees **their own property's full sheet** (contacts + credentials); admin/Strand see **all** properties. Enforced at page, list-API, and reveal-API layers.
5. **Auto-formatted property page** — replaces the flat FactSheet with sectioned, responsive, print-friendly layout.

## Non-Goals

- **Not importing the real Excel values** — template ships blank; values entered in-app.
- Not a general password manager — no browser autofill, no external sharing, no credential sharing outside the portal.
- No per-section custom visibility toggles in v1 (fixed GM-own / corporate-all model).
- No secret rotation, expiry, or 2FA workflows in v1.
- No changes to the document queue, financials, or property files.

## Assumptions

- **Who fills it:** GMs fill/maintain their own property's values; admin/Strand can edit any property. (Mirrors the existing `canEdit` pattern.)
- Encryption key lives in a Cloudflare Worker **secret** (`CREDENTIALS_KEY`), never in source.
- Existing flat `property_facts` rows are preserved as a "Notes / Other" section (light migration), not discarded.

---

## User Stories

> Each story is sized for one session, with verifiable acceptance criteria.

### Story 1 — Data model + migration
Create the structured tables.
- `property_contacts`: id, property_id, category (`people`|`vendors`|`emergency_utility`), label (role/contact name, e.g. "Plumber"), contact_name, phone, mobile, email, account_number, fax, sort_order, is_custom, created_by, created_at, updated_at.
- `property_credentials`: id, property_id, label (system/vendor), account_number, username, password_ciphertext, password_iv, sort_order, is_custom, created_by, created_at, updated_at.
- Indexes on property_id.
**Acceptance:** migration applies cleanly to remote D1; both tables exist with the columns above; no impact on existing tables; schema.sql updated to match.

### Story 2 — Standardized template definition + apply
Define the canonical template in code (`lib/factsheet-template.ts`) from the two Excel lists (People: GM, Housekeeper; Vendors: alarm, cameras, landscaper, linen, guest supply, HD Supply, plumber, Onity locksmith, snow, laundry/vending, paint/drywall, HVAC, electrician; Emergency/Utility: police, electric, gas, fire alarm, fire dept, internet/phones, cable, water/sewer, backflow, trash; Credentials: Guest Supply, HD Supply, Expedia, Booking.com, Email, Computer, Onity key machine/programmer, desk phone VM, cell phone, BrightLocal, Craigslist, fire alarm code, security cameras, guest lock boxes). Apply blank rows to every active property; auto-apply on new-property creation.
**Acceptance:** running the apply action gives every active property the full template set with empty values; creating a new property auto-seeds it; re-running is idempotent (no duplicates).

### Story 3 — Contacts: view + edit on the property page
Render the three contact categories with their typed fields; inline edit/save for authorized users; "add custom row" per category; delete custom rows.
**Acceptance:** contacts render grouped by category with all fields; edit saves and persists; a GM can edit only their own property; empty fields show "—"; custom rows can be added/removed.

### Story 4 — Credentials vault: store + mask + reveal (audited)
Render credentials with password **masked** by default. A **Reveal** control calls `POST /api/credentials/:id/reveal`, which authorizes, decrypts server-side, returns the value, and writes an audit event. Create/edit encrypts the password (AES-GCM) before storing.
**Acceptance:** passwords never appear in the initial page HTML (masked only); clicking Reveal shows the value and writes an `audit_events` row (`credential.reveal`, with credential id + property); stored values are ciphertext in D1 (verified by querying the table); editing re-encrypts.

### Story 5 — Access control + verification
Enforce GM-own / corporate-all at the page guard, the contacts/credentials list queries, and the reveal endpoint (GM's property_id must equal the row's property_id; admin/Strand unrestricted) — mirroring the documents-download pattern.
**Acceptance:** a GM cannot load or reveal another property's contacts/credentials (returns not-available); admin/Strand can; every reveal is audited; attempts on a foreign property are blocked at the API even with a guessed id.

### Story 6 — Property-page formatting + polish
Lay the sheet out as clean sections (People / Vendors / Emergency & Utilities / Credentials / Notes), responsive and print-friendly, replacing the flat FactSheet on `my-property.astro` and `admin/properties/[id].astro`.
**Acceptance:** property page shows the five sections in order; mobile-readable; a "Print fact sheet" view renders the binder cleanly (credentials masked unless revealed); existing `property_facts` appear under Notes.

---

## Technical Considerations

- **Encryption (D1 has no column encryption):** encrypt password values with **AES-GCM via WebCrypto** in the Worker before insert; store `password_ciphertext` + `password_iv`; key from Worker secret `CREDENTIALS_KEY`. Decrypt only in the reveal endpoint, server-side, returned over HTTPS to an authorized user. Never ship plaintext in page loads.
- **Reveal endpoint:** `POST /api/credentials/:id/reveal` → auth + ownership check → decrypt → return `{ value }` → write `audit_events` (`action='credential.reveal'`, detail = credential id + property). Rate-limit / log generously.
- **Audit:** reuse existing `audit_events`. Add `credential.reveal`, `credential.update`, `contact.update` actions.
- **Visibility:** reuse middleware gates; add per-row ownership checks in the new APIs exactly like `api/documents/[id]/download.ts` (GM query always `AND property_id = ?`).
- **Template:** canonical list in `lib/factsheet-template.ts`; an admin "apply template" action + auto-apply hook in property creation; idempotent (skip rows that already exist by property_id + label + category).
- **Migration of existing facts:** keep `property_facts`; surface them in a "Notes / Other" section so nothing is lost.
- **Reuse:** follow existing `property_facts` API/component patterns; split `FactSheet.astro` into `ContactsSheet`, `CredentialsVault`, and a `Notes` block.
- **Secrets:** add `CREDENTIALS_KEY` to the Worker (and document it) before Story 4 ships.

## Resolved (was: open questions)
- **AES key:** a single Worker secret (`CREDENTIALS_KEY`) is fine for one client. ✅ Confirmed.
- **Print fact sheet:** credentials stay **masked** in print — reveal is always per-credential + audited, never bulk. ✅ Confirmed.

## No-duplication rule (important)
The property record + **Overview tab already hold the property's own identity and front-desk contact** — address, room count, **front-desk phone, fax, 24/7 GM cell (`emergency_phone`), property email**. The Fact Sheet must **not** re-capture these. Scope:
- **Vendors** and **Emergency & Utilities** → NEW (the bulk of the value).
- **Key People** → only roles NOT already on the record (e.g. Housekeeper, Maintenance). The **GM is shown read-only, pulled from the assigned user/property record** — not re-entered.
- The Fact Sheet lives in the **existing "Fact Sheet" tab** (today's flat facts), which this upgrades; the flat facts move to the **Notes** section.

## Out of this PRD (future)
- QA digital inspection, Chorum daily-report feed, Acumatica, Engage/isolved PTO — tracked separately in CRM project 39 (#229–231, QA).
