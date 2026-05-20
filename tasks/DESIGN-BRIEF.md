# Design Brief — Suite Manager Document Portal
> Status: DRAFT (v2) | Date: May 20, 2026 | Owner: Brian Mangum (Ascend Systems)
> Companion to: `tasks/PRD-document-portal.md`
> v2 change: HR upload removed; HR Resources library added. Categories simplified.

---

## 1. Brand Posture

The portal must read as a **continuation of suitemanagerllc.com**, not a separate app. When a GM logs in, the navy header and brass underline should feel like they walked from the marketing site into the product. This is the whole point of choosing a branded build over Dropbox — every screen reinforces that Chris runs a real operation.

Posture: **calm, organized, trustworthy.** This is a back-office tool handling money and employee paperwork. It should feel like a well-run filing system — never flashy, never playful. Confidence through restraint.

---

## 2. Visual System

### Color (client-supplied)
| Token | Hex | Use |
|---|---|---|
| Primary / navy | `#1D1D33` | Header bar, primary text, footers |
| Accent / brass | `#BB945C` | Underlines, primary buttons, active states, brand mark |
| Surface | `#FFFFFF` | Cards, table background |
| Canvas | `#F5F4F1` | Page background (warm off-white) |
| Border / hairline | `#E5E3DE` | Table rows, card edges |
| Muted text | `#6B6B78` | Secondary labels, timestamps |

### Category pill colors (consistent on EVERY screen)
| Category | Color |
|---|---|
| Invoices | Brass `#BB945C` |
| Statements | Navy `#1D1D33` |
| Other | Slate `#6B6B78` |
| Resources (folder chip) | Muted plum `#7A5C73` |

Pills are the primary scanning device — once Strand's team uses the portal twice, they scan color, not text.

### Status signals
- **Pending review:** brass-tinted row background (`#BB945C` at ~10% opacity) + brass dot. The "look here first" cue.
- **Reviewed:** no emphasis — recedes.
- **Archived:** muted, lower opacity.

### Typography
Match the marketing site: serif display for headings (e.g. DM Serif Display), Inter for body and all UI/table text. Tables and forms use Inter exclusively — serif is for page titles and section headers only.

### Layout & spacing
- Generous whitespace; this is a data tool, not a dense console.
- 8px spacing grid.
- Navy header bar with the Suite Manager mark top-left and a 2–3px brass underline.
- Cards: white surface, 1px hairline border, subtle shadow, ~8px radius.

---

## 3. Voice & Tone

- Plain, functional microcopy. "Upload a document," not "Submit your file to the portal."
- Confirmations are concrete: "Sent to Strand Accounting — they'll see it now."
- No exclamation points, no cleverness. Hotel GMs and accountants want clarity.

---

## 4. Key Screens

### 4.1 GM Upload View
The screen is built around **one job**: get a document out and confirm it landed. Sub-60-second flow, zero training.

- Navy header, brass underline, Suite Manager mark. Property name shown ("Hampton Inn Myrtle Beach") so the GM knows the context.
- Large drag-and-drop zone, center stage.
- Below it, a short form: Category buttons (Invoice · Statement · Other) · Vendor · Amount (shows for Invoices) · Note (optional).
- One prominent brass **Send to Strand** button.
- **Recent uploads strip** at the bottom — last few submissions, each showing which team received it. This kills the "did you get my invoice?" follow-up email.
- The GM sees only their own property. Minimal nav: Upload · Resources.

### 4.3 GM Resources View (NEW)
A read-only library, browsed by folder.

- Same navy header. Title: "HR Resources" with a one-line subhead ("Templates and forms from Strand HR — view or print").
- Left rail or top tabs of folders (Onboarding · Training · Policies · etc. — order set by HR).
- Right pane: a clean list of template cards. Each card: title, short description, file type icon, last-updated date, a **View** and a **Download** button.
- No upload affordance anywhere. The GM cannot mistake this for a place to send a file.
- Print-friendly: clicking View opens the PDF inline, with the browser's native print available.

### 4.4 HR Admin Templates View (NEW)
Karen's screen. Mirror of the Resources browse view with admin affordances.

- Folder management at the top: add/rename/reorder folders.
- Per-template row: title, description, file, version number, last-uploaded date, actions (Replace · Edit metadata · Archive).
- Drag-and-drop **Upload Template** affordance — only present for HR/admin roles.
- Replacing a template bumps the version number; the old file is archived but kept for the audit trail, not deleted.

### 4.2 Back-Office Dashboard (Strand + SM admin)
A controlled inbox the team actually wants to open.

- Navy header with the mark.
- **Tiles row:** Pending review (brass), Total documents, Storage used.
- **Filter + search bar:** property, category, vendor, date, amount, free-text.
- **Document table:** Property · Category pill · Vendor · Amount · Uploaded by · Date · Status · kebab.
- Pending-review rows get the brass tint — they float visually to the top of attention.
- **Kebab menu** per row: Download · Mark reviewed · Assign to teammate · Add internal note · Archive. Standard pattern, no learning curve.
- HR documents never appear in the Strand view — siloed at the data layer.

---

## 5. Responsive

- GM upload view: mobile-first — a GM may upload from a phone at the front desk. Drag-drop falls back to a tap-to-browse file picker.
- Dashboard: desktop-primary (accounting work). On narrow widths, filters and search stack to separate rows — acceptable, no horizontal scroll on the table; collapse low-priority columns instead.
- Touch targets ≥ 44px on the GM view.

---

## 6. Accessibility

- WCAG AA contrast. Navy-on-white and white-on-navy pass; verify brass `#BB945C` — use it for fills and borders, not small text on white (it fails AA at body sizes).
- Category is never color-only — pill always carries the text label.
- Visible focus states on all inputs, the drop zone, and buttons.
- Form fields have real `<label>`s; the drop zone is keyboard-operable.

---

## 7. What To Throw Out

- No dashboard "analytics" dressing — no charts, gauges, or vanity metrics. Three honest tiles only.
- No folder tree on the GM side. Category dropdown replaces it entirely.
- No multi-step upload wizard. One screen, one submit.
- No generic SaaS gradient/illustration aesthetic — this is Suite Manager's brand, navy and brass, end to end.

---

## 8. Reference

The mockups already produced in the client thread (GM upload view + Strand admin view, navy/brass palette, realistic hotel-vendor data: Cintas, Ecolab, Otis, Duke Energy, Spectrum) are the visual target. Build to match those.

---

*Created May 19, 2026. Companion to PRD-document-portal.md.*
