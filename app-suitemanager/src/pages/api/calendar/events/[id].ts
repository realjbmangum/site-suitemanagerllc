import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';
import { buildPtoDecisionEmail } from '../../../../lib/email/templates';
import { trySend } from '../../../../lib/email/graph';

export const prerender = false;

// POST /api/calendar/events/:id — approve | deny | delete
// Form fields:
//   action: 'approve' | 'deny' | 'delete'
//   reason: optional (used as approval_reason on deny, can also be set on approve)
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return bounce(request, 'unauthorized');

  const id = params.id;
  if (!id) return bounce(request, 'missing event id');

  const event = await env.DB
    .prepare(
      `SELECT e.id, e.owner_user_id, e.source, e.title, e.kind,
              e.starts_at, e.ends_at, e.approval_status, e.property_id,
              u.email AS owner_email, u.name AS owner_name,
              p.name AS property_name
       FROM calendar_events e
       LEFT JOIN users u ON u.id = e.owner_user_id
       LEFT JOIN properties p ON p.id = e.property_id
       WHERE e.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      owner_user_id: string;
      source: string;
      title: string;
      kind: string;
      starts_at: string;
      ends_at: string;
      approval_status: string;
      property_id: string | null;
      owner_email: string | null;
      owner_name: string | null;
      property_name: string | null;
    }>();
  if (!event) return bounce(request, 'Event not found.');

  const form = await request.formData();
  const action = String(form.get('action') || '').trim();
  const reason = String(form.get('reason') || '').trim() || null;

  // ── DELETE ─────────────────────────────────────────────
  if (action === 'delete') {
    // Owners can delete their own events. Admins can delete anything.
    const isOwner = event.owner_user_id === user.id;
    if (!isOwner && user.role !== 'admin') {
      return bounce(request, 'forbidden');
    }
    await env.DB.prepare('DELETE FROM calendar_events WHERE id = ?').bind(id).run();
    await logAudit(env.DB, user.id, 'calendar.delete', {
      detail: `${event.source} · ${event.title}`,
    });
    return redirect(request, event.source === 'gm_pto' && user.role === 'gm' ? '/my-property' : '/corporate/calendar?deleted=1');
  }

  // ── APPROVE / DENY ────────────────────────────────────
  if (action !== 'approve' && action !== 'deny') {
    return bounce(request, 'Unknown action.');
  }
  if (user.role !== 'admin') {
    return bounce(request, 'Only Suite Manager admins can decide PTO requests.');
  }
  if (event.source !== 'gm_pto' || event.approval_status !== 'pending') {
    return bounce(request, 'This event is not awaiting approval.');
  }
  if (action === 'deny' && !reason) {
    return bounce(request, 'A reason is required to deny PTO.');
  }

  const newStatus = action === 'approve' ? 'approved' : 'denied';
  await env.DB
    .prepare(
      `UPDATE calendar_events
         SET approval_status = ?,
             approval_reason = ?,
             decided_by = ?,
             decided_at = datetime('now'),
             updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(newStatus, reason, user.id, id)
    .run();

  await logAudit(env.DB, user.id, action === 'approve' ? 'pto.approve' : 'pto.deny', {
    detail: `${event.kind} · ${event.starts_at}→${event.ends_at} · ${event.owner_name || ''}`,
  });

  // Email the GM with the decision.
  if (event.owner_email) {
    const mail = buildPtoDecisionEmail({
      recipientName: event.owner_name || 'there',
      approved: action === 'approve',
      kind: event.kind,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      reason,
      decidedByName: user.name,
      propertyName: event.property_name || undefined,
    });
    await trySend(env, { to: [event.owner_email], subject: mail.subject, html: mail.html });
  }

  return redirect(request, '/corporate/calendar?decided=1');
};

function redirect(request: Request, path: string): Response {
  const back = new URL(path, request.url);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}

function bounce(request: Request, msg: string): Response {
  const ref = request.headers.get('referer');
  const u = new URL(ref || '/corporate/calendar', request.url);
  u.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: u.toString() } });
}
