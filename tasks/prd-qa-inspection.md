# PRD — QA Inspection App ("Walk & Tap")

**Status:** Draft for build · **Author:** Brian Mangum (Ascend) · **Date:** 2026-06-20
**Where:** Module inside the Suite Manager Document Portal (`app-suitemanager`)
**Source:** `Docs(git-ignore)/ASA Quality Assurance (1).xlsx` (replaces the spreadsheet)

---

## Overview

Replace the ASA Quality Assurance spreadsheet with a **mobile-first inspection app** built into the Suite Manager portal. An ops leader walks a property with a phone, taps only what **fails** (everything starts as a pass), captures a photo on deficiencies, and submits. The app computes a **score**, writes it to the property (feeding the portal's history/trends), generates a **deficiency punch-list**, and spins up **follow-up work orders**. It works **offline** (autosaves on-device, syncs when signal returns), because the walk covers stairwells and back-of-house dead zones.

The QA score is the gatekeeper for GM bonus eligibility (90+ = eligible; 80+ = "safe zone" per the team), so accuracy, history, and an auditable record matter.

## Goals

1. **Fast mobile "walk & tap"** — assume-pass; the inspector taps only fails/N-A. Big touch targets, one section at a time, clear progress, minimal typing.
2. **Digitize the full checklist** — Exterior & Admin (Curb Appeal, Laundry/Gym, Courtyard, Storage/Housekeeping, Office-Lobby, Manager & Staff, Maintenance) + per-room inspections (Living Room / Kitchen / Bath / Bedroom) across a room sample.
3. **Scoring** — equal-weight: score = applicable items passed ÷ applicable items (N/A excluded) × 100, with per-section subtotals + overall. Snapshotted at submit.
4. **Offline-capable PWA** — conduct a full inspection with no connectivity; autosave locally; sync (submit + photo upload) when back online.
5. **Outputs** — write the score to the property (history + trends + group/region rollups); auto **punch-list** of fails; **follow-up tasks/work orders** (assignable, tracked to done); **photos** on fails.
6. **Data-driven template** — the checklist (sections/items) lives in the DB, admin-editable, versioned so past inspections keep their original items/scoring.

## Non-Goals (v1)

- Native iOS/Android apps (PWA only).
- Per-item weighting (equal weight in v1; schema reserves a `weight` for later).
- Real-time multi-inspector collaboration on one inspection.
- Auto-scheduling QA visits (the calendar can already log them; scheduling is a separate effort — CRM #223).
- GMs self-inspecting (QA is run by ops/admin; GMs get a read-only result).
- Changing existing portal features (documents, financials, fact sheet, calendar).

## Assumptions

- **Inspectors** = admin/strand (Chris, Mike, Mel). **GM** sees their property's latest score + punch-list read-only.
- Room **sample** is inspector-chosen per visit (enter room numbers; add as many as walked). Default prompts for a few; no fixed cap.
- Photos stored in the existing **R2** bucket; compressed client-side before upload.
- Reuses portal auth, the `properties` table, D1, and R2.

---

## User Stories (each ~one session)

### Phase 1 — Data model & template
**S1 — Schema + migration.** Tables: `qa_templates`, `qa_template_sections` (area: exterior_admin | room; title; sort), `qa_template_items` (section_id; text; scope: property | room; sort; weight default 1; active), `qa_inspections` (id, property_id, inspector_user_id, template_version, status: in_progress|submitted, started_at, submitted_at, score_pct, applicable_count, pass_count), `qa_inspection_rooms` (inspection_id, room_number, sort), `qa_responses` (inspection_id, template_item_id, room_id nullable, result: pass|fail|na, comment, photo_r2_key nullable), `qa_followups` (inspection_id, property_id, response_id, title, status: open|done, assigned_to, created_at, resolved_at). Indexes on property_id/inspection_id.
*AC:* migration applies to remote D1; all tables present; schema.sql updated.

**S2 — Seed template from the spreadsheet.** Parse the xlsx structure into `qa_template_sections`/`items` (Exterior & Admin sections + items; room sub-areas + items). Versioned (v1).
*AC:* the full checklist (every section + item from the sheet) exists as template rows, scoped property vs room; one active template version.

### Phase 2 — Inspection flow (mobile, online first)
**S3 — Start inspection.** Inspector picks a property (or deep-links from the property page), confirms/enters the rooms to inspect, creates an `in_progress` inspection (client-generated id for offline).
*AC:* a new inspection record + chosen rooms; resumes if one is already in progress for that property/inspector.

**S4 — Exterior & Admin checklist UI (mobile).** Section-by-section; each item defaults to **pass**; tap toggles **fail** (and reveals comment/photo) or **N/A**; sticky progress + running subtotal; large tap targets.
*AC:* every property-scope item is answerable; default pass with no taps; section progress + subtotal update live; autosaves each change.

**S5 — Per-room inspection UI.** For each sampled room, the room item-set (Living Room/Kitchen/Bath/Bedroom); swipe/next between rooms; per-room completion indicator.
*AC:* each room gets its own responses; can move between rooms; room progress shown.

**S6 — Scoring + submit.** Compute equal-weight score (applicable = pass+fail; pct = pass ÷ applicable × 100) per section and overall; on submit, snapshot score + counts onto the inspection and write the property's current score.
*AC:* score matches a hand calc on a sample; N/A excluded; submit flips status to submitted and updates the property score; submitted inspection is read-only.

### Phase 3 — Outputs
**S7 — Photos on fails.** Capture/select a photo on a failed item; compress client-side; upload to R2 (`qa/{inspectionId}/{responseId}`); thumbnail in the punch-list.
*AC:* a fail can carry a photo; it uploads (or queues offline) and renders on review.

**S8 — Deficiency punch-list + PDF.** Compile all fails (item, section/room, comment, photo) into a clean punch-list view; export/save a PDF to the property's records.
*AC:* punch-list lists exactly the fails; PDF saves to property records and is downloadable.

**S9 — Follow-up work orders.** Turn fails into `qa_followups` (assignable, status open→done, due date); list + resolve; show open count on the property.
*AC:* fails can become tracked tasks; assignee + status persist; resolving updates the count.

**S10 — Score history, trends & rollups.** A QA dashboard: per-property trend over time, best/worst, **group/region averages**, and the latest score surfaced on the property page (and the fact sheet header).
*AC:* dashboard shows trends + rollups; property page shows the latest QA score + date.

### Phase 4 — Offline PWA
**S11 — PWA shell + service worker.** Installable; cache the app shell + active template + selected property data for offline use.
*AC:* the inspection route loads with no network after first visit; "installable" on a phone.

**S12 — Offline inspection state.** Inspection responses + photos stored in IndexedDB; autosave; resume after closing the app; works fully offline.
*AC:* a complete inspection (incl. photos) can be done in airplane mode and persists across app restarts.

**S13 — Sync engine.** On reconnect, submit queued inspections + upload queued photos; idempotent (client ids); surface sync status + failures.
*AC:* an offline inspection syncs cleanly when online; re-sync is idempotent (no dupes); failures are visible + retryable.

### Phase 5 — Admin & access
**S14 — Template management.** Admin edits sections/items (add/edit/reorder/deactivate), bumping the template version; past inspections keep their version.
*AC:* admin can change the checklist without code; new inspections use the new version; old scores unchanged.

**S15 — Roles + GM read view.** Inspecting limited to admin/strand; GM sees their property's latest score + punch-list (read-only); access enforced at page + API.
*AC:* a GM cannot start/edit an inspection or see other properties; can view their own result.

---

## Technical Considerations

- **Module, not standalone:** lives in `app-suitemanager` (Astro + CF Pages + D1 + R2); mobile-first routes (e.g. `/qa`, `/qa/[inspectionId]`); reuses session auth + `properties` + `canAccessProperty`.
- **Offline = the hard part:** a service worker (Workbox or hand-rolled) caches shell + template + property; **IndexedDB** holds in-progress inspection state and photo blobs; a sync routine flushes on reconnect. Use **client-generated inspection + response ids** so offline records upsert idempotently. Photos compressed client-side (canvas) before R2 upload to handle phone-sized images + flaky uplinks.
- **Scoring snapshot + template versioning:** store `template_version` on each inspection and snapshot `score_pct/pass/applicable` at submit so later template edits never rewrite history.
- **Property score surfacing:** the property's "current QA score" = latest submitted inspection; show on the property Overview + fact-sheet header; trends/rollups in a QA dashboard. (Could later feed the GM bonus logic.)
- **Outputs reuse existing infra:** PDF punch-list saved as a property record (existing `property_files` / R2 pattern); follow-ups are a new lightweight table shown on the property page.
- **Weighting later:** keep `weight` on items (default 1) so the equal-weight v1 can become weighted without a migration.
- **Big build — sequence it:** Phases 1→2→3 deliver a usable online inspector + outputs; Phase 4 adds offline; Phase 5 hardens admin/roles. Ship and get Mike/Mel using it after Phase 3; layer offline on top.

## Open questions
- Confirm the **room sub-areas + item lists** in the ROOMS sheet (Living Room/Kitchen captured; verify Bath/Bedroom) when seeding S2.
- Should a **N/A** require a reason? (Default: no.)
- Bonus thresholds (90 eligible / 80 safe / 60 fireable) — surface as labels on the score?
