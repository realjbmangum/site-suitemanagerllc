# Proposal Copy — Suite Manager Document Portal
> For pasting into the Ascend Systems proposal generator (`/admin/proposals/new`).
> Recipient: Suite Manager LLC (Chris Rutherford). Date: May 19, 2026.

The proposal page now renders Markdown-lite: `- ` becomes a bullet, blank lines
break paragraphs, `**text**` becomes bold. Paste each field exactly as written.

---

## Title
```
Suite Manager Document Portal — Build & Hosting
```

## Recipient
Client → Suite Manager LLC (or Lead, if Chris isn't a client record yet)

## Pricing Model
```
Fixed Fee
```

## Total Amount (USD)
```
9500
```

---

## Intro
```
Suite Manager LLC's general managers currently send invoices and operating documents to Strand by email, one message at a time. Strand's accounting team has no reliable way to tell which property a document came from, what it is, or whether anything is still outstanding.

This Statement of Work covers a branded document portal, built into the Suite Manager website, that replaces the email flow with one organized, searchable system — a simple upload screen for general managers and a single back-office dashboard for Strand and Suite Manager.
```

## Scope
```
This engagement covers the design, build, configuration, and launch of a document portal under the Suite Manager brand:

- A branded upload portal hosted on a Suite Manager subdomain, carrying the Suite Manager identity end to end
- Individual logins for each general manager, scoped to their own property
- A guided upload screen — drag-and-drop file, category, vendor, amount, and an optional note
- Secure file storage in Cloudflare infrastructure tied to Suite Manager's account
- A back-office dashboard for Strand and Suite Manager to view, filter, search, review, assign, and download every document
- Automatic email notifications routed to the correct team when a document is uploaded
- Role-based access, including a separate, restricted view for HR documents
- A full audit log recording every upload and download
```

## Deliverables
```
- **GM upload portal** — branded login and upload screen, live on a Suite Manager subdomain
- **Back-office dashboard** — filterable, searchable document table with review, assignment, notes, and archive actions
- **Document storage** — a Cloudflare R2 bucket organized by property and category, encrypted at rest
- **Notification system** — automated routing emails to Accounting and HR
- **Access control** — per-GM accounts, Strand and admin roles, and HR-document siloing
- **Audit log** — an exportable record of every upload and download, with user and timestamp
- **Data-handling policy** — a one-page written policy covering the storage of sensitive HR documents
- **Handover** — account credentials, an admin walkthrough, and 30 days of post-launch support
```

## Out of Scope
```
The following are not part of this engagement. Each can be quoted separately as a change order:

- Electronic signature on documents
- Vendor certificate-of-insurance tracking
- Automated retention scheduling or document purging
- Accounting-software or payment-system integrations
- White-labeling the portal for Suite Manager's own sub-clients
- Migration of historical documents predating launch
```

## Timeline
```
2–3 weeks from signed agreement and receipt of the property and user list. Delivered in a single milestone.
```

## Price Summary
```
This engagement is priced as a one-time fixed fee for the build, plus a recurring monthly fee for hosting and support.

**One-time build — $9,500.** Covers the complete portal: the GM upload screens, the back-office dashboard, document storage, notifications, access control, the audit log, branding, and launch.

**Monthly hosting & support — $35 per property, ten-property minimum.** Billed at $350 per month at the current property count. This covers Cloudflare hosting and storage, transactional email, security updates, audit-log retention, backups, and email support with a one-business-day response.

The monthly fee scales automatically as Suite Manager adds properties — no change order is required to bring a new property onto the portal.
```

## Payment Schedule
```
- **$4,750 due on signing** — 50% of the one-time build fee, to schedule and begin work
- **$4,750 due on acceptance** — the remaining 50%, due when the portal is delivered and accepted
- **Monthly hosting & support** begins on the launch date and is billed monthly in advance

Invoices are due within 14 days of receipt.
```

## Client Responsibilities
```
To keep the project on schedule, Suite Manager will provide:

- The list of properties and the general managers for each, with names and email addresses, before work begins
- The destination email addresses for Accounting and HR notifications
- Confirmation of the portal subdomain (for example, docs.suitemanagerllc.com)
- Access to the existing Suite Manager website and domain settings, or a point of contact who can grant it
- Timely review and feedback at the delivery milestone, within five business days
- A single point of contact authorized to approve decisions and sign off on acceptance
```

## Acceptance Criteria
```
The portal is considered delivered and accepted when:

- A general manager can log in and upload a categorized document in under a minute
- Uploaded documents appear in the back-office dashboard, correctly tagged by property and category
- Notification emails are delivered to the correct team on upload
- HR documents are visible only to authorized roles and excluded from the general accounting view
- Every upload and download is recorded in the audit log
- The portal is live on the agreed Suite Manager subdomain with Suite Manager branding

Suite Manager will confirm acceptance in writing within five business days of delivery. Items outside the agreed scope are handled as a separate change order.
```

---

*Source: PRD-document-portal.md. Created May 19, 2026.*
