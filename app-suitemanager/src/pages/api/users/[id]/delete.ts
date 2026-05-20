import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// POST /api/users/:id/delete — admin removes a user (and their sessions).
// Documents and audit events keep the original user_id (orphaned), preserving
// the historical record.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (locals.user?.role !== 'admin') {
    return bounce(request, 'forbidden');
  }
  const id = params.id;
  if (!id) return bounce(request, 'missing id');
  if (id === locals.user.id) {
    return bounce(request, "You can't delete your own admin account.");
  }

  const target = await env.DB
    .prepare('SELECT id, email FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string }>();
  if (!target) return bounce(request, 'User not found.');

  // Clean sessions, then delete the user. Documents/audit_events retain
  // the user_id as historical reference.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);

  await logAudit(env.DB, locals.user.id, 'user.delete', {
    detail: `removed ${target.email}`,
  });

  const back = new URL('/admin/users', request.url);
  back.searchParams.set('deleted', target.email);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/users', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
