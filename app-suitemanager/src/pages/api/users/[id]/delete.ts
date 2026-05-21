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

  // Audit events keep a NOT NULL FK to users(id), so we have to clear them
  // before the user row can be removed. Documents retain uploaded_by, which
  // would orphan once the user is gone — for now we delete those audit rows
  // and accept the loss of historical attribution. Long-term fix: soft-delete
  // (set active=0) instead.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM audit_events WHERE user_id = ?').bind(id),
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
