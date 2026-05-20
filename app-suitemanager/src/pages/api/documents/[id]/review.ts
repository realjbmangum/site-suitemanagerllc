import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// POST /api/documents/:id/review — flip status. Body: status=reviewed|new
// Strand/admin only.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return bounce(request, 'forbidden');
  }
  const id = params.id;
  if (!id) return bounce(request, 'missing id');

  const form = await request.formData();
  const next = String(form.get('status') || 'reviewed');
  if (next !== 'reviewed' && next !== 'new') {
    return bounce(request, 'bad status');
  }

  const doc = await env.DB
    .prepare('SELECT id, status FROM documents WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string }>();
  if (!doc) return bounce(request, 'not found');

  if (next === 'reviewed') {
    await env.DB
      .prepare("UPDATE documents SET status = 'reviewed', reviewed_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
    await logAudit(env.DB, user.id, 'review', { documentId: id });
  } else {
    await env.DB
      .prepare("UPDATE documents SET status = 'new', reviewed_at = NULL WHERE id = ?")
      .bind(id)
      .run();
    await logAudit(env.DB, user.id, 'reopen', { documentId: id });
  }

  // Preserve the query string the user was viewing.
  const referer = request.headers.get('referer') || '/dashboard';
  return new Response(null, { status: 302, headers: { location: referer } });
};

function bounce(request: Request, msg: string): Response {
  const url = new URL(request.headers.get('referer') || '/dashboard', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
