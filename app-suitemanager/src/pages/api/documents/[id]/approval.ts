import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// POST /api/documents/:id/approval — admin approves or denies an invoice.
// Form: decision = approve | deny ; reason (required on deny)
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return bounce(request, 'Only Suite Manager admins can approve invoices.');
  }
  const id = params.id;
  if (!id) return bounce(request, 'missing id');

  const form = await request.formData();
  const decision = String(form.get('decision') || '');
  const reason = String(form.get('reason') || '').trim() || null;

  if (decision !== 'approve' && decision !== 'deny') {
    return bounce(request, 'Invalid decision.');
  }
  if (decision === 'deny' && !reason) {
    return bounce(request, 'A reason is required to deny an invoice.');
  }

  const doc = await env.DB
    .prepare('SELECT id, approval_status FROM documents WHERE id = ?')
    .bind(id)
    .first<{ id: string; approval_status: string }>();
  if (!doc) return bounce(request, 'Document not found.');
  if (doc.approval_status !== 'pending') {
    return bounce(request, 'This invoice is no longer awaiting approval.');
  }

  const next = decision === 'approve' ? 'approved' : 'denied';
  await env.DB
    .prepare(
      `UPDATE documents
       SET approval_status = ?, approval_reason = ?,
           approval_decided_by = ?, approval_decided_at = datetime('now')
       WHERE id = ?`
    )
    .bind(next, reason, user.id, id)
    .run();

  await logAudit(env.DB, user.id, decision === 'approve' ? 'approval.approve' : 'approval.deny', {
    documentId: id,
    detail: reason || '',
  });

  // TODO(graph-mail): notify the GM + Strand of the decision.

  const referer = request.headers.get('referer') || '/dashboard?tab=approvals';
  return new Response(null, { status: 302, headers: { location: referer } });
};

function bounce(request: Request, msg: string): Response {
  const url = new URL(request.headers.get('referer') || '/dashboard?tab=approvals', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
