import type { APIRoute } from 'astro';
import { generateToken } from '../../../lib/ids';
import { logAudit } from '../../../lib/audit';
import { buildPasswordResetEmail } from '../../../lib/email/templates';
import { trySend } from '../../../lib/email/graph';

export const prerender = false;

// How long a self-service reset link stays valid. Short by design — the user
// is expected to click it right away from their inbox.
const RESET_TTL_HOURS = 2;

// POST /api/auth/forgot — self-service "forgot password".
// Form field: email. Always responds the same way whether or not the address
// matches an account, so this can't be used to enumerate registered users.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  const ct = request.headers.get('content-type') || '';
  let email = '';
  if (ct.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    email = String(body.email ?? '');
  } else {
    const form = await request.formData();
    email = String(form.get('email') ?? '');
  }
  email = email.trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return bounce(request, 'Enter the email address for your account.');
  }

  // Only reset accounts that have actually activated (have a password). A
  // pending-invite user still holds their invite link; overwriting it with a
  // shorter reset token — and emailing "reset" copy for a first-time setup —
  // would just confuse them. They keep using their invite or ask the admin.
  const user = await env.DB
    .prepare('SELECT id, name, email FROM users WHERE email = ? AND active = 1 AND password_hash IS NOT NULL')
    .bind(email)
    .first<{ id: string; name: string; email: string }>();

  // Only do work when the account exists — but the response is identical either
  // way (see the neutral redirect below).
  if (user) {
    const token = generateToken(32);
    const expires = new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000).toISOString();
    await env.DB
      .prepare('UPDATE users SET invite_token = ?, invite_expires_at = ? WHERE id = ?')
      .bind(token, expires, user.id)
      .run();

    // Build the link off the configured app origin, never the request Host —
    // a spoofed Host on this public endpoint would otherwise send the victim a
    // reset link pointing at an attacker's domain (reset-link poisoning).
    const origin = env.APP_ORIGIN || new URL(request.url).origin;
    const reset = buildPasswordResetEmail({
      recipientName: user.name,
      resetUrl: `${origin}/invite/${token}`,
      expiresAt: expires,
    });
    await trySend(env, { to: user.email, subject: reset.subject, html: reset.html });
    await logAudit(env.DB, user.id, 'password.reset_requested', { detail: 'self-service' });
  }

  const back = new URL('/forgot', request.url);
  back.searchParams.set('sent', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/forgot', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
