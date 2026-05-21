import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// POST /api/documents/:id/payment — Strand/admin records payment. Body: status, check_number, check_date
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return bounce(request, 'forbidden');
  }
  const id = params.id;
  if (!id) return bounce(request, 'missing id');

  const form = await request.formData();
  const status = String(form.get('status') || '').trim();
  if (status !== 'paid' && status !== 'unpaid') {
    return bounce(request, 'Invalid status');
  }
  const checkNumber = String(form.get('check_number') || '').trim() || null;
  const checkDate = String(form.get('check_date') || '').trim() || null;

  const doc = await env.DB
    .prepare('SELECT id, category, payment_status FROM documents WHERE id = ?')
    .bind(id)
    .first<{ id: string; category: string; payment_status: string }>();
  if (!doc) return bounce(request, 'not found');

  if (status === 'paid') {
    if (!checkNumber) return bounce(request, 'Check # is required to mark paid.');
    if (!checkDate) return bounce(request, 'Check date is required to mark paid.');
    await env.DB
      .prepare(
        `UPDATE documents
         SET payment_status = 'paid',
             check_number = ?,
             check_date = ?,
             paid_at = datetime('now'),
             paid_by = ?
         WHERE id = ?`
      )
      .bind(checkNumber, checkDate, user.id, id)
      .run();
    await logAudit(env.DB, user.id, 'payment.mark', {
      documentId: id,
      detail: `paid · check #${checkNumber} · ${checkDate}`,
    });
  } else {
    // Reopen — clear payment fields.
    await env.DB
      .prepare(
        `UPDATE documents
         SET payment_status = 'unpaid',
             check_number = NULL,
             check_date = NULL,
             paid_at = NULL,
             paid_by = NULL
         WHERE id = ?`
      )
      .bind(id)
      .run();
    await logAudit(env.DB, user.id, 'payment.unmark', { documentId: id });
  }

  const referer = request.headers.get('referer') || `/dashboard/${id}`;
  return new Response(null, { status: 302, headers: { location: referer } });
};

function bounce(request: Request, msg: string): Response {
  const url = new URL(request.headers.get('referer') || '/dashboard', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
