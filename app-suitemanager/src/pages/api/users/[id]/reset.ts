import type { APIRoute } from 'astro';
import { generateToken } from '../../../../lib/ids';
import { logAudit } from '../../../../lib/audit';
import { buildPasswordResetEmail } from '../../../../lib/email/templates';
import { trySend } from '../../../../lib/email/graph';

export const prerender = false;

// Admin resets give a longer window than self-service, since the admin often
// hand-delivers the link (text/call) rather than the user clicking from email.
const RESET_TTL_HOURS = 24;

// POST /api/users/:id/reset — admin issues a password-reset link for a user.
// Reuses the invite-token / set-password flow. Best-effort emails the user;
// always shows the admin a copy-paste link so it works even if mail is down.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (locals.user?.role !== 'admin') return bounce(params.id, 'forbidden');

  const id = params.id;
  if (!id) return bounce(undefined, 'Missing user id.');

  const target = await env.DB
    .prepare('SELECT id, email, name, active, password_hash FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string; name: string; active: number; password_hash: string | null }>();
  if (!target) return bounce(id, 'User not found.');
  if (!target.active) {
    return bounce(id, 'This account is deactivated — reactivate it before resetting the password.');
  }
  if (!target.password_hash) {
    // Never activated: they already have an invite link. Resetting would just
    // swap that token for a "reset"-worded one. Point the admin at the invite.
    return bounce(id, "This user hasn't set a password yet — share their invite link instead.");
  }

  const token = generateToken(32);
  const expires = new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000).toISOString();
  await env.DB
    .prepare('UPDATE users SET invite_token = ?, invite_expires_at = ? WHERE id = ?')
    .bind(token, expires, id)
    .run();

  // Best-effort email — the copy-link banner on the admin page is the fallback.
  // Link is built off the configured app origin, not the request Host.
  const origin = env.APP_ORIGIN || new URL(request.url).origin;
  const reset = buildPasswordResetEmail({
    recipientName: target.name,
    resetUrl: `${origin}/invite/${token}`,
    expiresAt: expires,
    byAdmin: true,
    adminName: locals.user.name,
  });
  const emailed = await trySend(env, {
    to: target.email,
    subject: reset.subject,
    html: reset.html,
  });

  await logAudit(env.DB, locals.user.id, 'user.reset', {
    detail: `reset password link for ${target.email}${emailed ? ' (emailed)' : ' (email not sent)'}`,
  });

  // Don't put the live token in the redirect URL (browser history / Referer
  // leakage). The admin page reads it back from the DB and renders the link.
  const back = new URL(`/admin/users/${id}`, request.url);
  back.searchParams.set('reset', '1');
  back.searchParams.set('emailed', emailed ? '1' : '0');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(id: string | undefined, msg: string): Response {
  const path = id ? `/admin/users/${id}` : '/admin/users';
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.pathname + url.search } });
}
