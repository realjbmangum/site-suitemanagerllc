# Microsoft Graph email — setup guide

> Click-along guide to authorize the portal to send email via Suite Manager's
> Microsoft 365. End result: 4 values — 3 you paste to Brian/Claude, 1 (the
> secret) you load yourself.

---

## Before you start

- Configured on **Suite Manager's** M365 tenant — the portal sends email *as*
  Suite Manager, not as you.
- Requires a **Global Administrator** on Suite Manager's M365. If that's not
  you: Chris grants the role temporarily, or screen-share with their M365 admin.
- Pick a **from-address** — a dedicated mailbox like `portal@suitemanagerllc.com`.
  Must be a real licensed mailbox (a shared mailbox works, no paid license needed).

## Step 1 — Open the admin center
`entra.microsoft.com` → sign in with the Suite Manager Global Admin account.

## Step 2 — Register the app
**Identity → Applications → App registrations → + New registration**
- Name: `Suite Manager Portal — Mail`
- Supported account types: *Accounts in this organizational directory only*
- Redirect URI: leave blank → **Register**

## Step 3 — Copy two IDs
From the app **Overview** page:
- **Application (client) ID**
- **Directory (tenant) ID**

## Step 4 — Grant the email permission
**API permissions → + Add a permission → Microsoft Graph → Application
permissions** → search **`Mail.Send`** → check → **Add permissions**.
Then **Grant admin consent for [Suite Manager]** → Yes. The `Mail.Send` row
must show a green **Granted** check.

## Step 5 — Create a client secret
**Certificates & secrets → Client secrets → + New client secret**
- Description: `Portal mail` · Expires: 24 months → **Add**
- **Copy the `Value` immediately** — shown once only.
- ⚠️ Calendar reminder ~22 months out to rotate it before it expires.

## Step 6 — Confirm the sender mailbox
Confirm `portal@suitemanagerllc.com` (or chosen address) exists as a licensed
mailbox at `admin.microsoft.com`. Create one if needed (shared mailbox is fine).

## Step 7 — Hand it back

| Value | Sensitive | Action |
|---|---|---|
| Directory (tenant) ID | No | paste to Claude |
| Application (client) ID | No | paste to Claude |
| Sender mailbox address | No | paste to Claude |
| Client secret **Value** | **Yes** | set it yourself (below) |

**Set the secret:** Cloudflare dashboard → Workers & Pages → `app-suitemanagerllc`
→ Settings → Variables and secrets → Add → Type **Secret** → Name
`GRAPH_CLIENT_SECRET` → paste Value → Save.

## Step 8 — (recommended, optional) Lock the app to one mailbox
`Mail.Send` app permission can send as ANY mailbox by default. Restrict it via
Exchange Online PowerShell:

```powershell
Connect-ExchangeOnline
New-ApplicationAccessPolicy -AppId <client-id> `
  -PolicyScopeGroupId portal@suitemanagerllc.com `
  -AccessRight RestrictAccess `
  -Description "Restrict portal app to the portal mailbox"
```

## What Claude wires once credentials exist
1. `src/lib/email/graph.ts` — client-credentials token + Graph `sendMail`
2. Invite emails (auto-send the link on new user)
3. Approval-request email to admins
4. Upload notifications to Strand

env vars added: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_SENDER_USER_ID`
(plain) + `GRAPH_CLIENT_SECRET` (secret).
