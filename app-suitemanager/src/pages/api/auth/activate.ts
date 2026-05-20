import type { APIRoute } from 'astro';
import { hashPassword } from '../../../lib/crypto';
import { createSession, roleHome, sessionCookie, SESSION_TTL_SECONDS } from '../../../lib/session';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// POST /api/auth/activate — exchange an invite token for a real password.
// Form fields: token, password, confirm
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const form = await request.formData();
  const token = String(form.get('token') || '').trim();
  const password = String(form.get('password') || '');
  const confirm = String(form.get('confirm') || '');

  if (!token) return bounce(request, '', 'Invite token missing.');
  if (!password || password.length < 8) {
    return bounce(request, token, 'Password must be at least 8 characters.');
  }
  if (password !== confirm) {
    return bounce(request, token, 'Passwords do not match.');
  }

  const row = await env.DB
    .prepare(
      `SELECT id, role, invite_expires_at FROM users
       WHERE invite_token = ? AND active = 1`
    )
    .bind(token)
    .first<{ id: string; role: SessionUser['role']; invite_expires_at: string | null }>();

  if (!row) return bounce(request, token, 'This invite link is invalid or already used.');
  if (row.invite_expires_at && new Date(row.invite_expires_at) < new Date()) {
    return bounce(request, token, 'This invite link has expired — ask your admin for a new one.');
  }

  const hash = await hashPassword(password);
  await env.DB
    .prepare(
      `UPDATE users SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL
       WHERE id = ?`
    )
    .bind(hash, row.id)
    .run();

  const { token: sessionToken } = await createSession(env.DB, row.id);
  await logAudit(env.DB, row.id, 'user.activate');

  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 302,
    headers: {
      'set-cookie': sessionCookie(sessionToken, SESSION_TTL_SECONDS, secure),
      location: roleHome(row.role),
    },
  });
};

function bounce(request: Request, token: string, msg: string): Response {
  const url = new URL(token ? `/invite/${token}` : '/login', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
