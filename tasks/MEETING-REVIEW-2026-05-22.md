# Meeting Review — Document Portal Discussion
> Date: May 22, 2026 · Working doc for the Tuesday (May 27) follow-up
> Source: `app-suitemanager/data/Meeting Notes/` transcript

---

## Attendees

| Person | Role |
|---|---|
| Chris Rutherford | Owner / principal, Suite Manager |
| Megan Previc | Strand — accounting / AP (led the call) |
| Julie | Strand — HR (poor audio; transcript mislabels some of her lines as Megan) |
| Annette Bingham | Prior management company — brought in for input; now a test user |
| Mike Lindsay | Prior management company — brought in for input; now a test user |
| Brian Mangum | Ascend Systems (us) |

## External systems in play

The portal is becoming the connective tissue between three systems:

| System | What it is | Portal relationship |
|---|---|---|
| **Acumatica** | Strand's accounting / ERP. AP approvals already run here. | **Phase 2** — portal feeds invoices in; approvals stay in Acumatica |
| **Jonas Quorum** | The hotel PMS. Source of daily + month-end numbers (ADR, occupancy, historicals). The `code` column on the property roster = Quorum property codes. | **Phase 2 / later** — pull reporting data in |
| **Engage** | HR system. Owns I-9s, W-4s, onboarding, E-Verify. | Out of scope — sensitive HR never touches the portal |

---

## Feature requests from the meeting

### Accounting / invoicing (Chris: "it'll lean accounting")
1. **Approval workflow with dollar thresholds** — small invoices auto-flow; over $X → Annette/Mike; over $Y → Chris. Auto "approval waiting" trigger.
2. **Acumatica integration** — portal = "the brain," with an "artery" to Acumatica. Invoices captured in the portal feed into Acumatica; approvals stay in Acumatica.
3. **Auto-draft items** — utility bills / consumption / anything auto-paid that isn't a hand-entered invoice. Capture method unresolved — likely tied to the Acumatica feed.
4. **Excel export** of the document queue (vendor, amount, invoice #, etc.).
5. **Invoice number field** — referenced as an export column; not captured on the upload form today.

### Quorum / reporting
6. **Pull daily + month-end numbers from Quorum** (ADR, occupancy, historicals) so Chris sees cross-property trends without digging through daily emails.

### Property page → "State of the Union" CRM
7. **Master / fact sheet per property** — fire-system passwords, alarm codes, utility company + account numbers, "how to access the cameras" instructions. Replace the paper hodgepodge.
8. **Property document library** — fire inspection reports, recent QA reports, licenses, permits, contracts (e.g. linen contracts). Expands document categories well beyond invoice/statement/other.

### Resources cleanup
9. **Collapse "Resources" and "HR Templates" into one.** Rename "HR Templates" → "Resources"; drop the duplicate; organize by folders (Operational / Accounting / HR).

### Accountability
10. **Weekly usage reporting** — who's uploading, who's not.

## Confirmations (validated — no change)

- HR stays minimal — templates only, no sensitive data. Engage owns all real HR.
- GMs see only their own property.
- Payment-status feature and GM property page landed well; drag-and-drop fix confirmed by Megan.

---

## Decisions (Brian, May 22)

| # | Decision |
|---|---|
| 1 | **Acumatica is Phase 2** — separate PRD, separate cost to Chris. Research together later; do not build now. The next sprint builds a **standalone in-portal approval workflow** that a Phase 2 effort later wires to Acumatica. |
| 2 | **Approval threshold: mock at $500** for now (invoices ≥ $500 enter an approval queue). Make it configurable. Chris to confirm the real figure(s). |
| 3 | **Fact sheet visibility:** that property's GM (their property only) + all Strand + Chris/admins. |
| 4 | **Quorum integration is Phase 2 / later** — same as Acumatica. Research API access + cost, plus our labor estimate to wire it. |
| 5 | **Annette & Mike added as admins** (done). **Lynn & Lisa (GMs — Graham, Gastonia) blocked** — the property roster Chris sent lists GMs incorrectly. Chris must review/correct the roster before GM accounts are created. |
| 6 | **Next-sprint order agreed** (see Phase 1 below). |

---

## Phasing

### Phase 1 — next sprint (no external integrations)
- **Quick wins:** rename/merge Resources + HR Templates into one "Resources"; add an invoice-number field; Excel export of the document queue.
- **In-portal approval workflow** — threshold-based ($500 mock, configurable), approval queue, "approval waiting" indicator.
- **Property fact sheet** — master data per property (codes, utility accounts, access instructions), scoped per decision #3.
- **Expanded property document library** — inspections, QAs, licenses, permits, contracts.

### Phase 2 — separate PRD + pricing
- **Acumatica integration** — invoice feed + approval hand-off.
- **Jonas Quorum integration** — daily/month-end reporting data.
- Each needs: API access confirmed, API cost determined, our labor estimate to Chris.

---

## Action items

### Chris
- Review and correct the **property roster** (GM names are wrong — blocks Lynn/Lisa and any GM onboarding). Also still owes: Harrisonburg `code` confirmation, the 6 properties missing state.
- Confirm the **approval threshold** dollar figure(s) and routing tiers.
- Decide the **app name**.
- Get the team **Acumatica access** so Phase 2 can be scoped.

### Brian
- Send portal invites — Annette & Mike done; Lynn & Lisa pending the roster fix.
- Research **Acumatica API** — access model + cost (Phase 2).
- Research **Jonas Quorum API** — access model + cost (Phase 2).
- Estimate **labor cost** to wire each integration; fold into the Phase 2 PRD + quote.

### Next checkpoint
- **Tuesday, May 27** — everyone tests, sends feedback to Brian.

---

## Open questions for Chris (Tuesday)

- Approval threshold dollar figure(s) and the routing tiers (who approves what band).
- How should **auto-draft / utility** items get captured — manual entry in the portal, or wait for the Acumatica feed?
- App name.
- Confirm corrected property roster + GM list.
