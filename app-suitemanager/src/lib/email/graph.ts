// Microsoft Graph mail sender — client-credentials flow.
// All sends are best-effort: callers should not let a mail failure break
// the underlying action (upload, invite, approval).

// Module-scoped token cache. Cloudflare keeps module globals alive across
// requests on the same isolate, so this avoids a token fetch per send.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(env: Env): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const tenant = env.GRAPH_TENANT_ID;
  const clientId = env.GRAPH_CLIENT_ID;
  const clientSecret = env.GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) return null;

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );
    if (!res.ok) {
      console.error('Graph token error', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  } catch (e) {
    console.error('Graph token fetch failed', e);
    return null;
  }
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendMail(
  env: Env,
  input: SendMailInput
): Promise<{ ok: boolean; error?: string }> {
  const sender = env.GRAPH_SENDER_USER_ID;
  if (!sender) return { ok: false, error: 'GRAPH_SENDER_USER_ID not set' };

  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .filter((a) => a && a.includes('@'))
    .map((address) => ({ emailAddress: { address } }));
  if (recipients.length === 0) return { ok: false, error: 'no valid recipients' };

  const token = await getToken(env);
  if (!token) return { ok: false, error: 'no Graph token (check GRAPH_* config)' };

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: 'HTML', content: input.html },
            toRecipients: recipients,
          },
          saveToSentItems: false,
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Graph ${res.status}: ${body.slice(0, 240)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'sendMail failed' };
  }
}

// Convenience: send and never throw. Returns whether it worked.
export async function trySend(env: Env, input: SendMailInput): Promise<boolean> {
  try {
    const r = await sendMail(env, input);
    if (!r.ok) console.error('Email not sent:', r.error, '→', input.subject);
    return r.ok;
  } catch (e) {
    console.error('Email send threw:', e);
    return false;
  }
}
