// Email templates for the Suite Manager Document Portal.
//
// Every template returns { subject, html, text }. Templates use table-based
// layout and inline styles for maximum email-client compatibility (Gmail,
// Outlook, Apple Mail). System font stack only — web fonts are unreliable
// in email.
//
// When Microsoft Graph mail is wired, the sender module will call these
// builders and POST the result to /users/{senderUserId}/sendMail.

const BRAND = {
  navy: '#1D1D33',
  brass: '#BB945C',
  brassLight: '#D7B687',
  cream: '#F5F4F1',
  text: '#1D1D33',
  muted: '#6B6B78',
  hairline: '#E5E3DE',
  // Logo loads from the marketing site (no Access gate) so inboxes can render it.
  logoUrl: 'https://suitemanagerllc.com/logo1.png',
};

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const ROLE_LABEL: Record<string, string> = {
  gm: 'general manager',
  strand: 'Strand accounting team member',
  hr: 'Strand HR team member',
  admin: 'Suite Manager admin',
};

export interface InviteEmailInput {
  recipientName: string;
  recipientEmail: string;
  role: 'gm' | 'strand' | 'hr' | 'admin';
  inviteUrl: string;          // absolute /invite/:token URL
  expiresAt: string;          // ISO date
  inviterName?: string;       // "Brian Mangum" — optional, defaults generic
  propertyName?: string;      // for GMs
}

export function buildInviteEmail(input: InviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName,
    recipientEmail,
    role,
    inviteUrl,
    expiresAt,
    inviterName,
    propertyName,
  } = input;

  const firstName = recipientName.split(/\s+/)[0] || recipientName;
  const roleLabel = ROLE_LABEL[role] || role;
  const inviter = inviterName ? `${inviterName} at Suite Manager` : 'Suite Manager';
  const expiresPretty = new Date(expiresAt).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Your Suite Manager portal invite`;

  // Plaintext fallback (some clients render this).
  const text = [
    `Hi ${firstName},`,
    ``,
    `${inviter} has invited you to the Suite Manager document portal as a ${roleLabel}${
      propertyName ? ` for ${propertyName}` : ''
    }.`,
    ``,
    `Set your password and sign in:`,
    inviteUrl,
    ``,
    `This link expires ${expiresPretty}. If it's no longer valid, reply to this email and we'll send a new one.`,
    ``,
    `Suite Manager LLC`,
  ].join('\n');

  // HTML body — table-based, inline styles, ~600px wide. Single CTA.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
  <!-- Pre-header (hidden in body but shown in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${BRAND.cream};opacity:0;">
    Set your password and access the Suite Manager document portal.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${BRAND.hairline};border-radius:14px;overflow:hidden;font-family:${FONT_STACK};color:${BRAND.text};">
          <!-- Brand bar -->
          <tr>
            <td align="center" style="background:${BRAND.navy};padding:28px 24px;border-bottom:2px solid ${BRAND.brass};">
              <img src="${BRAND.logoUrl}" alt="Suite Manager" width="180" style="display:block;width:180px;height:auto;filter:brightness(0) invert(1);" />
              <div style="margin-top:10px;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${BRAND.brassLight};">Document portal</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <h1 style="margin:0 0 4px 0;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.navy};">
                Welcome, ${escapeHtml(firstName)}.
              </h1>
              <p style="margin:16px 0 0 0;font-size:15px;line-height:1.6;color:${BRAND.text};">
                ${escapeHtml(inviter)} has invited you to the Suite Manager document portal as a <strong>${escapeHtml(roleLabel)}</strong>${
                  propertyName
                    ? ` for <strong>${escapeHtml(propertyName)}</strong>`
                    : ''
                }.
              </p>
              <p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:${BRAND.text};">
                Click the button below to set your password and sign in. The portal lets you send invoices to Strand accounting in under a minute and gives you one place to find HR templates.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:28px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background:${BRAND.navy};border-radius:8px;">
                    <a href="${inviteUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Set up your account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Plain URL fallback -->
          <tr>
            <td style="padding:12px 40px 0 40px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                Or paste this link into your browser:<br />
                <a href="${inviteUrl}" target="_blank" style="color:${BRAND.brass};word-break:break-all;">${escapeHtml(inviteUrl)}</a>
              </p>
            </td>
          </tr>

          <!-- Expiry note -->
          <tr>
            <td style="padding:24px 40px 36px 40px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.muted};">
                This invite expires on <strong style="color:${BRAND.text};">${escapeHtml(expiresPretty)}</strong>. If it's already expired, reply to this email and we'll send a new one.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 40px;background:${BRAND.cream};border-top:1px solid ${BRAND.hairline};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                Sent to ${escapeHtml(recipientEmail)} because Suite Manager invited you.
              </p>
              <p style="margin:6px 0 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                &copy; ${new Date().getFullYear()} Suite Manager LLC
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
