# PRD — Suite Manager Document Portal
> Status: DRAFT (v2) | Date: May 20, 2026 | Owner: Brian Mangum (Ascend Systems) | Client: Chris Rutherford, Suite Manager LLC
> v2 change: HR scope reversed per Karen (Strand HR) — templates library only, no GM-uploaded HR docs in v1.

---

## 1. TL;DR

A branded document upload portal added to Suite Manager LLC's existing site. Hotel GMs log in, drag in invoices (and HR documents), tag them, and submit. Files land in a Cloudflare R2 bucket organized by property and category. Suite Manager's back-office and Strand's accounting team get a single dashboard to see, sort, search, review, and download everything in one place — replacing the current flood of forwarded emails.

**Why now:** Chris confirmed verbally he wants it. Strand (the firm that handles finances for all of Chris's hotels) is getting buried in invoice emails from property GMs with no organization. This portal turns that mess into one controlled, branded inbox.

---

## 2. Problem Statement

Hotel GMs currently email invoices and documents directly to Strand's accounting team. The result:

- Strand's inbox is bombarded — no way to tell which property sent which bill.
- No structure: invoices, statements, and HR paperwork all arrive mixed together.
- No confirmation loop — GMs re-email to ask "did you get it?"
- No audit trail of who sent what, when, or who downloaded it.

Chris needs the documents organized, routed, and searchable — without making non-technical hotel GMs learn another tool or remember a third-party login.

---

## 3. Goals & Non-Goals

### Goals
- Kill the invoice-email chaos for Strand's accounting team.
- Give GMs a sub-60-second upload flow with zero training.
- Keep everything branded as Suite Manager (navy `#1D1D33` / brass `#BB945C`) so it feels native to Chris's product.
- Store all files in infrastructure Chris owns (R2), tied to his account.
- Make the portal a sticky, recurring-revenue module — not a one-off favor.

### Non-Goals (v1)
- Electronic signature on documents (later upsell).
- Vendor COI tracking module (later upsell).
- Automated retention purge with audit certificate (later upsell).
- White-labeling the portal for Chris's own sub-clients (later upsell).
- Payment/AP processing — this routes documents, it does not pay invoices.

---

## 4. Users & Personas

| Persona | Who | What they do |
|---|---|---|
| **GM (uploader)** | e.g. Karen, Hampton Inn Myrtle Beach. Non-technical hotel manager. | Logs in, uploads invoices/HR docs for her property only, confirms receipt. |
| **Strand admin** | Strand accounting team (handles finances for all Chris's hotels). | Reviews every invoice/statement across all properties, downloads, marks reviewed. |
| **Suite Manager admin** | Chris / his back office. | Owns the system. Sees everything, manages properties, GM logins, and HR docs. |

**Auth model:** Per-GM login. Each GM gets their own credentials so every upload and download is attributable to a named user (required for the HR-document audit trail).

---

## 5. Jobs To Be Done

- *When a vendor invoice arrives at my hotel,* I (GM) *want to* get it to accounting in under a minute *so I can* stop forwarding emails and stop getting "did you get it?" replies.
- *When invoices come in from 10+ properties,* I (Strand) *want to* see them all sorted, tagged, and searchable in one screen *so I can* process payments without digging through inboxes.
- *When an auditor asks about an I-9,* I (Suite Manager) *want to* show who uploaded it, when, and who downloaded it *so I can* prove a clean chain of custody.

---

## 6. Solution Overview

### 6.1 GM Upload View
Single-purpose screen, Suite Manager branded:
- Drag-and-drop file area (PDF, JPG/PNG, Excel).
- Category dropdown: **Invoices · Statements · Other**.
- Vendor field (free text — e.g. Cintas, Ecolab, Otis, Duke Energy, Spectrum).
- Amount field (dollar figure, for invoices — lets Strand sort by amount without opening the PDF).
- Optional note field.
- Submit → confirmation.
- "Recent uploads" strip showing the GM's last submissions and which team received each (kills the follow-up email).
- GM sees **only their own property's** history.

### 6.2 Back-Office Dashboard (Strand + Suite Manager)
- Table of all documents across all properties.
- Color-coded category pills (Invoices / Statements / HR / Other), consistent on every screen.
- Filters + search (property, category, vendor, date, amount).
- Pending-review tile — flags items needing eyes before payment (size threshold, suspicious file type, or GM-set tag).
- Storage-usage tile.
- Per-row kebab menu: Download · Mark reviewed · Assign to teammate · Add internal note · Archive.
- Every download logged with user + timestamp.

### 6.3 HR Resources Library (NEW — Karen's ask, May 20)
A **one-way distribution** library, opposite direction from the upload flow.
- HR admin (Karen at Strand HR) uploads template documents — onboarding packets, blank I-9s, handbook excerpts, training sign-offs, anything GMs need to print.
- GMs see a "Resources" tab in the portal, organized by HR-defined folders.
- GMs can **view and download** templates. GMs cannot upload here.
- HR upload-of-completed-forms is **out of scope** for v1 — Engage (Strand's HR system) is expected to handle that. Revisit only if Engage falls through.

### 6.4 Routing & Notifications
- On submit, files are stored in R2, organized server-side by property and category.
- Email notification fires to Strand Accounting for Invoices/Statements; Other routes to SM admin.
- No HR upload notifications — HR upload flow is out of scope in v1.

### 6.5 Access Control
- Per-GM logins, scoped to a single property.
- Strand role: sees Invoices/Statements across all properties; sees Resources read-only.
- HR admin role: uploads/manages Resources; does **not** see GM uploads (Engage handles their inbound flow).
- Suite Manager admin: full access, manages properties and GM accounts.

---

## 7. Technical Approach

| Area | Decision |
|---|---|
| Host | `app.suitemanagerllc.com` — standalone Astro app, separate from the marketing site |
| Storage | Cloudflare R2 bucket — encryption at rest, free egress, organized by property/category |
| App | Standalone Astro + Cloudflare Pages project (`app-suitemanager/`); not bundled into the marketing site |
| Auth | Per-GM login (sessions). Property scoping enforced server-side |
| Email | Transactional email service for routing notifications |
| Audit log | Every upload + download recorded (user, timestamp, file) |
| Security | Forced HTTPS, encryption at rest (R2 default), audit trail, role-based access |

Use R2 **remote** bindings, never local (per project Cloudflare rules). Secret env vars are runtime-only, not build-time.

---

## 8. Security & Compliance

v1 sensitive-data exposure is **lower** than the original spec because GMs no longer upload completed HR forms (W-4s, I-9s). Strand HR will distribute *blank templates* through the Resources library — non-sensitive by themselves. Invoices remain the primary data; vendor info is commercial, not personal.

- Encryption at rest (R2) + forced HTTPS in transit.
- Role-based access; Resources library separated from GM uploads.
- Full audit log of uploads and downloads.
- **Still required:** a one-page data-handling / processor agreement before launch. Even with reduced HR exposure, invoices include vendor account numbers; templates that HR uploads may include policy text not meant to be public. Protects Brian if anything is mishandled.
- Retention: v1 keeps everything; auto-purge is a later module.

---

## 9. Pricing (for the proposal, not the build)

- **One-time build:** $9,500
- **Monthly:** $35 per property per month, 10-property minimum (Strand alone ≈ $490/mo at current count)
- First-year illustration: $9,500 build + ~$4,200 hosting ≈ $13,700
- Staged upsells: e-signature ($1,500 + $50/property/mo), COI tracking ($2,500 setup), retention auto-purge ($1,500), white-label ($3,500).

---

## 10. Build Order

1. Scaffold Astro app at `app.suitemanagerllc.com` — Pages + D1 + R2 bindings.
2. R2 bucket + property/category folder convention.
3. Auth — per-GM login, property scoping.
4. GM upload view — drag-drop, category (Invoice/Statement/Other), vendor/amount/note, submit, confirmation, recent-uploads strip.
5. Server-side storage routing into R2.
6. Email notification routing (Strand Accounting / SM admin).
7. Back-office dashboard — table, category pills, filters/search.
8. Pending-review logic + storage tile.
9. Row actions — download, mark reviewed, assign, note, archive.
10. **HR Resources library** — HR admin upload UI, folder organization, GM read-only browse/download view.
11. Audit log (upload + download events).
12. Role-based access — Strand scope, HR-admin scope (Resources only), SM admin.
13. Branding pass — navy/brass, Suite Manager mark throughout.

Estimated effort: 50–70 focused hours over 3 weeks (added scope for Resources library).

---

## 11. Success Criteria

- [ ] GM can upload a tagged document in under 60 seconds with no training.
- [ ] GM can browse and download an HR template in under 30 seconds.
- [ ] Portal live at `app.suitemanagerllc.com`, fully branded.
- [ ] Strand sees all invoices/statements across properties in one searchable view.
- [ ] HR admin can upload, organize, and replace template documents.
- [ ] Every upload and download recorded in an audit log.
- [ ] Email routing delivers to the correct team on submit.
- [ ] Files stored in R2 under Chris's account.
- [ ] Processor agreement signed before launch.

---

## 12. Open Questions (Need Chris's Input)

- [x] ~~Subdomain choice~~ — confirmed: `app.suitemanagerllc.com`.
- [ ] Exact list of properties + GM names/emails for initial account setup.
- [ ] Strand's recipient email(s) for Accounting notifications.
- [ ] Karen's email (HR admin login) + any other HR admins.
- [ ] File size limits — confirm max (default 25 MB).
- [ ] Confirm final property count for the monthly quote.
- [ ] Who at Suite Manager signs the processor agreement.
- [ ] Initial template folder structure Karen wants (Onboarding, Training, Policies, etc.).

---

*PRD created May 18, 2026 from the Ascend Systems / Suite Manager client thread. Pending Chris's input on open questions.*
