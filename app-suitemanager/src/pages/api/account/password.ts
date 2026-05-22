import type { APIRoute } from 'astro';
import { verifyPassword, hashPassword } from '../../../lib/crypto';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// POST /api/account/password — the signed-in user changes their own password.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return bounce(request, 'unauthorized');

  const form = await request.formData();
  const current = String(form.get('current_password') || '');
  const next = String(form.get('new_password') || '');
  const confirm = String(form.get('confirm_password') || '');

  if (!current || !next || !confirm) return bounce(request, 'All fields are required.');
  if (next.length < 8) return bounce(request, 'New password must be at least 8 characters.');
  if (next !== confirm) return bounce(request, 'The new passwords do not match.');

  const row = await env.DB
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string | null }>();
  if (!row?.password_hash) return bounce(request, 'Your account has no password set.');

  const ok = await verifyPassword(current, row.password_hash);
  if (!ok) return bounce(request, 'Your current password is incorrect.');

  const hash = await hashPassword(next);
  await env.DB
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(hash, user.id)
    .run();
  await logAudit(env.DB, user.id, 'account.password');

  const back = new URL('/account', request.url);
  back.searchParams.set('saved', 'password');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/account', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
